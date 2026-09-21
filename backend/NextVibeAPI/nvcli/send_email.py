"""
Email for the nv console, straight to Resend's HTTPS API (the server can't
reach SMTP). Django's send_mail isn't used here: calling Resend directly
gives message ids, batches, tags and idempotency.

- Campaigns go through the batch endpoint: ≤100 messages per call, 0.6 s
  between calls (Resend allows ~2 requests a second), permissive
  validation so one bad address fails only its own message.
- One-off and test sends are single calls with an Idempotency-Key.
- The campaign JSONL is the source of truth: a (user, "email") already
  sent is never sent again, and every attempt is logged with Resend's
  email id as `ticket`.
- Every message carries campaign / variant / wave tags; Resend returns
  them in its webhooks (nvcli/webhook.py), which is how opens and
  deliveries reach Campaign status.
"""
import re
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field, replace
from email.utils import parseaddr
from typing import NamedTuple

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from nvcli import log, render, resend_api
from nvcli.resend_api import ResendFailure

BATCH_SIZE = 100
BATCH_PAUSE = 0.6
TAG_RE = re.compile(r"[^A-Za-z0-9_-]+")
WEBHOOK_PATH = "/api/v1/nv/resend-webhook/"


class EmailResult(NamedTuple):
    status: str               # sent | failed | dry | skipped
    message_id: str | None    # Resend email id, logged as `ticket`
    error: str | None


def from_address(rendered=None) -> str:
    return getattr(rendered, "sender", None) or settings.DEFAULT_FROM_EMAIL


def sender_domain(address: str) -> str:
    return parseaddr(address)[1].rpartition("@")[2].lower()


def tag_value(value) -> str:
    """Resend tags allow ASCII letters, digits, _ and - only."""
    return TAG_RE.sub("_", str(value))[:256] or "none"


def webhook_url() -> str:
    return settings.PUBLIC_API_URL.rstrip("/") + WEBHOOK_PATH


def skip_reason(user, optouts: set[int] | None = None) -> str | None:
    """Why this user must not get an email, or None."""
    if not user.is_active:
        return "inactive account"
    if user.is_baned:
        return "banned"
    if not user.email:
        return "no email"
    try:
        validate_email(user.email)
    except ValidationError:
        return "invalid email"
    if user.user_id in (log.optout_ids("email") if optouts is None else optouts):
        return "unsubscribed"
    return None


def build_message(user, rendered, campaign: str, variant: str = "A", wave: int = 1,
                  ref: str | None = None) -> dict:
    if not rendered.unsubscribe:  # the footer link and the header must be the same URL
        rendered = replace(rendered, unsubscribe=render.unsubscribe_url(user.user_id))
    unsubscribe = rendered.unsubscribe
    html, text = rendered.email_parts()
    message = {
        "from": from_address(rendered),
        "to": [user.email],
        "subject": rendered.title,
        "html": html,
        "text": text,
        "headers": {
            "List-Unsubscribe": f"<{unsubscribe}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "X-Entity-Ref-ID": ref or f"{campaign}:{user.user_id}",  # stops Gmail threading
        },
        "tags": [
            {"name": "campaign", "value": tag_value(campaign)},
            {"name": "variant", "value": tag_value(variant)},
            {"name": "wave", "value": tag_value(wave)},
        ],
    }
    if rendered.reply_to:
        message["reply_to"] = rendered.reply_to
    return message


# ── one email ──────────────────────────────────────────────────────────

def send_one(user, rendered, campaign: str, variant: str = "A", wave: int = 1,
             ref: str | None = None) -> EmailResult:
    """
    Send one email now. `ref` (default campaign:user_id) is both the
    Idempotency-Key and X-Entity-Ref-ID; one-off and test sends pass a
    unique one so a second, deliberate send isn't swallowed by Resend.
    """
    reason = skip_reason(user)
    if reason:
        return EmailResult("skipped", None, reason)
    ref = ref or f"{campaign}:{user.user_id}"
    try:
        email_id = resend_api.send_email(build_message(user, rendered, campaign, variant, wave, ref), idempotency_key=ref)
    except ResendFailure as f:
        return EmailResult("failed", None, f.line)
    return EmailResult("sent", email_id, None)


def unique_ref(campaign: str, user_id: int, label: str = "") -> str:
    return f"{campaign}:{user_id}:{label}{uuid.uuid4().hex[:8]}"


# ── campaigns ──────────────────────────────────────────────────────────

def batch_results(response: dict, n: int) -> list[EmailResult]:
    """
    Map a batch reply onto its n messages. Rejected messages come back in
    `errors` by index; `data` holds the ids of the others in request order.
    """
    errors = {}
    for e in response.get("errors") or []:
        try:
            errors[int(e.get("index"))] = resend_api.explain(str(e.get("message") or "rejected"))
        except (TypeError, ValueError):
            continue
    ids = [d.get("id") if isinstance(d, dict) else None for d in (response.get("data") or [])]
    if len(ids) != n:  # only the accepted messages are listed
        accepted = iter(ids)
        ids = [None if i in errors else next(accepted, None) for i in range(n)]
    return [EmailResult("failed", None, errors[i]) if i in errors else EmailResult("sent", ids[i], None)
            for i in range(n)]


def send_batch(messages: list[dict], idempotency_key: str | None = None) -> tuple[list[EmailResult], ResendFailure | None]:
    """One batch call. A failed call fails every message in it; the failure
    is returned when it's fatal (the rest of the campaign would fail too)."""
    try:
        response = resend_api.send_batch(messages, idempotency_key=idempotency_key)
    except ResendFailure as f:
        return [EmailResult("failed", None, f.line)] * len(messages), (f if f.fatal else None)
    return batch_results(response, len(messages)), None


@dataclass
class CampaignRun:
    results: list = field(default_factory=list)          # (job, EmailResult), in send order
    skipped: Counter = field(default_factory=Counter)    # reason → users (not sent, not logged)
    already: int = 0                                     # emailed earlier in this campaign
    fatal: ResendFailure | None = None                   # what stopped the run early

    def counts(self) -> Counter:
        return Counter(r.status for _, r in self.results)


def chunks(items: list, size: int = BATCH_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def send_campaign(campaign: str, wave: int, jobs, *, dry: bool = False, on_batch=None,
                  should_stop=None) -> CampaignRun:
    """
    Email every job (anything with .user, .variant, .rendered) not yet
    emailed in `campaign`, in batches, logging each attempt. `dry` renders
    and logs `status: "dry"` without calling Resend. `on_batch(pairs)` runs
    after each batch; `should_stop()` is checked before each one.
    """
    run = CampaignRun()
    reached = log.sent_keys(campaign)
    optouts = log.optout_ids("email")
    todo = []
    for job in jobs:
        if (job.user.user_id, "email") in reached:
            run.already += 1
            continue
        reason = skip_reason(job.user, optouts)
        if reason:
            run.skipped[reason] += 1
            continue
        todo.append(job)

    run_id = uuid.uuid4().hex[:8]
    for i, batch in enumerate(chunks(todo)):
        if should_stop and should_stop():
            break
        messages = [build_message(j.user, j.rendered, campaign, j.variant, wave) for j in batch]
        if dry:
            results = [EmailResult("dry", None, None)] * len(batch)
        else:
            if i:
                time.sleep(BATCH_PAUSE)
            results, run.fatal = send_batch(messages, idempotency_key=f"{campaign}:w{wave}:b{i}:{run_id}")
        pairs = list(zip(batch, results))
        for job, r in pairs:
            log.append(campaign, log.entry(
                campaign=campaign, wave=wave, user_id=job.user.user_id, username=job.user.username,
                channel="email", variant=job.variant, status=r.status, ticket=r.message_id, error=r.error,
                title=job.rendered.title, body=job.rendered.body,
            ))
        run.results += pairs
        if on_batch:
            on_batch(pairs)
        if run.fatal:
            break
    return run


# ── preflight ──────────────────────────────────────────────────────────

@dataclass
class Preflight:
    ok: bool
    line: str                                        # green when ok, red otherwise
    domain: str = ""
    records: list = field(default_factory=list)     # DNS records Resend still expects
    warnings: list = field(default_factory=list)


def preflight(senders=()) -> Preflight:
    """
    Before any real send: the key looks like a Resend key, and every sender
    domain (nextvibe.io) is verified in Resend. Warns when open/click
    tracking is off or the webhook secret is missing, since Campaign status
    then has nothing to show.
    """
    key = settings.RESEND_API_KEY or ""
    if not key:
        return Preflight(False, "RESEND_API_KEY is not set → create a key in Resend → API Keys and add it to the server env")
    if not key.startswith("re_"):
        return Preflight(False, "RESEND_API_KEY doesn't look like a Resend key (they start with re_)")
    domains = sorted({sender_domain(s) for s in (senders or [from_address()])})
    try:
        known = {(d.get("name") or "").lower(): d for d in resend_api.list_domains()}
    except ResendFailure as f:
        if f.kind == "restricted_api_key":
            return Preflight(True, "sending-only API key: can't read domains, so the domain check is skipped",
                             ", ".join(domains), warnings=["a send from an unverified domain fails with its own red line"])
        return Preflight(False, f.line)
    warnings = []
    for domain in domains:
        info = known.get(domain)
        if info is None:
            return Preflight(False, f"{domain} isn't added in Resend → dashboard → Domains → Add domain", domain)
        status = info.get("status") or "unknown"
        if status != "verified":
            try:
                records = resend_api.get_domain(info["id"]).get("records") or []
            except ResendFailure:
                records = []
            pending = [r for r in records if r.get("status") != "verified"] or records
            return Preflight(False, f"{domain} not verified in Resend (status: {status}) → add these DNS records, "
                                    "then press Verify in dashboard → Domains", domain, records=pending)
        sending = (info.get("capabilities") or {}).get("sending")
        if sending not in (None, "enabled"):
            return Preflight(False, f"sending is {sending} for {domain} in Resend → dashboard → Domains", domain)
        if info.get("open_tracking") is False:
            warnings.append(f"open tracking is off for {domain}, so opens won't show in Campaign status "
                            f"(Resend → Domains → {domain} → Configuration)")
        if info.get("click_tracking") is False:
            warnings.append(f"click tracking is off for {domain}, so clicks won't show in Campaign status")
    if not settings.RESEND_WEBHOOK_SECRET:
        warnings.append(f"RESEND_WEBHOOK_SECRET is not set, so deliveries and opens aren't recorded "
                        f"(Resend → Webhooks → {webhook_url()})")
    return Preflight(True, f"{', '.join(domains)} verified in Resend", ", ".join(domains), warnings=warnings)
