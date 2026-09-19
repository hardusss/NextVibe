"""
Expo push receipts: fetch in batches of 300, rewrite campaign logs with the
final status, and clear tokens Expo reports as DeviceNotRegistered (the
only DB write in nvcli besides opt-outs — it's a fix, not new data).
"""
import time
from collections import Counter

import requests
from django.contrib.auth import get_user_model

from nvcli import log, send_push

EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
RECEIPT_BATCH = 300
TIMEOUT = 20
PING_SETTLE_SECONDS = 5


def fetch_receipts(ticket_ids: list[str], session=None) -> dict[str, dict]:
    """{ticket id: receipt}. Tickets Expo hasn't processed yet are absent."""
    http = session or requests
    out: dict[str, dict] = {}
    for batch in send_push.chunks(list(ticket_ids), RECEIPT_BATCH):
        last_error = None
        for attempt in range(send_push.RETRIES + 1):
            try:
                res = http.post(EXPO_RECEIPTS_URL, json={"ids": batch}, headers=send_push._headers(), timeout=TIMEOUT)
            except requests.RequestException as e:
                last_error = f"network: {e}"
                res = None
            if res is not None and res.status_code not in send_push.RETRY_STATUSES:
                payload = res.json()
                if "errors" in payload:
                    raise send_push.PushSendError("; ".join(str(e.get("message", e)) for e in payload["errors"]))
                out.update(payload.get("data") or {})
                break
            if res is not None:
                last_error = f"HTTP {res.status_code}"
            if attempt < send_push.RETRIES:
                time.sleep(send_push.BACKOFF[min(attempt, len(send_push.BACKOFF) - 1)])
        else:
            raise send_push.PushSendError(f"receipts: gave up ({last_error})")
    return out


def status_from_receipt(receipt: dict) -> tuple[str, str | None]:
    if receipt.get("status") == "ok":
        return "delivered", None
    error = (receipt.get("details") or {}).get("error") or receipt.get("message") or "unknown"
    if error == send_push.DEVICE_NOT_REGISTERED:
        return "unregistered", send_push.DEVICE_NOT_REGISTERED
    return "failed", f"{error}: {receipt.get('message') or ''}".strip(": ")


def clear_tokens(user_ids) -> int:
    User = get_user_model()
    ids = [int(u) for u in set(user_ids)]
    if not ids:
        return 0
    return User.all_objects.filter(user_id__in=ids).update(expo_push_token=None)


def apply_to_campaign(name: str, session=None) -> dict:
    """Update every `sent` push line with its receipt; clear dead tokens."""
    rows = log.read(name)
    pending = [r for r in rows if r.get("status") == "sent" and r.get("channel") == "push" and r.get("ticket")]
    receipts = fetch_receipts([r["ticket"] for r in pending], session=session) if pending else {}
    summary = Counter()
    dead_users = set()
    for row in pending:
        receipt = receipts.get(row["ticket"])
        if receipt is None:
            summary["pending"] += 1
            continue
        status, error = status_from_receipt(receipt)
        row["status"], row["error"], row["receipt_ts"] = status, error, log.now_iso()
        summary[status] += 1
        if status == "unregistered":
            dead_users.add(row["user_id"])
    if pending:
        log.rewrite(name, rows)
    cleared = clear_tokens(dead_users)
    log.update_index(name)
    return {"checked": len(pending), "cleared_tokens": cleared, **summary}


def validate_tokens(progress=None, session=None) -> tuple[list[dict], int]:
    """
    Silent ping to every push token; returns (dead, checked). `dead` rows:
    {user_id, username, token, error}. Tickets that fail outright count as
    dead; the rest are checked once against receipts after a short settle.
    """
    User = get_user_model()
    users = list(
        User.all_objects.filter(is_active=True, is_baned=False)
        .filter(expo_push_token__isnull=False).exclude(expo_push_token="")
        .order_by("user_id").values("user_id", "username", "expo_push_token")
    )
    dead: list[dict] = []
    ticket_owner: dict[str, dict] = {}
    for batch in send_push.chunks(users):
        messages = [send_push.ping_message(u["expo_push_token"]) for u in batch]
        results = send_push.send_batch(messages, session=session)
        for u, r in zip(batch, results):
            if r.status == "unregistered":
                dead.append({**u, "error": r.error})
            elif r.status == "sent" and r.ticket:
                ticket_owner[r.ticket] = u
        if progress:
            progress(len(batch))
        if len(users) > send_push.BATCH_SIZE:
            time.sleep(send_push.BATCH_PAUSE)
    if ticket_owner:
        time.sleep(PING_SETTLE_SECONDS)
        for ticket, receipt in fetch_receipts(list(ticket_owner), session=session).items():
            status, error = status_from_receipt(receipt)
            if status == "unregistered":
                dead.append({**ticket_owner[ticket], "error": error})
    return dead, len(users)
