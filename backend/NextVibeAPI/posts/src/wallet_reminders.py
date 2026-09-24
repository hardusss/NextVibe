"""
Reminders to connect a wallet, for people whose collectibles are saved
off-chain (posts/src/collectibles.py): someone with no wallet and at least
one off-chain item. They stop the moment a wallet is connected, when the
schedule ends, or when Settings → Notifications → Wallet reminders is off.

    +24 h  push          "Your Proof of Meet with @toji is saved. Connect a wallet to put it on Solana. It’s free."
    +3 d   push          "You have 4 collectibles waiting to go on-chain. It takes 10 seconds."
    +7 d   push + email  "Your POAP from Superteam Ukraine Kyiv is still off-chain" (claim-reminder)
    then weekly, 4 more pushes: the three texts in turn, with fresh counts

counted from the first off-chain item (from when it was saved here, so items
recorded before this existed start the schedule at deploy, not weeks ago).
An hourly job works out who is due; nothing is scheduled per person.

Pushes go out only between 10:00 and 21:00 in the person's time zone (the
app reports it; Europe/Kyiv otherwise), at most one every 3 days. When
several steps are due at once, only the latest goes out; the ones it
replaces are logged as skipped. Every send is logged (CollectibleReminder),
so a step never goes out twice. Every link opens nextvibe.io/u/wallet.
"""
import hashlib
import logging
import zoneinfo
from dataclasses import dataclass
from datetime import time as dt_time, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Min, Q
from django.utils import timezone

from posts.models import Collectible, CollectibleReminder, ReminderPreference
from posts.src import push

logger = logging.getLogger("posts.collectibles")

Kind = Collectible.Kind
Status = Collectible.Status

DEFAULT_TZ = "Europe/Kyiv"
QUIET_START = dt_time(10, 0)  # sends from 10:00 …
QUIET_END = dt_time(21, 0)  # … until 21:00 local time
PUSH_GAP = timedelta(days=3)
RECEIPT_AFTER = timedelta(minutes=15)
WALLET_LINK = "https://nextvibe.io/u/wallet"
PUSH_URL = "/u/wallet"
EMAIL_TEMPLATE = "claim-reminder"
CANDIDATES_PER_RUN = 2000


@dataclass(frozen=True)
class Step:
    key: str
    after: timedelta
    text: str  # latest | count | still
    email: bool = False


STEPS = (
    Step("24h", timedelta(hours=24), "latest"),
    Step("3d", timedelta(days=3), "count"),
    Step("7d", timedelta(days=7), "still", email=True),
    Step("w1", timedelta(days=14), "latest"),
    Step("w2", timedelta(days=21), "count"),
    Step("w3", timedelta(days=28), "still"),
    Step("w4", timedelta(days=35), "latest"),
)


# ── Texts ────────────────────────────────────────────────────────────────

def _what(row) -> str:
    """"Proof of Meet with @toji" / "POAP from Superteam Ukraine Kyiv"."""
    if row.kind == Kind.MEET:
        other = row.counterpart.username if row.counterpart else None
        return f"Proof of Meet with @{other}" if other else "Proof of Meet"
    if row.kind == Kind.POAP:
        from posts.src.collectible_metadata import event_title

        return f"POAP from {event_title(row.post)}" if row.post else "POAP"
    return "collectible"


def _offchain(user):
    return (
        Collectible.objects.filter(user=user, status=Status.OFFCHAIN)
        .select_related("counterpart", "post").order_by("-recorded_at", "-id")
    )


def claim_texts(user):
    """
    What the reminders say for this person right now, or None when nothing of
    theirs is waiting: {latest, count, still} (push title, body) and the
    email's headline, count and list.
    """
    rows = list(_offchain(user)[:50])
    if not rows:
        return None
    total = _offchain(user).count()
    latest = rows[0]
    poap = next((r for r in rows if r.kind == Kind.POAP), None)
    still = poap or latest
    plural = "collectible" if total == 1 else "collectibles"
    items = ", ".join(_what(r) for r in rows[:5]) + (f" and {total - 5} more" if total > 5 else "")
    return {
        "latest": (f"Your {_what(latest)} is saved", "Connect a wallet to put it on Solana. It’s free."),
        "count": (f"You have {total} {plural} waiting to go on-chain", "It takes 10 seconds."),
        "still": (f"Your {_what(still)} is still off-chain", "Connect a wallet to put it on Solana."),
        "headline": f"Your {_what(still)} is still off-chain",
        "count_text": f"{total} {plural}",
        "items": items,
    }


# ── Who is due ───────────────────────────────────────────────────────────

def _no_wallet():
    return Q(user__wallet_address__isnull=True) | Q(user__wallet_address="")


def candidates():
    """(user_id, first off-chain item saved at) for everyone a reminder may be for."""
    return (
        Collectible.objects.filter(status=Status.OFFCHAIN)
        .filter(_no_wallet(), user__is_active=True, user__is_baned=False)
        .values("user_id").annotate(first=Min("created_at"), n=Count("id")).order_by("first")
    )


def local_now(user_id, now, prefs=None):
    pref = prefs.get(user_id) if prefs is not None else ReminderPreference.objects.filter(user_id=user_id).first()
    name = (pref.timezone if pref else "") or DEFAULT_TZ
    try:
        zone = zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        zone = zoneinfo.ZoneInfo(DEFAULT_TZ)
    return now.astimezone(zone)


def in_send_window(local) -> bool:
    return QUIET_START <= local.time() < QUIET_END


def due_step(first, sent_keys, now):
    """(the step to send now or None, earlier unsent steps it replaces)."""
    due = [step for step in STEPS if first + step.after <= now]
    unsent = [step for step in due if step.key not in sent_keys]
    if not unsent:
        return None, []
    return unsent[-1], unsent[:-1]


def run(now=None) -> dict:
    """The hourly job. Returns counts for the logs."""
    now = now or timezone.now()
    stats = {"sent": 0, "skipped": 0, "quiet": 0, "gap": 0, "off": 0, "no_token": 0}
    rows = list(candidates()[:CANDIDATES_PER_RUN])
    if rows:
        ids = [r["user_id"] for r in rows]
        prefs = {p.user_id: p for p in ReminderPreference.objects.filter(user_id__in=ids)}
        sent = {}
        for user_id, step, created_at, channel, status in (
            CollectibleReminder.objects.filter(user_id__in=ids)
            .values_list("user_id", "step", "created_at", "channel", "status")
        ):
            entry = sent.setdefault(user_id, {"keys": set(), "last_push": None})
            if channel == "push":
                entry["keys"].add(step)
                if status == "sent" and (entry["last_push"] is None or created_at > entry["last_push"]):
                    entry["last_push"] = created_at
        for row in rows:
            _consider(row["user_id"], row["first"], prefs, sent.get(row["user_id"]) or {}, now, stats)
    check_receipts(now)
    if stats["sent"]:
        logger.info("wallet_reminders.run %s", stats)
    return stats


def _consider(user_id, first, prefs, sent, now, stats):
    pref = prefs.get(user_id)
    if pref is not None and not pref.wallet_reminders:
        stats["off"] += 1
        return
    step, replaced = due_step(first, sent.get("keys") or set(), now)
    if step is None:
        return
    if not in_send_window(local_now(user_id, now, prefs)):
        stats["quiet"] += 1
        return
    last_push = sent.get("last_push")
    if last_push is not None and now - last_push < PUSH_GAP:
        stats["gap"] += 1
        return
    from user.models import User

    user = User.all_objects.filter(user_id=user_id).first()
    if user is None or user.wallet_address or user.is_baned or not user.is_active:
        return
    texts = claim_texts(user)
    if texts is None:
        return
    for old in replaced:
        _log(user, old.key, "push", "skipped", f"replaced by {step.key}", now)
    _send_step(user, step, texts, stats, now)


def _send_step(user, step, texts, stats, now):
    title, body = texts[step.text]
    if not user.expo_push_token:
        _log(user, step.key, "push", "skipped", "no push token", now)
        stats["no_token"] += 1
    elif _log(user, step.key, "push", "sending", "", now):
        token = user.expo_push_token
        result = push.send(user, title, body, {"type": "wallet_reminder", "url": PUSH_URL, "step": step.key})
        if result is None:
            status, detail = "failed", "not sent"
        elif result.status == "sent":
            # The ticket, for the receipt, and which token it went to
            status, detail = "sent", f"{result.ticket or ''} {_token_hash(token)}"
        else:
            status, detail = result.status, result.error or ""
        CollectibleReminder.objects.filter(user=user, step=step.key, channel="push").update(
            status=status, detail=detail[:255])
        if status == "sent":
            stats["sent"] += 1
            logger.info("wallet_reminders.sent user=%s step=%s", user.user_id, step.key)
    if step.email:
        _send_email(user, step, now)


def _send_email(user, step, now):
    from nvcli import render, send_email

    if not _log(user, step.key, "email", "sending", "", now):
        return
    reason = send_email.skip_reason(user)
    if reason:
        CollectibleReminder.objects.filter(user=user, step=step.key, channel="email").update(
            status="skipped", detail=reason[:255])
        return
    try:
        template = render.get_template(EMAIL_TEMPLATE)
        ctx = render.user_context(user, needs=template.placeholders())
        rendered = render.render(template, ctx)
        result = send_email.send_one(user, rendered, campaign=EMAIL_TEMPLATE, ref=f"{EMAIL_TEMPLATE}:{user.user_id}:{step.key}")
        status, detail = result.status, (result.message_id or result.error or "")
    except Exception as e:
        logger.warning("wallet_reminders.email_failed user=%s", user.user_id, exc_info=True)
        status, detail = "failed", str(e)
    CollectibleReminder.objects.filter(user=user, step=step.key, channel="email").update(
        status=status, detail=detail[:255])


def _log(user, step, channel, status, detail, now) -> bool:
    """Claim the (person, step, channel) slot; False if it was taken (sent or skipped before)."""
    try:
        with transaction.atomic():
            CollectibleReminder.objects.create(user=user, step=step, channel=channel, status=status, detail=detail,
                                               created_at=now)
        return True
    except IntegrityError:
        return False


def _token_hash(token) -> str:
    return hashlib.sha256((token or "").encode()).hexdigest()[:12]


# ── Receipts: tokens Expo reports dead later ─────────────────────────────

def check_receipts(now=None):
    """Push receipts come ~15 minutes later; DeviceNotRegistered clears the token we sent to."""
    from nvcli import receipts
    from user.models import User

    now = now or timezone.now()
    rows = list(
        CollectibleReminder.objects.filter(channel="push", status="sent", receipt_checked=False,
                                           created_at__lte=now - RECEIPT_AFTER)
        .exclude(detail="")[:300]
    )
    tickets = {row.detail.split(" ")[0]: row for row in rows if row.detail.split(" ")[0]}
    if not tickets:
        return
    try:
        found = receipts.fetch_receipts(list(tickets))
    except Exception:
        logger.warning("wallet_reminders.receipts_failed", exc_info=True)
        return
    for ticket, receipt in found.items():
        row = tickets.get(ticket)
        if row is None:
            continue
        status, _ = receipts.status_from_receipt(receipt)
        if status == "unregistered":
            sent_hash = row.detail.split(" ")[1] if " " in row.detail else ""
            user = User.all_objects.filter(user_id=row.user_id).first()
            if user and user.expo_push_token and _token_hash(user.expo_push_token) == sent_hash:
                push.clear_token(user.user_id, user.expo_push_token)
            CollectibleReminder.objects.filter(pk=row.pk).update(status="unregistered", receipt_checked=True)
        else:
            CollectibleReminder.objects.filter(pk=row.pk).update(receipt_checked=True)
