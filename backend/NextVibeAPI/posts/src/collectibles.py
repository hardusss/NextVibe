"""
Wallet-optional collectibles: everything someone holds from NextVibe, on
Solana or not yet (the Collectible model).

    check-in / tap ─▶ row, in the action's own transaction
        with a wallet ─▶ queued ─▶ minting ─▶ minted       (collectible_mint.py)
        without one   ─▶ offchain ── Claim, or connect a wallet ─▶ queued ─▶ …
                         failed (after 5 tries) ── Claim again ─▶ queued ─▶ …

No live action waits for a wallet: the check-in or the tap succeeds either
way, and from that moment the row is the item. Recording can never break the
action: it runs in a savepoint and a failure is only logged (the
backfill_collectibles command records anything that was missed).

Post collects still need a wallet. They're recorded already minted, only so
they show in the same tab. Connecting a wallet queues everything off-chain in
one batch (one push when it lands); a new wallet takes whatever isn't minted
yet, and minted items stay where they are. Unlinking the wallet returns
queued rows to off-chain.
"""
import logging
import time
from datetime import datetime, timezone as dt_timezone

from django.db import DatabaseError, transaction
from django.db.models import Case, Count, F, PositiveSmallIntegerField, Q, Value, When
from django.utils import timezone

from posts.models import Collectible, PendingClaim, Post, UserCollection
from posts.src import collectible_metadata as meta
from posts.src import realtime
from user.src import og_image as og

logger = logging.getLogger("posts.collectibles")

Kind = Collectible.Kind
Status = Collectible.Status

# The kinds our queue mints (post collects and badges are minted by their own flows)
MINTABLE = (Kind.POAP, Kind.MEET)
CLAIMABLE = (Status.OFFCHAIN, Status.FAILED)
UNMINTED = (Status.OFFCHAIN, Status.QUEUED, Status.FAILED)
PENDING = (Status.QUEUED, Status.MINTING)
KIND_LABELS = {Kind.POAP: "POAP", Kind.MEET: "Proof of Meet", Kind.POST: "Collected", Kind.BADGE: "Badge"}
FILTER_KINDS = {"poap": Kind.POAP, "meet": Kind.MEET, "post": Kind.POST, "badge": Kind.BADGE}
EXPLORER_URL = "https://solscan.io/token/{}"
PAGE_SIZE = 24
MAX_PAGE_SIZE = 60
# What a failed row says to its owner (the raw error stays in last_error)
FAILED_TEXT = "Couldn't put this on Solana"


class CollectibleError(Exception):
    def __init__(self, code, message, http=400):
        super().__init__(message)
        self.code, self.message, self.http = code, message, http


def is_deleted(user) -> bool:
    return user.auth_provider == "deleted" or not user.is_active


def can_receive(user) -> bool:
    """A wallet to mint to, on an account in good standing."""
    return bool(user.wallet_address) and not user.is_baned and not is_deleted(user)


def _initial(user, offchain=False):
    """(status, wallet) of a row recorded now. The backfill records everything off-chain."""
    if can_receive(user) and not offchain:
        return Status.QUEUED, user.wallet_address
    return Status.OFFCHAIN, ""


def _safely(what, fn, *args):
    """Record in a savepoint: a failure is logged and never breaks the action around it."""
    try:
        with transaction.atomic():
            return fn(*args)
    except Exception:
        logger.error("collectibles.record_failed what=%s", what, exc_info=True)
        return None


def _batch(origin) -> str:
    return f"{origin}:{int(time.time())}"


def _attempts_after_claim():
    """A claimed row that had failed gets its 5 tries back; a queued one keeps its count."""
    return Case(When(status=Status.FAILED, then=Value(0)), default=F("attempts"),
                output_field=PositiveSmallIntegerField())


# ── Recording (inside the action's transaction) ──────────────────────────

def record_poap(user, event, when=None, offchain=False):
    """
    The check-in's POAP. Its edition is taken now, so its metadata is final
    from the start, and counts in the event's minted_count like any edition.
    Returns the row, or None when every edition is taken.
    """
    return _safely("poap", _record_poap, user, event, when, offchain)


def _record_poap(user, event, when, offchain):
    row = Collectible.objects.filter(user=user, kind=Kind.POAP, source_id=str(event.id)).first()
    if row is not None:
        return row
    locked = Post.all_objects.select_for_update().get(pk=event.pk)
    legacy = UserCollection.objects.filter(user=user, post=locked).first()
    if legacy is not None:
        # Minted before this table existed
        return poap_from_ledger(legacy)
    total = locked.total_supply if locked.total_supply is not None else meta.DEFAULT_EDITIONS
    now = timezone.now()
    # In-flight collects of the same post hold the next editions (collect.py)
    pending = PendingClaim.objects.filter(post=locked, expires_at__gte=now).count()
    edition = locked.minted_count + pending + 1
    if edition > total:
        logger.info("collectibles.poap_sold_out user=%s event=%s total=%s", user.pk, locked.pk, total)
        return None
    status, wallet = _initial(user, offchain)
    row = Collectible.objects.create(
        user=user, kind=Kind.POAP, source_id=str(locked.id), post=locked,
        metadata_uri=meta.post_uri(locked.id, edition), name=meta.poap_name(locked, edition),
        image_url=meta.post_image(locked), edition=edition, recorded_at=when or now,
        status=status, wallet=wallet, batch=_batch("action") if wallet else "",
    )
    Post.all_objects.filter(pk=locked.pk).update(minted_count=F("minted_count") + 1)
    if not offchain:
        _after_commit([row.pk])
    logger.info("collectibles.recorded kind=poap id=%s user=%s event=%s edition=%s status=%s",
                row.pk, user.pk, locked.pk, edition, status)
    return row


def poap_from_ledger(collection):
    """A POAP minted before this table existed (UserCollection row) as a minted row."""
    post = collection.post
    row, _ = Collectible.objects.get_or_create(
        user=collection.user, kind=Kind.POAP, source_id=str(post.id),
        defaults=dict(
            post=post, metadata_uri=meta.post_uri(post.id, collection.edition),
            name=meta.poap_name(post, collection.edition), image_url=meta.post_image(post),
            edition=collection.edition, recorded_at=collection.minted_at or timezone.now(),
            status=Status.MINTED, wallet=collection.user.wallet_address or "",
            asset_id=collection.asset_id or "", signature=collection.signature or "",
            minted_at=collection.minted_at,
        ),
    )
    return row


def record_meet(slug, a, b, when=None, offchain=False, only=None):
    """
    Both people's Proof of Meet (A confirmed the tap). Returns the rows.
    `only` limits it to those user ids (the backfill leaves out deleted accounts).
    """
    return _safely("meet", _record_meet, slug, a, b, when, offchain, only) or []


def _record_meet(slug, a, b, when, offchain, only):
    when = when or timezone.now()
    rows = []
    for user, other in ((a, b), (b, a)):
        if only is not None and user.user_id not in only:
            continue
        status, wallet = _initial(user, offchain)
        row, created = Collectible.objects.get_or_create(
            user=user, kind=Kind.MEET, source_id=slug,
            defaults=dict(
                counterpart=other, metadata_uri=meta.meet_uri(slug, user.user_id),
                name=meta.meet_name(a.username, b.username), image_url=meta.meet_image(slug),
                recorded_at=when, status=status, wallet=wallet, batch=_batch("action") if wallet else "",
            ),
        )
        if created:
            logger.info("collectibles.recorded kind=meet id=%s user=%s slug=%s status=%s",
                        row.pk, user.pk, slug, status)
        rows.append(row)
    if not offchain:
        _after_commit([r.pk for r in rows])
    return rows


def record_collected(user, post, collection):
    """A post collect (always with a wallet), recorded already minted."""
    return _safely("post", _record_collected, user, post, collection)


def _record_collected(user, post, collection):
    now = timezone.now()
    row, created = Collectible.objects.get_or_create(
        user=user, kind=Kind.POST, source_id=str(post.id),
        defaults=dict(
            post=post, metadata_uri=meta.post_uri(post.id, collection.edition),
            name=f"Post by @{post.owner.username} #{collection.edition}", image_url=meta.post_image(post),
            edition=collection.edition, recorded_at=now, status=Status.MINTED,
            wallet=user.wallet_address or "", asset_id=collection.asset_id or "",
            signature=collection.signature or "", minted_at=now,
        ),
    )
    if created:
        _after_commit([row.pk])
    return row


def record_og_badge(user, og_mint):
    """The OG avatar cNFT (minted by its own flow, which needs a wallet)."""
    return _safely("badge", _record_og_badge, user, og_mint)


def _record_og_badge(user, og_mint):
    edition = og_mint.edition
    row, created = Collectible.objects.get_or_create(
        user=user, kind=Kind.BADGE, source_id="og",
        defaults=dict(
            metadata_uri=f"{meta.api_base()}/api/v1/posts/0/metadata/{edition}?isOg=true&userId={user.user_id}",
            name=f"NextVibe OG #{edition}/25", image_url=f"https://media.nextvibe.io/og-avatar-{edition}.jpg",
            edition=edition, recorded_at=og_mint.minted_at or timezone.now(), status=Status.MINTED,
            wallet=user.wallet_address or "", asset_id=og_mint.asset_id or "",
            signature=og_mint.signature or "", minted_at=og_mint.minted_at or timezone.now(),
        ),
    )
    if created:
        _after_commit([row.pk])
    return row


def _after_commit(ids):
    """After the action commits: build the rows' metadata and mint the queued ones."""
    transaction.on_commit(lambda: enqueue(ids))


def enqueue(ids):
    try:
        from posts.tasks import process_collectibles
        process_collectibles.delay(list(ids))
    except Exception:
        # The sweep (every 2 minutes) builds and mints whatever is left
        logger.warning("collectibles.enqueue_failed ids=%s", ids, exc_info=True)


def enqueue_user(user_id):
    try:
        from posts.tasks import mint_collectibles_for_user
        mint_collectibles_for_user.delay(int(user_id))
    except Exception:
        logger.warning("collectibles.enqueue_user_failed user=%s", user_id, exc_info=True)


# ── Claim, connect, unlink ───────────────────────────────────────────────

def queue_for_user(user, origin="connect") -> int:
    """
    Everything of this person's that isn't on Solana yet goes to their wallet
    now: a wallet was connected (or changed), or Claim all. Returns how many
    rows were queued. Minted rows never move.
    """
    if not can_receive(user):
        return 0
    batch = _batch(origin)
    count = (
        Collectible.objects.filter(user=user, status__in=UNMINTED, kind__in=MINTABLE)
        .update(
            status=Status.QUEUED, wallet=user.wallet_address, next_attempt_at=None, last_error="", batch=batch,
            attempts=_attempts_after_claim(),
        )
    )
    if count:
        user_id = user.user_id
        transaction.on_commit(lambda: enqueue_user(user_id))
        logger.info("collectibles.queued user=%s count=%s batch=%s", user.user_id, count, batch)
    return count


def claim(user, row_id):
    """
    POST /collectibles/<id>/claim: one item to the owner's wallet now. A
    second click while it's queued changes nothing. 409 once it's minting or
    minted; no_wallet (the app opens the connect sheet) without a wallet.
    """
    row = Collectible.objects.filter(pk=row_id, user=user).first()
    if row is None:
        raise CollectibleError("NOT_FOUND", "Not found", 404)
    if row.status == Status.MINTED:
        raise CollectibleError("ALREADY_ON_CHAIN", "This one is already on Solana.", 409)
    if row.status == Status.MINTING:
        raise CollectibleError("MINTING", "This one is going on Solana right now.", 409)
    if row.kind not in MINTABLE:
        raise CollectibleError("NOT_CLAIMABLE", "This one can't be claimed.", 409)
    if not can_receive(user):
        raise CollectibleError("no_wallet", "Connect a wallet to put this on Solana.", 400)
    with transaction.atomic():
        updated = Collectible.objects.filter(pk=row.pk, status__in=UNMINTED).update(
            status=Status.QUEUED, wallet=user.wallet_address, next_attempt_at=None, last_error="",
            batch=_batch("claim"),
            attempts=_attempts_after_claim(),
        )
        if updated:
            _after_commit([row.pk])
    row.refresh_from_db()
    if not updated and row.status in (Status.MINTING, Status.MINTED):
        raise CollectibleError("MINTING" if row.status == Status.MINTING else "ALREADY_ON_CHAIN",
                               "This one is already on its way.", 409)
    notify(row)
    return row


def claim_all(user) -> int:
    if not can_receive(user):
        raise CollectibleError("no_wallet", "Connect a wallet to put these on Solana.", 400)
    with transaction.atomic():
        return queue_for_user(user, origin="claim_all")


def wallet_removed(user) -> int:
    """The wallet was unlinked: queued rows go back to off-chain (in-flight mints finish)."""
    count = Collectible.objects.filter(user=user, status=Status.QUEUED).update(
        status=Status.OFFCHAIN, wallet="", next_attempt_at=None, batch="",
    )
    if count:
        logger.info("collectibles.unqueued user=%s count=%s", user.user_id, count)
    return count


# ── Removal ──────────────────────────────────────────────────────────────

def forget(rows, reason) -> int:
    """
    Delete the rows that aren't on Solana (nor about to be). Minted ones stay:
    the chain can't undo them, so they're only logged.
    """
    gone, _ = rows.filter(status__in=UNMINTED).delete()
    kept = rows.filter(status__in=(Status.MINTING, Status.MINTED)).count()
    if gone or kept:
        logger.info("collectibles.forgotten reason=%s deleted=%s kept_onchain=%s", reason, gone, kept)
    return gone


def forget_account(user) -> int:
    return forget(Collectible.objects.filter(user=user), "account_deleted")


def forget_checkin(user_id, event_id) -> int:
    return forget(Collectible.objects.filter(user_id=user_id, kind=Kind.POAP, source_id=str(event_id)),
                  "checkin_removed")


def forget_event(event_id) -> int:
    return forget(Collectible.objects.filter(kind=Kind.POAP, source_id=str(event_id)), "event_deleted")


# ── Realtime ─────────────────────────────────────────────────────────────

def notify(row):
    """Socket hint so an open app updates the card in place."""
    realtime.publish([row.user_id], {
        "type": "collectible",
        "id": row.pk,
        "kind": row.kind,
        "status": row.status,
        "asset_id": row.asset_id or None,
        "meet_slug": row.source_id if row.kind == Kind.MEET else None,
    })


# ── API shapes ───────────────────────────────────────────────────────────

def _brief(user):
    if user is None:
        return None
    avatar = (user.avatar.name if user.avatar else "") or ""
    deleted = is_deleted(user)
    return {
        "user_id": user.user_id,
        "username": user.username,
        "avatar": None if deleted or not avatar else og.public_file_url(avatar),
        "deleted": deleted,
    }


def live_meet_photos(rows) -> dict:
    """slug -> the live selfie, for the meets among `rows` (one query)."""
    from posts.models import MeetPhoto

    slugs = {row.source_id for row in rows if row.kind == Kind.MEET}
    if not slugs:
        return {}
    live = {}
    # Oldest first, so the newest wins: the photo meet_photos.live_photo() picks
    for photo in MeetPhoto.objects.filter(meet_slug__in=slugs, status=MeetPhoto.Status.MINTED).order_by("created_at", "id"):
        live[photo.meet_slug] = photo
    return live


def _image_url(row, photos=None):
    """
    The card image. A meet's card.png turns into the selfie once one is
    live, so its URL takes the photo's version then: a phone that cached
    the v1 card fetches the selfie instead of keeping the old picture.
    """
    if row.kind != Kind.MEET or not row.image_url:
        return row.image_url or None
    photo = (live_meet_photos([row]) if photos is None else photos).get(row.source_id)
    if photo is None:
        return row.image_url
    from posts.src.meet_photos import photo_version

    joiner = "&" if "?" in row.image_url else "?"
    return f"{row.image_url}{joiner}rev={photo_version(photo)}"


def card(row, owner=False, photos=None) -> dict:
    """
    One item, the same shape on-chain or not: the app draws both with the
    same card. The owner also gets the claim state. `photos` is
    live_meet_photos() for a whole page; without it a meet looks its own up.
    """
    onchain = row.status == Status.MINTED
    data = {
        "id": row.pk,
        "kind": row.kind,
        "kind_label": KIND_LABELS.get(row.kind, row.kind),
        "name": row.name,
        "image_url": _image_url(row, photos),
        "recorded_at": row.recorded_at,
        "edition": row.edition,
        "onchain": onchain,
        "asset_id": row.asset_id if onchain and row.asset_id else None,
        "minted_at": row.minted_at if onchain else None,
        "wallet": row.wallet if onchain and row.wallet else None,
        "explorer_url": EXPLORER_URL.format(row.asset_id) if onchain and row.asset_id else None,
        "metadata_uri": row.metadata_uri,
        "claimed_later": meta.claimed_later(row),
        "event_id": row.post_id if row.kind == Kind.POAP else None,
        "post_id": row.post_id if row.kind == Kind.POST else None,
        "meet_slug": row.source_id if row.kind == Kind.MEET else None,
        "with": _brief(row.counterpart) if row.kind == Kind.MEET else None,
    }
    if owner:
        data["status"] = row.status
        data["can_claim"] = row.status in CLAIMABLE and row.kind in MINTABLE
        data["error"] = FAILED_TEXT if row.status == Status.FAILED else None
    return data


def visible_rows(profile_user, viewer):
    """A profile's items as `viewer` may see them (blocks hide meets and events both ways)."""
    from user.src.blocking import blocked_user_ids

    rows = Collectible.objects.filter(user=profile_user).select_related("counterpart", "post")
    hidden = blocked_user_ids(viewer) if viewer is not None else set()
    if hidden:
        rows = rows.exclude(counterpart_id__in=hidden).exclude(post__owner_id__in=hidden)
    if viewer is None or viewer.user_id != profile_user.user_id:
        # Someone banned by moderation isn't shown to others
        rows = rows.exclude(counterpart__is_baned=True, counterpart__is_active=True)
    return rows


def counts(rows) -> dict:
    by_kind = dict(rows.order_by().values_list("kind").annotate(n=Count("id")))
    return {
        "all": sum(by_kind.values()),
        "poap": by_kind.get(Kind.POAP, 0),
        "meet": by_kind.get(Kind.MEET, 0),
        "post": by_kind.get(Kind.POST, 0),
        "badge": by_kind.get(Kind.BADGE, 0),
    }


def encode_cursor(row) -> str:
    micros = int(row.recorded_at.timestamp() * 1_000_000)
    return f"{micros}.{row.pk}"


def decode_cursor(cursor):
    try:
        micros, pk = str(cursor).split(".", 1)
        when = datetime.fromtimestamp(int(micros) / 1_000_000, tz=dt_timezone.utc)
        return when, int(pk)
    except (TypeError, ValueError, OverflowError):
        return None


def page(rows, cursor=None, limit=PAGE_SIZE):
    """(rows of this page, next cursor or None), newest recorded first."""
    rows = rows.order_by("-recorded_at", "-id")
    after = decode_cursor(cursor) if cursor else None
    if after is not None:
        when, pk = after
        rows = rows.filter(Q(recorded_at__lt=when) | Q(recorded_at=when, id__lt=pk))
    items = list(rows[:limit + 1])
    more = len(items) > limit
    items = items[:limit]
    return items, (encode_cursor(items[-1]) if more and items else None)


def meet_states(slugs, viewer) -> dict:
    """
    For Proof of Meet posts: {slug: [each person's collectible]}, so the post
    view can say "On Solana · 8xK…3fQ" or "Not on Solana yet". The viewer's
    own entry also has its claim state.
    """
    slugs = {slug for slug in slugs if slug}
    if not slugs:
        return {}
    try:
        with transaction.atomic():
            rows = list(Collectible.objects.filter(kind=Kind.MEET, source_id__in=slugs))
    except DatabaseError:
        return {}  # not migrated yet (deploy window)
    out = {}
    for row in rows:
        onchain = row.status == Status.MINTED
        item = {"id": row.pk, "user_id": row.user_id, "onchain": onchain,
                "asset_id": row.asset_id if onchain and row.asset_id else None}
        if viewer is not None and row.user_id == viewer.user_id:
            item["status"] = row.status
            item["can_claim"] = row.status in CLAIMABLE
        out.setdefault(row.source_id, []).append(item)
    return out


def summary(user) -> dict:
    """GET /me/collectibles/summary: counts for banners and badges."""
    by_status = dict(
        Collectible.objects.filter(user=user).order_by().values_list("status").annotate(n=Count("id"))
    )
    offchain = by_status.get(Status.OFFCHAIN, 0)
    failed = by_status.get(Status.FAILED, 0)
    return {
        "offchain": offchain,
        "failed": failed,
        "queued": by_status.get(Status.QUEUED, 0),
        "minting": by_status.get(Status.QUEUED, 0) + by_status.get(Status.MINTING, 0),
        "minted": by_status.get(Status.MINTED, 0),
        "claimable": offchain + failed,
        "total": sum(by_status.values()),
        "has_wallet": can_receive(user),
    }
