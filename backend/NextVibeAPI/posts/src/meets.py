"""
Proof of Meet: every tap as one addressable meeting.

A tap writes two mirrored Reputation rows, one per person (process_irl_tap,
process_nfc_connect). Both carry the same `meet_slug`: the public id behind
nextvibe.io/u/meet/<slug>, its card and GET /api/v1/meet/<slug>.

The slug is an HMAC (keyed by SECRET_KEY) of what makes a meeting unique, so
it can't be guessed or enumerated, and every row of one meeting gets the same
one, even rows written by two requests that raced:

    IRL tap     pair + UTC day   Tap to Meet allows one per pair per day
    event tap   pair + event     one per pair per event

Taps store it when the rows are written. Older rows get theirs by
themselves: after every `migrate` (each deploy runs one), when their owner
opens History, or by hand with `manage.py backfill_meet_slugs`. All three
use fill_meet_slugs. Once stored, a slug never changes. Counts ("#14 for
@a", "3rd time meeting") group rows by the same keys, so they don't depend
on the backfill. A repeat tap the same day is rejected before anything is
written; rows with 0 points would be left out of meets and counts.
"""
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone

from django.db import connections, transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.crypto import salted_hmac

from posts.models import EventCheckin, EventRequest, Reputation
from posts.src import geocode
from user.src.blocking import blocked_user_ids, is_blocked_between

logger = logging.getLogger("posts.meets")

MEET_SOURCES = ("irl", "event")
SLUG_LENGTH = 12
SLUG_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
SITE_URL = "https://nextvibe.io"
# The model default: the black-on-white silhouette, never drawn on a card
DEFAULT_AVATARS = {"", "images/default.png"}
# Both rows of one tap are written in one transaction; a pair's IRL rows
# further apart than this, on different UTC days, are different meetings.
SAME_TAP_SECONDS = 60
ROW_FIELDS = ("id", "user_id", "given_by_id", "source", "event_id", "created_at", "meet_slug")

TIER_IN_PERSON = "in_person"
TIER_PEER = "peer_verified"
TIER_ORGANIZER = "organizer_verified"
TIER_LABELS = {
    TIER_IN_PERSON: "IN PERSON",
    TIER_PEER: "PEER VERIFIED",
    TIER_ORGANIZER: "ORGANIZER VERIFIED",
}


# ── Slugs ────────────────────────────────────────────────────────────────

def tap_rows():
    """Reputation rows that record one person's side of a tap."""
    return (
        Reputation.objects
        .filter(source__in=MEET_SOURCES, is_checkin=False, post__isnull=True, post_type__isnull=True, points__gt=0)
        .exclude(user_id=F("given_by_id"))
    )


def utc_day(when):
    return when.astimezone(dt_timezone.utc).date()


def meet_key(user_a_id, user_b_id, source, event_id=None, day=None) -> str:
    """What makes a meeting unique (the slug's input)."""
    low, high = sorted((int(user_a_id), int(user_b_id)))
    if source == "event" and event_id:
        return f"{low}:{high}:event:{int(event_id)}"
    return f"{low}:{high}:{source}:{day.isoformat()}"


def slug_for_key(key: str) -> str:
    digest = salted_hmac("nextvibe.meet_slug", key, algorithm="sha256").digest()
    number = int.from_bytes(digest[:9], "big") % (len(SLUG_ALPHABET) ** SLUG_LENGTH)
    chars = []
    for _ in range(SLUG_LENGTH):
        number, rest = divmod(number, len(SLUG_ALPHABET))
        chars.append(SLUG_ALPHABET[rest])
    return "".join(reversed(chars))


def tap_slug(user_a_id, user_b_id, source, event_id=None, when=None) -> str:
    """Slug for the rows of a tap being written now (IRL: today, UTC)."""
    day = utc_day(when or timezone.now())
    return slug_for_key(meet_key(user_a_id, user_b_id, source, event_id, day))


def is_slug(value) -> bool:
    return isinstance(value, str) and len(value) == SLUG_LENGTH and all(c in SLUG_ALPHABET for c in value)


def meet_url(slug: str) -> str:
    return f"{SITE_URL}/u/meet/{slug}"


def group_rows(rows):
    """
    {meet key: [row, ...]} for row dicts with ROW_FIELDS. Event taps group by
    pair + event. IRL taps group by pair + UTC day, and rows written a moment
    apart stay together across midnight.
    """
    groups = defaultdict(list)
    by_pair = defaultdict(list)
    for row in rows:
        pair = tuple(sorted((row["user_id"], row["given_by_id"])))
        if row["source"] == "event" and row["event_id"]:
            groups[meet_key(*pair, "event", row["event_id"])].append(row)
        else:
            by_pair[(pair, row["source"])].append(row)
    for (pair, source), pair_rows in by_pair.items():
        pair_rows.sort(key=lambda r: (r["created_at"], r["id"]))
        key, day, last_at = None, None, None
        for row in pair_rows:
            row_day = utc_day(row["created_at"])
            same_tap = last_at is not None and (row["created_at"] - last_at).total_seconds() <= SAME_TAP_SECONDS
            if key is None or (row_day != day and not same_tap):
                key, day = meet_key(*pair, source, day=row_day), row_day
            groups[key].append(row)
            last_at = row["created_at"]
    return groups


def fill_meet_slugs(rows=None, dry_run=False, using="default"):
    """
    Give every tap row without a slug its meeting's slug. `rows` narrows the
    tap rows looked at (one person's taps); it must hold every row of the
    meetings it touches. A meeting that already has a slug keeps it (a row
    written later that raced an old one); otherwise the slug is derived from
    the meeting's key, so every run gives the same result.
    Returns (rows set, meetings touched, meetings looked at).
    """
    rows = tap_rows().using(using) if rows is None else rows
    groups = group_rows(rows.values(*ROW_FIELDS))
    rows_set = touched = 0
    with transaction.atomic(using=using):
        for key, group in groups.items():
            empty = [r["id"] for r in group if not r["meet_slug"]]
            if not empty:
                continue
            stored = sorted({r["meet_slug"] for r in group if r["meet_slug"]})
            slug = stored[0] if stored else slug_for_key(key)
            if not dry_run:
                Reputation.objects.using(using).filter(id__in=empty, meet_slug__isnull=True).update(meet_slug=slug)
            rows_set += len(empty)
            touched += 1
    return rows_set, touched, len(groups)


def ensure_user_meet_slugs(user_id) -> int:
    """
    A person's past taps get their slugs when they open their history, even
    if nothing else filled them yet. One indexed query when none is missing.
    Returns how many rows were set.
    """
    rows = tap_rows().filter(Q(user_id=user_id) | Q(given_by_id=user_id))
    if not rows.filter(meet_slug__isnull=True).exists():
        return 0
    return fill_meet_slugs(rows)[0]


def fill_meet_slugs_after_migrate(sender=None, using="default", verbosity=1, **kwargs):
    """
    post_migrate (posts/apps.py): every `migrate`, which each deploy runs,
    gives past taps their slugs, so old meets can be shared without a manual
    step. Skipped while the column doesn't exist yet, and never breaks
    `migrate`.
    """
    try:
        if not _has_meet_slug_column(using):
            return
        rows_set, touched, total = fill_meet_slugs(using=using)
    except Exception:
        logger.warning("meets.fill_after_migrate_failed", exc_info=True)
        return
    if rows_set and verbosity:
        logger.info("meets.filled_after_migrate rows=%s meets=%s of=%s", rows_set, touched, total)


def _has_meet_slug_column(using) -> bool:
    connection = connections[using]
    table = Reputation._meta.db_table
    with connection.cursor() as cursor:
        if table not in connection.introspection.table_names(cursor):
            return False
        return any(col.name == "meet_slug" for col in connection.introspection.get_table_description(cursor, table))


# ── One meeting ──────────────────────────────────────────────────────────

@dataclass
class MeetPerson:
    user_id: int
    username: str
    avatar_name: str  # storage name; "" draws the initial (default avatar, deleted account)
    seeker: bool
    official: bool
    deleted: bool
    points: int | None  # REP this person got for this meet
    number: int  # this meet is their Nth


@dataclass
class Meet:
    slug: str
    source: str
    tier: str
    met_at: datetime
    people: tuple  # (A, B): A confirmed the tap
    event_id: int | None
    event_name: str | None  # only while the event is public
    city: str | None
    tz: object | None  # ZoneInfo of the place; None → UTC
    pair_count: int  # meetings between these two up to this one
    pair_first_at: datetime
    asset_id: str | None = None

    @property
    def tier_label(self) -> str:
        return TIER_LABELS[self.tier]

    @property
    def url(self) -> str:
        return meet_url(self.slug)


def is_deleted(user) -> bool:
    return user.auth_provider == "deleted" or not user.is_active


def is_banned(user) -> bool:
    """Banned by moderation (deleted accounts are flagged banned too)."""
    return bool(user.is_baned) and not is_deleted(user)


def load_meet(slug, viewer=None):
    """
    The Meet behind a slug, or None. Unknown slugs, meets with an account
    banned by moderation, a blocked pair, and (for a signed-in viewer)
    someone the viewer blocked or was blocked by all look the same.
    """
    if not is_slug(slug):
        return None
    rows = list(
        tap_rows().filter(meet_slug=slug)
        .select_related("user", "given_by", "event", "event__owner")
        .order_by("created_at", "id")
    )
    if not rows:
        return None
    first = rows[0]
    a, b = first.user, first.given_by
    pair = {a.user_id, b.user_id}
    rows = [r for r in rows if {r.user_id, r.given_by_id} == pair]

    if is_banned(a) or is_banned(b) or is_blocked_between(a.user_id, b.user_id):
        return None
    viewer_id = getattr(viewer, "user_id", None)
    if viewer_id and blocked_user_ids(viewer) & pair:
        return None

    upto = max(r.created_at for r in rows)
    points = {r.user_id: r.points for r in rows}
    source = first.source
    event = first.event if source == "event" else None

    cell = next((r.h3_geo for r in rows if r.h3_geo), None) or (event.h3_geo if event else None)
    city, country, tz = None, None, None
    if cell:
        city, country = geocode.place_for_cell(cell)
        latlng = geocode.cell_latlng(cell)
        tz = geocode.timezone_at(*latlng, country) if latlng else None

    pair_count, pair_first_at = pair_history(a.user_id, b.user_id, upto)
    return Meet(
        slug=slug,
        source=source,
        tier=meet_tier(source, first.event_id, pair),
        met_at=first.created_at,
        people=(_person(a, points, upto), _person(b, points, upto)),
        event_id=first.event_id if source == "event" else None,
        event_name=public_event_name(event),
        city=city,
        tz=tz,
        pair_count=max(pair_count, 1),
        pair_first_at=pair_first_at or first.created_at,
        asset_id=None,  # meets aren't minted yet; the footer says "recorded on NextVibe"
    )


def _person(user, points, upto) -> MeetPerson:
    deleted = is_deleted(user)
    avatar = "" if deleted else (user.avatar.name if user.avatar else "") or ""
    if avatar in DEFAULT_AVATARS:
        avatar = ""
    has_row = user.user_id in points
    return MeetPerson(
        user_id=user.user_id,
        username=user.username,
        avatar_name=avatar,
        seeker=bool(user.seeker_verified) and not deleted,
        official=bool(user.official) and not deleted,
        deleted=deleted,
        points=points.get(user.user_id),
        # An unpaired legacy row may leave one person without their own row
        number=max(meet_count(user.user_id, upto) + (0 if has_row else 1), 1),
    )


def meet_count(user_id, upto) -> int:
    """How many meetings the user had up to `upto` (inclusive)."""
    rows = tap_rows().filter(user_id=user_id, created_at__lte=upto).values(*ROW_FIELDS)
    return len(group_rows(rows))


def pair_history(a_id, b_id, upto):
    """(meetings between exactly these two up to `upto`, when they first met)."""
    rows = list(
        tap_rows()
        .filter(Q(user_id=a_id, given_by_id=b_id) | Q(user_id=b_id, given_by_id=a_id), created_at__lte=upto)
        .values(*ROW_FIELDS)
    )
    if not rows:
        return 0, None
    return len(group_rows(rows)), min(r["created_at"] for r in rows)


def meet_tier(source, event_id, pair) -> str:
    """
    IRL → IN PERSON. At an event: ORGANIZER VERIFIED when the organizer
    approved both people (approved request or check-in), else PEER VERIFIED.
    """
    if source == "irl":
        return TIER_IN_PERSON
    if not event_id:
        return TIER_PEER
    approved = set(
        EventCheckin.objects.filter(post_id=event_id, user_id__in=pair, is_registered=True)
        .values_list("user_id", flat=True)
    )
    if not pair <= approved:
        approved |= set(
            EventRequest.objects.filter(post_id=event_id, user_id__in=pair, status=EventRequest.Status.APPROVED)
            .values_list("user_id", flat=True)
        )
    return TIER_ORGANIZER if pair <= approved else TIER_PEER


def public_event_name(event):
    """The event's title while it's on the map (not hidden or denied, owner not banned)."""
    if event is None or not event.is_luma_event or event.is_hide or event.moderation_status == "denied":
        return None
    if event.owner.is_baned:
        return None
    name = " ".join((event.about or "").split())
    return name[:140] or None


# ── The rows' side (history lists, tap responses) ─────────────────────────

def slug_for_pair_event(user_id, other_id, event_id):
    """Stored slug of the event meet between two people, or None."""
    return (
        tap_rows()
        .filter(user_id=user_id, given_by_id=other_id, event_id=event_id, meet_slug__isnull=False)
        .values_list("meet_slug", flat=True)
        .first()
    )


def slug_for_pair_today(user_id, other_id, day_start):
    """Stored slug of today's IRL meet between two people, or None."""
    return (
        tap_rows()
        .filter(source="irl", user_id=user_id, given_by_id=other_id, created_at__gte=day_start, meet_slug__isnull=False)
        .values_list("meet_slug", flat=True)
        .first()
    )
