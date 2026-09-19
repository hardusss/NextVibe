"""
Expo push sending: batches of ≤100 messages, 2 s between batches, three
retries with backoff on 429/5xx. Talks to exp.host directly so the batch
shape, retries and ticket mapping stay in one place (the SDK's
publish_multiple has no retry policy).
"""
import os
import time
from typing import NamedTuple

import requests

EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100
BATCH_PAUSE = 2.0
RETRIES = 3
BACKOFF = (2.0, 4.0, 8.0)
TIMEOUT = 20
RETRY_STATUSES = {429, 500, 502, 503, 504}
DEVICE_NOT_REGISTERED = "DeviceNotRegistered"


class PushResult(NamedTuple):
    status: str  # sent | failed | unregistered
    ticket: str | None
    error: str | None


class PushSendError(RuntimeError):
    pass


def _headers() -> dict:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = os.getenv("EXPO_ACCESS_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def build_message(token: str, rendered, campaign: str | None = None, variant: str | None = None,
                  wave: int | None = None) -> dict:
    return {
        "to": token,
        "title": rendered.title,
        "body": rendered.body,
        "data": rendered.push_data(campaign, variant, wave),
        "sound": "default",
        "priority": "high",
    }


def ping_message(token: str) -> dict:
    """Silent data-only push the app ignores; used to validate tokens."""
    return {"to": token, "data": {"type": "ping"}, "_contentAvailable": True, "priority": "normal"}


def post_batch(messages: list[dict], session: requests.Session | None = None) -> list[dict]:
    """POST one batch; return Expo's ticket list (aligned with `messages`)."""
    http = session or requests
    last_error = None
    for attempt in range(RETRIES + 1):
        try:
            res = http.post(EXPO_SEND_URL, json=messages, headers=_headers(), timeout=TIMEOUT)
        except requests.RequestException as e:
            last_error = f"network: {e}"
            res = None
        if res is not None:
            if res.status_code in RETRY_STATUSES:
                last_error = f"HTTP {res.status_code}"
            else:
                try:
                    payload = res.json()
                except ValueError:
                    raise PushSendError(f"HTTP {res.status_code}: non-JSON reply")
                if res.status_code >= 400 or "errors" in payload:
                    errors = payload.get("errors") or [{"message": f"HTTP {res.status_code}"}]
                    raise PushSendError("; ".join(str(e.get("message", e)) for e in errors))
                tickets = payload.get("data") or []
                if len(tickets) != len(messages):
                    raise PushSendError(f"Expo returned {len(tickets)} tickets for {len(messages)} messages")
                return tickets
        if attempt < RETRIES:
            time.sleep(BACKOFF[min(attempt, len(BACKOFF) - 1)])
    raise PushSendError(f"gave up after {RETRIES} retries ({last_error})")


def result_from_ticket(ticket: dict) -> PushResult:
    if ticket.get("status") == "ok":
        return PushResult("sent", ticket.get("id"), None)
    details = ticket.get("details") or {}
    error = details.get("error") or ticket.get("message") or "unknown"
    if error == DEVICE_NOT_REGISTERED:
        return PushResult("unregistered", None, DEVICE_NOT_REGISTERED)
    message = ticket.get("message") or ""
    return PushResult("failed", None, f"{error}: {message}".strip(": "))


def send_batch(messages: list[dict], session: requests.Session | None = None) -> list[PushResult]:
    """Send ≤ BATCH_SIZE messages; a whole-batch failure marks every one failed."""
    try:
        tickets = post_batch(messages, session=session)
    except PushSendError as e:
        return [PushResult("failed", None, str(e))] * len(messages)
    return [result_from_ticket(t) for t in tickets]


def chunks(items: list, size: int = BATCH_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def send_one(token: str, rendered, **ctx) -> PushResult:
    return send_batch([build_message(token, rendered, **ctx)])[0]
