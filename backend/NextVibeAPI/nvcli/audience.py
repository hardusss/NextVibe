"""
Named segments → querysets, per-user stats for placeholders and cards, and
the deterministic sampling that keeps the same people in the same wave.

Every queryset starts from :func:`base_queryset` (active, not banned).
Opted-out users are removed per channel by :func:`without_optouts`.
"""
import hashlib
from datetime import timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone

from nvcli import log

User = get_user_model()

TAP_SOURCES = ("event", "irl")

HAS_PUSH = Q(expo_push_token__isnull=False) & ~Q(expo_push_token="")
HAS_EMAIL = Q(email__isnull=False) & ~Q(email="")
HAS_WALLET = Q(wallet_address__isnull=False) & ~Q(wallet_address="")


def base_queryset():
    return User.all_objects.filter(is_active=True, is_baned=False)


def excluded_count() -> int:
    return User.all_objects.filter(Q(is_active=False) | Q(is_baned=True)).count()


def _active_since(days: int):
    return timezone.now() - timedelta(days=days)


def _tapped_ids():
    from posts.models import Reputation

    rep = Reputation.objects.filter(source__in=TAP_SOURCES)
    return set(rep.values_list("user_id", flat=True)) | set(rep.values_list("given_by_id", flat=True))


def _meet_card_ids():
    from posts.models import Reputation

    rep = Reputation.objects.filter(source__in=TAP_SOURCES, meet_slug__isnull=False)
    return set(rep.values_list("user_id", flat=True))


# name → (description, filter)
SEGMENTS = {
    "push": ("has an Expo push token", lambda qs: qs.filter(HAS_PUSH)),
    "email": ("has an email address", lambda qs: qs.filter(HAS_EMAIL)),
    "email-only": ("email but no push token", lambda qs: qs.filter(HAS_EMAIL).exclude(HAS_PUSH)),
    "both": ("push token and email", lambda qs: qs.filter(HAS_PUSH).filter(HAS_EMAIL)),
    "seeker": ("Seeker Verified", lambda qs: qs.filter(seeker_verified=True)),
    "non-seeker": ("not Seeker Verified", lambda qs: qs.filter(seeker_verified=False)),
    "wallet": ("has a connected wallet", lambda qs: qs.filter(HAS_WALLET)),
    "active-30d": ("logged in within 30 days", lambda qs: qs.filter(last_login__gte=_active_since(30))),
    "inactive-90d": ("no login for 90 days", lambda qs: qs.filter(Q(last_login__lt=_active_since(90)) | Q(last_login__isnull=True))),
    "tapped": ("has tapped with someone (event or IRL)", lambda qs: qs.filter(user_id__in=_tapped_ids())),
    "meet-card": ("has a Proof of Meet card (run backfill_meet_slugs first)", lambda qs: qs.filter(user_id__in=_meet_card_ids())),
}

# Segments that take a parameter: spec is "<prefix>:<value>".
PARAM_SEGMENTS = {
    "event": "checked in at event <post id>",
    "sent-in": "already reached in campaign <name> (from the local log)",
    "file": "usernames from a file, one per line",
}


def describe(spec: str) -> str:
    if spec in SEGMENTS:
        return SEGMENTS[spec][0]
    prefix, _, value = spec.partition(":")
    if prefix == "event":
        return f"checked in at event {value}"
    if prefix == "sent-in":
        return f"reached in campaign {value}"
    if prefix == "file":
        return f"usernames from {value}"
    raise KeyError(spec)


def usernames_from_file(path: str) -> list[str]:
    lines = Path(path).expanduser().read_text(encoding="utf-8").splitlines()
    names = []
    for line in lines:
        name = line.strip().lstrip("@")
        if name and not name.startswith("#"):
            names.append(name)
    return names


def segment_queryset(spec: str, qs=None):
    """Apply one segment spec ('seeker', 'event:12', 'sent-in:sep20', 'file:/p')."""
    qs = base_queryset() if qs is None else qs
    if spec in SEGMENTS:
        return SEGMENTS[spec][1](qs)
    prefix, _, value = spec.partition(":")
    if prefix == "event":
        from posts.models import EventCheckin

        ids = EventCheckin.objects.filter(post_id=int(value)).values_list("user_id", flat=True)
        return qs.filter(user_id__in=list(ids))
    if prefix == "sent-in":
        return qs.filter(user_id__in=list(log.sent_user_ids(value)))
    if prefix == "file":
        return qs.filter(username__in=usernames_from_file(value))
    raise KeyError(f"unknown segment {spec!r}")


def apply(include: list[str], exclude: list[str] | None = None, qs=None):
    """AND of every include segment, minus the union of the exclude segments."""
    qs = base_queryset() if qs is None else qs
    if not include:
        raise ValueError("at least one include segment")
    for spec in include:
        qs = segment_queryset(spec, qs)
    for spec in exclude or []:
        excluded_ids = segment_queryset(spec).values_list("user_id", flat=True)
        qs = qs.exclude(user_id__in=list(excluded_ids))
    return qs.order_by("user_id")


def without_optouts(qs, channel: str):
    """Drop users who unsubscribed from this channel ('both' = either list)."""
    if channel == "both":
        ids = log.optout_ids("push") | log.optout_ids("email")
    else:
        ids = log.optout_ids(channel)
    return qs.exclude(user_id__in=list(ids)) if ids else qs


def with_channel(qs, channel: str):
    if channel == "push":
        return qs.filter(HAS_PUSH)
    if channel == "email":
        return qs.filter(HAS_EMAIL)
    return qs.filter(HAS_PUSH | HAS_EMAIL)


def has_push(user) -> bool:
    return bool(user.expo_push_token)


def has_email(user) -> bool:
    return bool(user.email)


def channels_for(user, channel: str) -> list[str]:
    """Which of the requested channel(s) this user can actually receive."""
    out = []
    if channel in ("push", "both") and has_push(user):
        out.append("push")
    if channel in ("email", "both") and has_email(user):
        out.append("email")
    return out


# ── overview ───────────────────────────────────────────────────────────

def overview() -> dict[str, int]:
    qs = base_queryset()
    push = qs.filter(HAS_PUSH)
    email = qs.filter(HAS_EMAIL)
    seeker = qs.filter(seeker_verified=True)
    return {
        "total": qs.count(),
        "push": push.count(),
        "email": email.count(),
        "both": push.filter(HAS_EMAIL).count(),
        "push_only": push.exclude(HAS_EMAIL).count(),
        "email_only": email.exclude(HAS_PUSH).count(),
        "unreachable": qs.exclude(HAS_PUSH).exclude(HAS_EMAIL).count(),
        "seeker": seeker.count(),
        "seeker_push": seeker.filter(HAS_PUSH).count(),
        "active_30d": qs.filter(last_login__gte=_active_since(30)).count(),
        "excluded": excluded_count(),
        "optout_push": len(log.optout_ids("push")),
        "optout_email": len(log.optout_ids("email")),
    }


def seeker_total() -> int:
    return base_queryset().filter(seeker_verified=True).count()


def load_usernames() -> list[str]:
    return list(base_queryset().order_by("username").values_list("username", flat=True))


def find_user(username: str):
    name = (username or "").strip().lstrip("@")
    return User.all_objects.filter(username__iexact=name).first()


# ── per-user stats ─────────────────────────────────────────────────────

def user_stats(user) -> dict:
    from posts.models import EventCheckin, Reputation

    received = Reputation.objects.filter(user=user)
    rep = received.aggregate(total=Sum("points"))["total"] or 0
    met = (
        received.filter(source__in=TAP_SOURCES)
        .values("given_by_id").distinct().count()
    )
    events = EventCheckin.objects.filter(user=user).count()
    return {
        "rep": rep,
        "events": events,
        "met": met,
        "joined": user.created_at,
        "push": has_push(user),
        "email": has_email(user),
        "seeker": bool(user.seeker_verified),
        "seeker_source": user.seeker_verified_source,
        "official": bool(user.official),
        "wallet": user.wallet_address,
        "last_login": user.last_login,
    }


# ── deterministic sampling ─────────────────────────────────────────────

def bucket(campaign: str, user_id: int, salt: str = "") -> float:
    """Stable number in [0, 1) for (campaign, user): md5, so re-runs agree."""
    digest = hashlib.md5(f"{campaign}:{salt}:{user_id}".encode()).hexdigest()
    return int(digest[:8], 16) / 0x100000000


def sample(users: list, campaign: str, share: float) -> list:
    """Keep users whose bucket falls under `share` (1.0 = everyone)."""
    if share >= 1.0:
        return list(users)
    return [u for u in users if bucket(campaign, u.user_id) < share]


def sample_n(users: list, campaign: str, n: int) -> list:
    """The n users with the lowest bucket — a prefix of any larger sample."""
    ranked = sorted(users, key=lambda u: bucket(campaign, u.user_id))
    return ranked[:max(0, n)]


def variant_for(campaign: str, user_id: int, split_a: float) -> str:
    return "A" if bucket(campaign, user_id, salt="variant") < split_a else "B"
