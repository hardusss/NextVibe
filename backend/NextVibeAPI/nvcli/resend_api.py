"""
The one place that talks to Resend (through its SDK), shared by the nv
console and the Django email backend: the API key comes from settings,
rate limits are retried, and every error becomes a :class:`ResendFailure`
with one actionable line for the console.
"""
import re
import time

import resend
from django.conf import settings
from resend.exceptions import NoContentError, ResendError

RETRIES = 3
BACKOFF = 2.0
QUOTA_TYPES = frozenset({"daily_quota_exceeded", "monthly_quota_exceeded"})
KEY_TYPES = frozenset({"missing_api_key", "invalid_api_key", "suspended_api_key"})
FIELD_RE = re.compile(r"`([^`]+)`")
DOMAIN_RE = re.compile(r"([a-z0-9-]+(?:\.[a-z0-9-]+)+)`?\s+domain")


class ResendFailure(Exception):
    """
    A failed Resend call. `line` is what the console shows: what went wrong
    and the fix. `fatal` means every later call would fail the same way (bad
    key, unverified domain, quota), so a campaign stops instead of burning
    through its batches.
    """

    def __init__(self, status: int, kind: str, message: str, line: str,
                 fatal: bool = False, retryable: bool = False):
        super().__init__(line)
        self.status = status
        self.kind = kind
        self.message = message
        self.line = line
        self.fatal = fatal
        self.retryable = retryable


def explain(message: str) -> str:
    """A per-message rejection (bad address…) with the field Resend names."""
    field = FIELD_RE.search(message or "")
    if field:
        return f"Resend rejected the `{field.group(1)}` field: {message}"
    return f"Resend rejected it: {message}"


def classify(error: Exception) -> ResendFailure:
    if not isinstance(error, ResendError):
        return ResendFailure(500, type(error).__name__, str(error), f"Resend call failed: {error}", retryable=True)
    try:
        status = int(str(error.code))
    except ValueError:
        status = 500
    kind = error.error_type or ""
    message = error.message or str(error)
    low = message.lower()

    def failure(line, **kw):
        return ResendFailure(status, kind, message, line, **kw)

    if kind in QUOTA_TYPES:
        return failure(f"Resend sending quota reached ({kind}) → wait for it to reset, or raise the plan "
                       "in Resend → Settings → Billing", fatal=True)
    if status == 429:
        return failure("Resend rate limit (429) — still limited after retries, try again in a minute", retryable=True)
    if kind == "restricted_api_key" and status == 401:
        return failure("RESEND_API_KEY is a sending-only key, it can't read domains", fatal=True)
    if status == 401 or kind in KEY_TYPES or (status == 403 and "api key" in low):
        return failure(f"RESEND_API_KEY invalid ({message}) → create one in Resend → API Keys "
                       "and put it in the server env", fatal=True)
    if status == 403 and "domain" in low:
        domain = DOMAIN_RE.search(low)
        return failure(f"{domain.group(1) if domain else 'nextvibe.io'} not verified in Resend "
                       "→ dashboard → Domains", fatal=True)
    if status == 403 and "testing emails" in low:
        return failure("Resend only delivers to the account owner until a domain is verified "
                       "→ dashboard → Domains", fatal=True)
    if status == 403:
        return failure(f"Resend refused the request (403): {message}", fatal=True)
    if status == 409 and kind == "concurrent_idempotent_requests":
        return failure("Resend is still processing the same request", retryable=True)
    if status in (400, 422):
        return failure(explain(message), fatal=True)
    if status >= 500:
        what = "network" if kind == "HttpClientError" else f"Resend {status}"
        return failure(f"{what}: {message}", retryable=True)
    return failure(f"Resend error {status}: {message}")


def call(fn, *args, idempotent: bool = False):
    """
    Run one SDK call. 429 and "same request in progress" are retried up to
    RETRIES times, BACKOFF seconds apart; network errors and 5xx only when
    the request carries an Idempotency-Key, so a retry can't send twice.
    """
    resend.api_key = settings.RESEND_API_KEY
    for attempt in range(RETRIES + 1):
        try:
            return fn(*args)
        except (ResendError, NoContentError) as e:
            failure = classify(e)
        can_retry = failure.retryable and (failure.status in (409, 429) or idempotent)
        if not can_retry or attempt == RETRIES:
            raise failure
        time.sleep(BACKOFF)


def send_email(params: dict, idempotency_key: str | None = None) -> str:
    """POST /emails; returns the Resend email id."""
    options = {"idempotency_key": idempotency_key} if idempotency_key else None
    return call(resend.Emails.send, params, options, idempotent=bool(idempotency_key)).get("id")


def send_batch(params: list[dict], idempotency_key: str | None = None) -> dict:
    """
    POST /emails/batch in permissive mode: an invalid message comes back in
    `errors` ({index, message}) and the rest are still sent. `data` lists
    the ids of the sent ones, in request order.
    """
    options = {"batch_validation": "permissive"}
    if idempotency_key:
        options["idempotency_key"] = idempotency_key
    return call(resend.Batch.send, params, options, idempotent=bool(idempotency_key))


def list_domains() -> list[dict]:
    return list(call(resend.Domains.list).get("data") or [])


def get_domain(domain_id: str) -> dict:
    """One domain, with the DNS `records` Resend expects (the list omits them)."""
    return call(resend.Domains.get, domain_id)
