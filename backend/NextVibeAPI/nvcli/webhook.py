"""
POST /api/v1/nv/resend-webhook/ — Resend email events into
nvcli/logs/_events.jsonl.

Resend signs each call the Svix way: an HMAC-SHA256 over
"{svix-id}.{svix-timestamp}.{raw body}" keyed with RESEND_WEBHOOK_SECRET
(whsec_ + base64). Anything unsigned, stale or unset gets a 400 and is
not logged. One line per event; Campaign status joins them to the
campaign logs on the Resend email id (`ticket`). A bounce or a spam
complaint also puts the recipient on the email opt-out list. No DB writes.
"""
import base64
import hashlib
import hmac
import json
import time
from email.utils import parseaddr

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from nvcli import log

TOLERANCE = 5 * 60  # seconds, Svix's replay window
HANDLED = frozenset({"email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained"})
OPT_OUT = frozenset({"email.bounced", "email.complained"})


def verify_signature(body: bytes, headers, secret: str, now: float | None = None) -> bool:
    msg_id = headers.get("svix-id")
    stamp = headers.get("svix-timestamp")
    signatures = headers.get("svix-signature")
    if not (secret and msg_id and stamp and signatures):
        return False
    try:
        if abs((time.time() if now is None else now) - int(stamp)) > TOLERANCE:
            return False
        key = base64.b64decode(secret.strip().removeprefix("whsec_"))
    except ValueError:  # bad timestamp or secret (binascii.Error is a ValueError)
        return False
    digest = hmac.new(key, f"{msg_id}.{stamp}.".encode() + body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    # "v1,<sig> v1,<sig2>": several during a secret rotation
    return any(
        hmac.compare_digest(expected, sig.partition(",")[2])
        for sig in signatures.split() if sig.startswith("v1,")
    )


def _tags(raw) -> dict:
    """Resend sends tags as {name: value}; accept the [{name, value}] shape too."""
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    if isinstance(raw, list):
        return {str(t["name"]): str(t.get("value")) for t in raw if isinstance(t, dict) and t.get("name")}
    return {}


def _recipients(email_id, campaign, to) -> set[int]:
    """Users behind a bounced/complained email: the campaign line that sent it,
    else whoever has that address."""
    row = log.find_delivery(email_id, campaign) if email_id else None
    if row and row.get("user_id") is not None:
        return {int(row["user_id"])}
    addresses = [parseaddr(str(a))[1] for a in ([to] if isinstance(to, str) else to or [])]
    addresses = [a for a in addresses if a]
    if not addresses:
        return set()
    users = get_user_model().all_objects
    return {uid for a in addresses for uid in users.filter(email__iexact=a).values_list("user_id", flat=True)}


@csrf_exempt
@require_POST
def resend_webhook(request):
    if not verify_signature(request.body, request.headers, settings.RESEND_WEBHOOK_SECRET):
        return JsonResponse({"error": "invalid signature"}, status=400)
    try:
        payload = json.loads(request.body)
    except ValueError:
        return JsonResponse({"error": "invalid json"}, status=400)
    event = payload.get("type") if isinstance(payload, dict) else None
    if not isinstance(event, str) or event not in HANDLED:
        return JsonResponse({"ok": True, "ignored": str(event)})
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    tags = _tags(data.get("tags"))
    wave = tags.get("wave")
    log.append_event({
        "ts": payload.get("created_at") or log.now_iso(),
        "email_id": data.get("email_id"),
        "event": event,
        "campaign": tags.get("campaign"),
        "variant": tags.get("variant"),
        "wave": int(wave) if wave and wave.isdigit() else wave,
    })
    # A transient bounce (mailbox full, greylisting) says nothing about the address
    bounce = data.get("bounce") if isinstance(data.get("bounce"), dict) else {}
    transient = str(bounce.get("type", "")).lower() == "transient"
    if event in OPT_OUT and not transient:
        for user_id in _recipients(data.get("email_id"), tags.get("campaign"), data.get("to")):
            log.add_optout("email", user_id)
    return JsonResponse({"ok": True})
