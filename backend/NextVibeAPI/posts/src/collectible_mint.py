"""
Putting collectibles on Solana: the queue worker behind posts/src/collectibles.py.

A row moves queued → minting with a compare-and-set UPDATE, so a double tap
on Claim, a second worker, or a wallet-connect batch racing a Claim can never
mint the same row twice. Calls to the nft-service go one at a time (it mints
under one lock anyway), oldest recorded first, gasless, to the row's wallet,
in the same collection and tree as before.

    fails ─▶ queued again after 30 s, 2 min, 10 min, 30 min ─▶ failed after 5 tries (Claim again)
    no answer ─▶ stays minting; the sweep asks DAS whether the leaf landed
    every retry asks DAS first, so a leaf that landed is never minted twice

Before a batch: the tree must have room for all of it (an alert at 80 %
full), and the day's mints stay under COLLECTIBLES_DAILY_MINT_CAP (200 per
person per batch); what doesn't fit waits in the queue for the next run. A
batch started by connecting a wallet or by Claim all ends with one push.
"""
import logging
import os
import time
import uuid
from contextlib import contextmanager
from datetime import timedelta, timezone as dt_timezone

import base58
import requests
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from posts.constants import NFT_SERVICE_URL
from posts.models import Collectible, EventCheckin, Post, Reputation, UserCollection
from posts.src import collectible_metadata as meta
from posts.src import das, push
from posts.src.collectibles import (
    Kind, Status, MINTABLE, can_receive, enqueue_user, is_deleted, notify,
)

logger = logging.getLogger("posts.collectibles")

DAILY_MINT_CAP = int(os.environ.get("COLLECTIBLES_DAILY_MINT_CAP", "5000"))
USER_BATCH_CAP = int(os.environ.get("COLLECTIBLES_USER_BATCH_CAP", "200"))
MAX_ATTEMPTS = 5
BACKOFF_SECONDS = (30, 120, 600, 1800)
NOT_READY_WAIT = timedelta(minutes=30)
MINT_TIMEOUT = 90
MINT_PAUSE = float(os.environ.get("COLLECTIBLES_MINT_PAUSE", "0.2"))
# One nft-service call at a time, across workers
SLOT_KEY = "collectibles:mint-slot"
SLOT_TTL = MINT_TIMEOUT + 30
SLOT_WAIT = 60
USER_GUARD_TTL = 900
# A mint with no answer: ask DAS after this long; give up after the last
UNCERTAIN_CHECK_AFTER = timedelta(minutes=3)
UNCERTAIN_RETRY_AFTER = timedelta(minutes=10)
UNCERTAIN_GIVE_UP = timedelta(hours=6)
TREE_CACHE_KEY = "collectibles:tree"
TREE_CACHE_TTL = 60
TREE_ALERT_RATIO = 0.8
SWEEP_KEY = "collectibles:sweep"
SWEEP_USERS = 50
PUSH_BATCH_ORIGINS = ("connect:", "claim_all:")
PUSH_ONCE_TTL = 7 * 24 * 3600
PUSH_URL = "/u/collectibles"


class MintError(Exception):
    """The nft-service said no, or couldn't be reached: safe to try again later."""


class ServiceNotReady(MintError):
    """The service isn't set up for this kind yet (no collection): not the row's fault."""


class NoAnswer(MintError):
    """The request may have reached the chain; only DAS can tell."""


class SlotBusy(Exception):
    pass


# ── Validation ───────────────────────────────────────────────────────────

def is_pubkey(address) -> bool:
    try:
        return isinstance(address, str) and len(base58.b58decode(address)) == 32
    except Exception:
        return False


# ── The nft-service ──────────────────────────────────────────────────────

@contextmanager
def mint_slot(wait=SLOT_WAIT):
    token = uuid.uuid4().hex
    deadline = time.monotonic() + wait
    while not cache.add(SLOT_KEY, token, SLOT_TTL):
        if time.monotonic() >= deadline:
            raise SlotBusy()
        time.sleep(0.25)
    try:
        yield
    finally:
        if cache.get(SLOT_KEY) == token:
            cache.delete(SLOT_KEY)


def _never_sent(error) -> bool:
    text = repr(error)
    return "NewConnectionError" in text or "Connection refused" in text or isinstance(error, requests.ConnectTimeout)


def _post(path, body):
    try:
        response = requests.post(f"{NFT_SERVICE_URL}{path}", json=body, timeout=MINT_TIMEOUT)
    except requests.RequestException as e:
        if _never_sent(e):
            raise MintError(f"nft-service unreachable: {e.__class__.__name__}") from e
        raise NoAnswer(f"no answer: {e.__class__.__name__}") from e
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code == 503 and str(data.get("error", "")).endswith("NOT_CONFIGURED"):
        raise ServiceNotReady(data.get("error"))
    if not data.get("success") or not data.get("assetId"):
        raise MintError(str(data.get("error") or f"HTTP {response.status_code}")[:500])
    return data["assetId"], data.get("signature") or ""


def _meet_people(row):
    """(A's username, B's username, A's user id) as recorded; A confirmed the tap."""
    names = {a.get("trait_type"): a.get("value") for a in (row.metadata or {}).get("attributes") or []}
    first = (
        Reputation.objects.filter(meet_slug=row.source_id).order_by("created_at", "id")
        .values_list("user_id", flat=True).first()
    )
    a_name, b_name = names.get("Participant A"), names.get("Participant B")
    if not (a_name and b_name):
        counterpart = row.counterpart.username if row.counterpart else ""
        a_name, b_name = (row.user.username, counterpart) if first in (None, row.user_id) else (counterpart, row.user.username)
    return a_name, b_name, first


def meet_co_authors(row, wallet) -> list:
    """
    Both people's wallets in the meet's A, B order: the leaf lists them as
    its creators, next to NextVibe's. The other person's is the wallet their
    own leaf went to, else the one they have now; never a deleted account's.
    """
    wallets = {row.user_id: wallet}
    others = Collectible.objects.filter(kind=Kind.MEET, source_id=row.source_id).exclude(user_id=row.user_id)
    for other in others.select_related("user"):
        if other.status == Status.MINTED and other.wallet:
            candidate = other.wallet
        elif can_receive(other.user):
            candidate = other.user.wallet_address
        else:
            candidate = ""
        if candidate and is_pubkey(candidate):
            wallets[other.user_id] = candidate
    _, _, first = _meet_people(row)
    order = sorted(wallets, key=lambda uid: 0 if uid == first else 1)
    out = []
    for uid in order:
        if wallets[uid] not in out:
            out.append(wallets[uid])
    return out[:2]


def _mint_call(row, wallet):
    if row.kind == Kind.POAP:
        return _post("/mint", {"recipient": wallet, "postId": int(row.source_id), "edition": row.edition})
    if row.kind == Kind.MEET:
        a_name, b_name, _ = _meet_people(row)
        return _post("/mint/meet", {
            "recipient": wallet,
            "slug": row.source_id,
            "name": meta.meet_onchain_name(a_name, b_name),
            "uri": row.metadata_uri,
            "coAuthors": meet_co_authors(row, wallet),
        })
    raise MintError(f"{row.kind} isn't minted by the queue")


# ── One row ──────────────────────────────────────────────────────────────

def _take(row_id, now, force=False) -> bool:
    """queued → minting, only if nobody else took it (and it's due, unless forced)."""
    rows = Collectible.objects.filter(pk=row_id, status=Status.QUEUED, kind__in=MINTABLE)
    if not force:
        rows = rows.filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
    return bool(rows.update(status=Status.MINTING, attempts=F("attempts") + 1, last_attempt_at=now))


def _set(row, **fields):
    """Update a row we hold in `minting`; False if it's no longer ours."""
    updated = Collectible.objects.filter(pk=row.pk, status=Status.MINTING).update(**fields)
    for key, value in fields.items():
        if not isinstance(value, (F,)):
            setattr(row, key, value)
    row.refresh_from_db(fields=["status", "attempts", "next_attempt_at", "last_error", "wallet", "asset_id"])
    return bool(updated)


def mint_row(row_id, force=False):
    """
    Mint one queued row now. Returns the row afterwards, or None when it
    wasn't ours to mint (someone else has it, or it isn't due yet).
    `force` skips the backoff (the person pressed Claim / Retry).
    """
    now = timezone.now()
    if not _take(row_id, now, force):
        return None
    row = Collectible.objects.select_related("user", "post", "counterpart").get(pk=row_id)
    notify(row)
    user = row.user
    wallet = row.wallet or (user.wallet_address if can_receive(user) else "")
    if not wallet or is_deleted(user) or user.is_baned:
        # Unlinked or deleted meanwhile: it waits for a wallet again
        _set(row, status=Status.OFFCHAIN, wallet="", attempts=F("attempts") - 1, next_attempt_at=None, batch="")
        notify(row)
        return row
    if not is_pubkey(wallet):
        _set(row, status=Status.FAILED, last_error=f"not a Solana address: {wallet[:50]}", next_attempt_at=None)
        notify(row)
        return row
    meta.ensure(row)

    try:
        if row.attempts > 1:
            existing = _existing_leaf(row, wallet)
            if existing:
                _finish(row, existing, "", wallet)
                return row
        with mint_slot():
            asset_id, signature = _mint_call(row, wallet)
    except SlotBusy:
        _set(row, status=Status.QUEUED, attempts=F("attempts") - 1, next_attempt_at=now + timedelta(seconds=15))
        return row
    except ServiceNotReady as e:
        logger.error("collectibles.service_not_ready id=%s kind=%s: %s", row.pk, row.kind, e)
        _set(row, status=Status.QUEUED, attempts=F("attempts") - 1, next_attempt_at=now + NOT_READY_WAIT,
             last_error=str(e))
        return row
    except NoAnswer as e:
        logger.warning("collectibles.no_answer id=%s kind=%s: %s", row.pk, row.kind, e)
        _set(row, last_error=str(e))
        return row
    except MintError as e:
        _retry_or_fail(row, str(e))
        return row
    _finish(row, asset_id, signature, wallet)
    return row


def _existing_leaf(row, wallet):
    """A leaf from an earlier try that landed after all (DAS); None if there's none or DAS can't say."""
    try:
        return das.find_leaf(wallet, row.metadata_uri)
    except das.DasUnavailable as e:
        logger.warning("collectibles.das_unavailable id=%s: %s", row.pk, e)
        return None


def _retry_or_fail(row, error):
    now = timezone.now()
    if row.attempts >= MAX_ATTEMPTS:
        _set(row, status=Status.FAILED, last_error=error, next_attempt_at=None)
        logger.error("collectibles.failed id=%s kind=%s user=%s attempts=%s: %s",
                     row.pk, row.kind, row.user_id, row.attempts, error)
    else:
        delay = BACKOFF_SECONDS[min(row.attempts, len(BACKOFF_SECONDS)) - 1]
        _set(row, status=Status.QUEUED, last_error=error, next_attempt_at=now + timedelta(seconds=delay))
        logger.warning("collectibles.retry id=%s kind=%s attempt=%s in=%ss: %s",
                       row.pk, row.kind, row.attempts, delay, error)
    notify(row)


def _finish(row, asset_id, signature, wallet):
    now = timezone.now()
    with transaction.atomic():
        updated = Collectible.objects.filter(pk=row.pk, status=Status.MINTING).update(
            status=Status.MINTED, asset_id=asset_id, signature=signature or "", wallet=wallet,
            minted_at=now, last_error="", next_attempt_at=None,
        )
        if not updated:
            logger.error("collectibles.finish_lost id=%s asset=%s", row.pk, asset_id)
            return
        row.status, row.asset_id, row.signature, row.wallet, row.minted_at = (
            Status.MINTED, asset_id, signature or "", wallet, now)
        _write_ledgers(row)
    logger.info("collectibles.minted id=%s kind=%s user=%s asset=%s", row.pk, row.kind, row.user_id, asset_id)
    transaction.on_commit(lambda: _after_mint(row))


def _write_ledgers(row):
    """The flows' own tables, in the mint's transaction (old app versions and dashboards read them)."""
    if row.kind == Kind.POAP and row.post_id:
        try:
            with transaction.atomic():
                UserCollection.objects.get_or_create(
                    user_id=row.user_id, post_id=row.post_id,
                    defaults={"asset_id": row.asset_id, "signature": row.signature, "edition": row.edition or 1,
                              "price": 0},
                )
        except IntegrityError:
            logger.warning("collectibles.ledger_conflict id=%s asset=%s", row.pk, row.asset_id)
        Post.all_objects.filter(pk=row.post_id).update(is_nft=True)
        EventCheckin.objects.filter(user_id=row.user_id, post_id=row.post_id).update(
            mint_status=EventCheckin.MintStatus.MINTED)


def _after_mint(row):
    notify(row)
    if row.kind == Kind.MEET:
        try:
            from posts.src.meet_photos import leaf_minted
            leaf_minted(row)
        except Exception:
            logger.warning("collectibles.meet_photo_update_failed id=%s", row.pk, exc_info=True)


# ── Batches ──────────────────────────────────────────────────────────────

def _utc_midnight(now):
    return now.astimezone(dt_timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def budget_left(now=None) -> int:
    """Mints still allowed today (UTC), counting the ones in flight."""
    now = now or timezone.now()
    used = (
        Collectible.objects.filter(minted_at__gte=_utc_midnight(now)).count()
        + Collectible.objects.filter(status=Status.MINTING).count()
    )
    return max(0, DAILY_MINT_CAP - used)


def tree_status(refresh=False):
    """{capacity, minted, remaining} of the Merkle tree, or None when the nft-service can't say."""
    if not refresh:
        cached = cache.get(TREE_CACHE_KEY)
        if cached is not None:
            return cached or None
    try:
        data = requests.get(f"{NFT_SERVICE_URL}/tree", timeout=10).json()
        capacity, minted = int(data["capacity"]), int(data["minted"])
        status = {"capacity": capacity, "minted": minted, "remaining": max(0, capacity - minted)}
    except Exception as e:
        logger.warning("collectibles.tree_status_unknown: %s", e)
        status = {}
    cache.set(TREE_CACHE_KEY, status, TREE_CACHE_TTL)
    return status or None


def tree_has_room(count) -> bool:
    """False when the tree can't take `count` more leaves. Alerts at 80 % full."""
    status = tree_status()
    if status is None:
        return True  # can't tell: the mint itself fails cleanly on a full tree
    full = status["minted"] / status["capacity"] if status["capacity"] else 1
    if full >= TREE_ALERT_RATIO:
        _alert_once(
            "tree-80", 24 * 3600,
            f"⚠️ cNFT tree {full:.0%} full: {status['minted']} of {status['capacity']} leaves used. "
            f"Create a new tree before it runs out.",
        )
    if status["remaining"] < count:
        _alert_once(
            "tree-full", 3600,
            f"⚠️ cNFT tree can't take a batch of {count}: {status['remaining']} leaves left. Minting is paused.",
        )
        logger.error("collectibles.tree_full remaining=%s batch=%s", status["remaining"], count)
        return False
    return True


def _alert_once(key, ttl, text):
    """Log it and tell the admin (the in-app admin notification), at most once per `ttl`."""
    logger.error("collectibles.alert %s", text)
    if not cache.add(f"collectibles:alert:{key}", 1, ttl):
        return
    try:
        from user.src.notify_admin_new_user import notify_admin_text
        notify_admin_text(text)
    except Exception:
        logger.warning("collectibles.alert_failed", exc_info=True)


def due_rows(user_id, now=None):
    now = now or timezone.now()
    return (
        Collectible.objects.filter(user_id=user_id, status=Status.QUEUED, kind__in=MINTABLE)
        .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
        .order_by("recorded_at", "id")
    )


def mint_pending_for_user(user_id):
    """
    Everything queued and due for one person, oldest first, within the day's
    budget and the tree's room. One run per person at a time: returns None
    when another run has them (the caller tries again shortly), else how many
    landed. A batch from a wallet connect or Claim all gets its push once
    it's through.
    """
    guard = f"collectibles:user:{user_id}"
    if not cache.add(guard, 1, USER_GUARD_TTL):
        return None
    minted, seen, batches = 0, set(), set()
    try:
        for row in Collectible.objects.filter(user_id=user_id, status=Status.QUEUED, kind__in=MINTABLE,
                                              metadata={}):
            meta.ensure(row)
        # Rows queued while this run goes (another tap) are picked up before it ends
        while len(seen) < USER_BATCH_CAP:
            rows = [r for r in due_rows(user_id)[:USER_BATCH_CAP] if r.pk not in seen][:USER_BATCH_CAP - len(seen)]
            if not rows:
                break
            allowed = budget_left()
            if allowed < len(rows):
                logger.warning("collectibles.budget_reached user=%s waiting=%s allowed=%s",
                               user_id, len(rows) - allowed, allowed)
                rows = rows[:allowed]
            if not rows or not tree_has_room(len(rows)):
                break
            for row in rows:
                if seen and MINT_PAUSE:
                    time.sleep(MINT_PAUSE)
                seen.add(row.pk)
                batches.add(row.batch)
                done = mint_row(row.pk)
                if done is not None and done.status == Status.MINTED:
                    minted += 1
        push_batches(user_id, batches)
    finally:
        cache.delete(guard)
    return minted


def process(ids):
    """After an action: build the new rows' metadata, then mint the queued ones."""
    rows = list(Collectible.objects.filter(pk__in=ids).select_related("user", "post", "counterpart"))
    for row in rows:
        meta.ensure(row)
    for user_id in sorted({row.user_id for row in rows if row.status == Status.QUEUED}):
        if mint_pending_for_user(user_id) is None:
            enqueue_user(user_id)  # a run is going for them; this one tries again shortly


# ── The one push per batch ───────────────────────────────────────────────

def batch_push_text(landed, waiting, kinds):
    """(title, body) for a batch that just landed."""
    if landed == 1 and not waiting:
        what = "Proof of Meet" if kinds == {Kind.MEET} else "POAP" if kinds == {Kind.POAP} else "collectible"
        return f"Your {what} is now on Solana", "It landed in your wallet."
    title = f"{landed} of your collectibles are now on Solana"
    if waiting:
        return title, f"{landed} landed, {waiting} will retry automatically."
    if kinds == {Kind.MEET}:
        body = "Your Proof of Meets landed in your wallet."
    elif kinds == {Kind.POAP}:
        body = "Your POAPs landed in your wallet."
    else:
        body = "Your POAPs and Proof of Meets landed in your wallet."
    return title, body


def push_batches(user_id, batches):
    for batch in batches:
        if batch and batch.startswith(PUSH_BATCH_ORIGINS):
            _push_batch(user_id, batch)


def _push_batch(user_id, batch):
    rows = Collectible.objects.filter(user_id=user_id, batch=batch)
    # Done once every row had its first try (retries run later, on their own)
    if rows.filter(Q(status=Status.MINTING) | Q(status=Status.QUEUED, attempts=0)).exists():
        return
    landed = rows.filter(status=Status.MINTED)
    count = landed.count()
    if not count or not cache.add(f"collectibles:pushed:{user_id}:{batch}", 1, PUSH_ONCE_TTL):
        return
    waiting = rows.filter(status__in=(Status.QUEUED, Status.FAILED)).count()
    kinds = set(landed.values_list("kind", flat=True))
    title, body = batch_push_text(count, waiting, kinds)
    push.send(user_id, title, body, {"type": "collectibles_minted", "url": PUSH_URL, "count": count})
    logger.info("collectibles.batch_pushed user=%s batch=%s landed=%s waiting=%s", user_id, batch, count, waiting)


# ── The sweep (Celery beat, every 2 minutes) ─────────────────────────────

def sweep(now=None):
    """Build missing metadata, settle mints nobody answered, and run what's due."""
    now = now or timezone.now()
    if not cache.add(SWEEP_KEY, 1, 600):
        return
    try:
        for row in Collectible.objects.filter(metadata={}, created_at__gte=now - timedelta(days=30))[:100]:
            meta.ensure(row)
        _settle_uncertain(now)
        users = (
            Collectible.objects.filter(status=Status.QUEUED, kind__in=MINTABLE)
            .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
            .order_by("recorded_at").values_list("user_id", flat=True)
        )
        for user_id in list(dict.fromkeys(users))[:SWEEP_USERS]:
            mint_pending_for_user(user_id)
    finally:
        cache.delete(SWEEP_KEY)


def _settle_uncertain(now):
    """Rows left in `minting` (no answer, a worker that died): DAS decides."""
    stale = Collectible.objects.filter(status=Status.MINTING, last_attempt_at__lte=now - UNCERTAIN_CHECK_AFTER)
    for row in stale.select_related("user")[:50]:
        try:
            asset_id = das.find_leaf(row.wallet, row.metadata_uri) if row.wallet else None
        except das.DasUnavailable as e:
            if row.last_attempt_at <= now - UNCERTAIN_GIVE_UP:
                _set(row, status=Status.FAILED, next_attempt_at=None,
                     last_error=f"no answer from the nft-service, and DAS couldn't confirm: {e}")
                notify(row)
            continue
        if asset_id:
            _finish(row, asset_id, "", row.wallet)
        elif row.last_attempt_at <= now - UNCERTAIN_RETRY_AFTER:
            _retry_or_fail(row, row.last_error or "no answer from the nft-service")
