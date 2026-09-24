"""
The JSON behind a collectible's metadata_uri (posts/src/collectibles.py).

It is built once, right after the row is recorded, from what happened: the
event, the two people, the place and the date. Minting never changes it, so
an item reads the same before and after it's on Solana. Two things are added
when it's served:

- "Claimed later": Yes, once the row was minted more than 24 hours after it
  was recorded;
- a Proof of Meet's live selfie (the photo's hash and who took it). The
  image URL itself doesn't change: the meet card endpoint serves the photo
  while it's live and the v1 card otherwise, so a takedown needs nothing here.

URIs keep the existing families: POAPs and collected posts at
/api/v1/posts/<post id>/metadata/<edition>/ (the nft-service's /mint builds
exactly that), Proof of Meet at /meta/meet/<slug>/<user id>.json, one per
holder, since "Claimed later" is about one person's copy. Leaves minted by
Proof of Meet v2 keep /meta/meet/<slug>.json.
"""
import copy
import logging
from datetime import timedelta, timezone as dt_timezone

from django.conf import settings
from django.db import DatabaseError, transaction

from posts.models import Collectible, MeetPhoto
from user.src import og_image as og

logger = logging.getLogger("posts.collectibles")

Kind = Collectible.Kind

ONCHAIN_NAME_BYTES = 32  # Bubblegum's limit for the on-chain name
CLAIMED_LATER_AFTER = timedelta(hours=24)
DEFAULT_EDITIONS = 50
SITE_URL = "https://nextvibe.io"
MEET_TIER_NAMES = {"in_person": "In person", "peer_verified": "Peer verified", "organizer_verified": "Organizer verified"}


# ── URIs, names, images ──────────────────────────────────────────────────

def api_base() -> str:
    return settings.PUBLIC_API_URL.rstrip("/")


def post_uri(post_id, edition) -> str:
    """POAPs and collected posts: the URI the nft-service's /mint builds."""
    return f"{api_base()}/api/v1/posts/{int(post_id)}/metadata/{int(edition)}/"


def meet_uri(slug, user_id) -> str:
    return f"{api_base()}/meta/meet/{slug}/{int(user_id)}.json"


def meet_image(slug) -> str:
    """The meet card: the selfie while one is live, the v1 card otherwise."""
    return f"{api_base()}/api/v1/meet/{slug}/card.png?v=story"


def fit_bytes(text: str, limit: int = ONCHAIN_NAME_BYTES) -> str:
    """`text`, cut with "…" to at most `limit` UTF-8 bytes."""
    text = " ".join((text or "").split())
    if len(text.encode("utf-8")) <= limit:
        return text
    while text and len(f"{text}…".encode("utf-8")) > limit:
        text = text[:-1]
    return f"{text.rstrip()}…"


def event_title(event) -> str:
    return " ".join(((event.about if event else "") or "").split())[:140] or "Event"


def poap_name(event, edition) -> str:
    """"Superteam Ukraine Kyiv #12", shortened to fit the on-chain name."""
    suffix = f" #{int(edition)}"
    return fit_bytes(event_title(event), ONCHAIN_NAME_BYTES - len(suffix)) + suffix


def meet_name(a_username, b_username) -> str:
    return f"Proof of Meet — @{a_username} × @{b_username}"


def meet_onchain_name(a_username, b_username) -> str:
    """The metadata's name when it fits Bubblegum's 32 bytes; shorter forms otherwise."""
    for name in (meet_name(a_username, b_username), f"@{a_username} × @{b_username}", "Proof of Meet"):
        if len(name.encode("utf-8")) <= ONCHAIN_NAME_BYTES:
            return name
    return "Proof of Meet"


def media_url(media) -> str:
    """Public URL of a post's media file (legacy rows hold an absolute URL)."""
    name = str(media.file or "") if media is not None else ""
    return og.public_file_url(name) or ""


def post_image(post) -> str:
    if post is None:
        return ""
    return media_url(post.media.first())


# ── Building (once, right after the row is recorded) ─────────────────────

def build(row) -> dict:
    """The frozen JSON for a row, from the data the row was recorded with."""
    if row.kind == Kind.MEET:
        return _meet(row)
    if row.kind == Kind.POAP:
        return _poap(row)
    if row.kind == Kind.POST:
        return _collected_post(row)
    return _badge(row)


def _date_text(local) -> str:
    return f"{local:%b} {local.day}, {local.year}"


def _event_place(event):
    """(city, tzinfo) of an event's cell; (None, None) when unknown."""
    if event is None or not event.h3_geo:
        return None, None
    from posts.src import geocode

    city, country = geocode.place_for_cell(event.h3_geo)
    latlng = geocode.cell_latlng(event.h3_geo)
    tz = geocode.timezone_at(*latlng, country) if latlng else None
    return city, tz


def _poap(row) -> dict:
    event = row.post
    user = row.user
    city, tz = _event_place(event)
    zone = tz or dt_timezone.utc
    recorded = row.recorded_at.astimezone(zone)
    start = event.luma_event_start_time.astimezone(zone) if event and event.luma_event_start_time else recorded
    title = event_title(event)
    total = (event.total_supply if event and event.total_supply is not None else None) or DEFAULT_EDITIONS
    where = f" in {city}" if city else ""
    image = row.image_url
    attributes = [
        {"trait_type": "Type", "value": "POAP"},
        {"trait_type": "Event", "value": title},
        {"trait_type": "Date", "value": start.date().isoformat()},
        {"trait_type": "City", "value": city or "—"},
    ]
    if event is not None:
        attributes.append({"trait_type": "Organizer", "value": f"@{event.owner.username}"})
    attributes += [
        {"trait_type": "Attendee", "value": f"@{user.username}"},
        {"trait_type": "Edition", "value": f"{row.edition} of {total}"},
        {"trait_type": "Recorded", "value": recorded.date().isoformat()},
    ]
    data = {
        "name": row.name,
        "symbol": "NVIBE",
        "description": f"@{user.username} checked in at {title}{where} on {_date_text(recorded)}. "
                       f"Proof of attendance, recorded on NextVibe.",
        "image": image,
        "seller_fee_basis_points": 500,  # what /mint writes on-chain
        "attributes": attributes,
        "properties": {"files": [{"uri": image, "type": "image/jpeg"}], "category": "image"},
    }
    if event is not None:
        data["external_url"] = f"{SITE_URL}/u/post/{event.id}"
    return data


def _meet(row) -> dict:
    from posts.src.meet_card import local_time
    from posts.src.meets import TIER_LABELS, load_meet, meet_url

    slug = row.source_id
    meet = load_meet(slug, visible_only=False)
    image = meet_image(slug)
    if meet is None:
        return {
            "name": row.name, "symbol": "NVMEET", "image": image, "external_url": meet_url(slug),
            "attributes": [{"trait_type": "Type", "value": "Proof of Meet"}],
            "properties": {"category": "image", "files": [{"uri": image, "type": "image/png"}], "meet_slug": slug},
        }
    a, b = meet.people
    local = local_time(meet)
    recorded = local_time(meet, row.recorded_at)
    how = f"at {meet.event_name}" if meet.event_name else "in person"
    where = f" in {meet.city}" if meet.city else ""
    # The wallets the two people had when it was recorded (the leaves list
    # the wallets they have at mint time as their creators)
    wallets = _recorded_wallets(a.user_id, b.user_id)
    attributes = [
        {"trait_type": "Type", "value": "Proof of Meet"},
        {"trait_type": "Tier", "value": MEET_TIER_NAMES.get(meet.tier, TIER_LABELS.get(meet.tier, meet.tier))},
        {"trait_type": "Participant A", "value": a.username},
        {"trait_type": "Participant B", "value": b.username},
    ]
    attributes += [
        {"trait_type": f"Participant {letter} wallet", "value": wallets[person.user_id]}
        for letter, person in (("A", a), ("B", b)) if wallets.get(person.user_id)
    ]
    attributes += [
        {"trait_type": "City", "value": meet.city or "—"},
        {"trait_type": "Date", "value": local.date().isoformat()},
        {"trait_type": "Event", "value": meet.event_name or "—"},
        {"trait_type": "Pair meeting #", "value": meet.pair_count},
        {"trait_type": "Recorded", "value": recorded.date().isoformat()},
    ]
    return {
        "name": meet_name(a.username, b.username),
        "symbol": "NVMEET",
        "description": f"@{a.username} and @{b.username} met {how}{where} on {_date_text(local)}. "
                       f"Recorded by a phone-to-phone tap on NextVibe.",
        "image": image,
        "external_url": meet_url(slug),
        "attributes": attributes,
        "properties": {
            "category": "image",
            "files": [{"uri": image, "type": "image/png"}],
            "co_authors": [
                {"username": person.username, "wallet": wallets.get(person.user_id) or None, "role": letter}
                for letter, person in (("A", a), ("B", b))
            ],
            "meet_slug": slug,
        },
    }


def _recorded_wallets(*user_ids) -> dict:
    from user.models import User

    rows = User.all_objects.filter(user_id__in=user_ids).values("user_id", "wallet_address", "is_baned", "auth_provider")
    return {
        r["user_id"]: r["wallet_address"] or ""
        for r in rows if not r["is_baned"] and r["auth_provider"] != "deleted"
    }


def legacy_post_json(post, edition, absolute=None) -> dict:
    """The JSON collected posts have always had (PostMetadataView)."""
    media = post.media.first()
    image = ""
    if media is not None:
        name = str(media.file or "")
        image = name if name.startswith("https://res.cloudinary.com/") else media.file.url
        if image and not image.startswith("http"):
            image = absolute(image) if absolute else f"{api_base()}/{image.lstrip('/')}"
    return {
        "name": f"Post by @{post.owner.username} #{edition}",
        "symbol": "NVIBE",
        "description": post.about or f"Original post by @{post.owner.username} on NextVibe",
        "image": image,
        "seller_fee_basis_points": 500,
        "attributes": [
            {"trait_type": "Edition", "value": f"{edition} of {post.total_supply}"},
            {"trait_type": "Original Creator", "value": f"@{post.owner.username}"},
        ],
        "properties": {
            "files": [{"uri": image, "type": "image/jpeg"}],
            "category": "image",
        },
    }


def _collected_post(row) -> dict:
    post = row.post
    if post is None:
        return {"name": row.name, "symbol": "NVIBE", "image": row.image_url, "attributes": []}
    data = legacy_post_json(post, row.edition or 1)
    data["attributes"].append({"trait_type": "Recorded", "value": row.recorded_at.date().isoformat()})
    return data


def _badge(row) -> dict:
    image = row.image_url
    return {
        "name": row.name,
        "symbol": "NVOG",
        "image": image,
        "attributes": [
            {"trait_type": "Status", "value": "OG"},
            {"trait_type": "Edition", "value": f"{row.edition} of 25"},
            {"trait_type": "Recorded", "value": row.recorded_at.date().isoformat()},
        ],
        "properties": {"files": [{"uri": image, "type": "image/jpg"}], "category": "image"},
    }


def ensure(row, save=True) -> dict:
    """The row's frozen JSON, built now if it hasn't been yet."""
    if row.metadata:
        return row.metadata
    try:
        row.metadata = build(row)
    except Exception:
        logger.error("collectibles.metadata_failed id=%s kind=%s", row.pk, row.kind, exc_info=True)
        return {}
    if save and row.pk:
        Collectible.objects.filter(pk=row.pk, metadata={}).update(metadata=row.metadata)
    return row.metadata


# ── Serving ──────────────────────────────────────────────────────────────

def claimed_later(row) -> bool:
    return bool(
        row.status == Collectible.Status.MINTED and row.minted_at
        and row.minted_at - row.recorded_at > CLAIMED_LATER_AFTER
    )


def served(row) -> dict:
    """What metadata_uri answers: the frozen JSON plus the two live additions."""
    data = copy.deepcopy(ensure(row))
    if not data:
        return data
    attributes = data.setdefault("attributes", [])
    if row.kind == Kind.MEET:
        _add_selfie(row, data, attributes)
    if claimed_later(row):
        attributes.append({"trait_type": "Claimed later", "value": "Yes"})
    return data


def _add_selfie(row, data, attributes):
    photo = (
        MeetPhoto.objects.filter(meet_slug=row.source_id, status=MeetPhoto.Status.MINTED)
        .select_related("photographer").order_by("-created_at", "-id").first()
    )
    if photo is None:
        return
    attributes.append({"trait_type": "Selfie", "value": "Yes"})
    attributes.append({"trait_type": "Photographer", "value": photo.photographer.username})
    properties = data.setdefault("properties", {})
    properties["photo_sha256"] = photo.raw_sha256
    for item in properties.get("files") or []:
        item["type"] = "image/jpeg"


def row_for_post_leaf(post_id, edition):
    """The POAP or collected post behind /api/v1/posts/<id>/metadata/<edition>/, if recorded."""
    try:
        with transaction.atomic():
            return (
                Collectible.objects.filter(kind__in=(Kind.POAP, Kind.POST), source_id=str(int(post_id)), edition=edition)
                .select_related("user", "post", "post__owner").order_by("-id").first()
            )
    except DatabaseError:
        return None  # not migrated yet (deploy window): the JSON it has always had
