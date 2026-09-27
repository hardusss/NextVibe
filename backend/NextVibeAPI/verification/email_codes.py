"""
Six-digit codes sent by email: confirming the email of an email + password
account, and resetting a password. Only an HMAC of the code is kept (in the
cache, 10 minutes); a code allows 5 tries and works once. Sending is limited
per address and purpose: one a minute, 5 an hour, 10 a day.
"""
import hashlib
import hmac
import logging
import secrets
import time
from html import escape

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

VERIFY = "verify"
RESET = "reset"

CODE_TTL = 10 * 60
MAX_ATTEMPTS = 5
RESEND_AFTER = 60
MAX_PER_HOUR = 5
MAX_PER_DAY = 10

COOLDOWN = "COOLDOWN"
TOO_MANY_CODES = "TOO_MANY_CODES"
SEND_FAILED = "SEND_FAILED"
INVALID_CODE = "INVALID_CODE"
CODE_EXPIRED = "CODE_EXPIRED"
TOO_MANY_ATTEMPTS = "TOO_MANY_ATTEMPTS"

MESSAGES = {
    COOLDOWN: "We just sent a code. You can ask for a new one in a minute.",
    TOO_MANY_CODES: "Too many codes for this email. Try again later.",
    SEND_FAILED: "We couldn't send the email. Try again in a minute.",
    INVALID_CODE: "That code isn't right. Check the email and try again.",
    CODE_EXPIRED: "This code has expired. Ask for a new one.",
    TOO_MANY_ATTEMPTS: "Too many wrong codes. Ask for a new one.",
}


def _base(purpose: str, email: str) -> str:
    return f"email_code:{purpose}:{hashlib.sha256(email.strip().lower().encode()).hexdigest()}"


def _digest(purpose: str, email: str, code: str) -> str:
    message = f"{purpose}:{email.strip().lower()}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _count(key: str, ttl: int) -> int:
    """Counter in a fixed window that starts at the first hit."""
    cache.add(key, 0, ttl)
    try:
        return cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, ttl)
        return 1


def send_code(purpose: str, email: str, recipient: str | None) -> tuple[str | None, int]:
    """
    Sends a new code for (purpose, email) to `recipient`. With no recipient
    (no account has the address) only the limits are counted, so the answer
    is the same either way. Returns (error or None, seconds until another
    code can be sent).
    """
    base = _base(purpose, email)
    now = time.time()
    next_send = cache.get(f"{base}:next")
    if next_send and next_send > now:
        return COOLDOWN, int(next_send - now) + 1
    if _count(f"{base}:hour", 3600) > MAX_PER_HOUR or _count(f"{base}:day", 86400) > MAX_PER_DAY:
        return TOO_MANY_CODES, RESEND_AFTER
    cache.set(f"{base}:next", now + RESEND_AFTER, RESEND_AFTER)
    if not recipient:
        return None, RESEND_AFTER

    code = f"{secrets.randbelow(1_000_000):06d}"
    cache.set(base, _digest(purpose, email, code), CODE_TTL)
    cache.delete(f"{base}:tries")
    try:
        _deliver(purpose, recipient, code)
    except Exception:
        logger.warning("email_codes: sending a %s code failed", purpose, exc_info=True)
        cache.delete_many([base, f"{base}:next"])
        return SEND_FAILED, 0
    return None, RESEND_AFTER


def check_code(purpose: str, email: str, code) -> str | None:
    """None when `code` is the one sent for (purpose, email); it can't be used again."""
    base = _base(purpose, email)
    stored = cache.get(base)
    if not stored:
        return CODE_EXPIRED
    tries = _count(f"{base}:tries", CODE_TTL)
    code = str(code or "").strip()
    if tries <= MAX_ATTEMPTS and len(code) == 6 and code.isdigit() \
            and hmac.compare_digest(stored, _digest(purpose, email, code)):
        cache.delete_many([base, f"{base}:tries"])
        return None
    if tries >= MAX_ATTEMPTS:
        cache.delete(base)
        return TOO_MANY_ATTEMPTS
    return INVALID_CODE


_COPY = {
    VERIFY: (
        "{code} is your NextVibe code",
        "Enter this code in NextVibe to confirm your email.",
        "If you didn't sign up or sign in to NextVibe, you can ignore this email.",
    ),
    RESET: (
        "{code} is your NextVibe password reset code",
        "Enter this code in NextVibe to set a new password.",
        "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ),
}


def _deliver(purpose: str, recipient: str, code: str) -> None:
    subject, intro, outro = _COPY[purpose]
    minutes = CODE_TTL // 60
    text = f"{intro}\n\n{code}\n\nThe code works for {minutes} minutes.\n\n{outro}\n"
    html = (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;'
        'max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">'
        f'<p style="font-size:16px;line-height:24px;margin:0 0 20px">{escape(intro)}</p>'
        '<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#7C3AED">'
        f'{escape(code)}</p>'
        f'<p style="font-size:14px;line-height:20px;color:#6B7280;margin:0 0 8px">The code works for {minutes} minutes.</p>'
        f'<p style="font-size:14px;line-height:20px;color:#6B7280;margin:0">{escape(outro)}</p>'
        '</div>'
    )
    send_mail(subject.format(code=code), text, settings.EMAIL_CODE_FROM, [recipient],
              html_message=html, fail_silently=False)
