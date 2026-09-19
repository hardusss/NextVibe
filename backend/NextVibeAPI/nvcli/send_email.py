"""
Email sending through the configured backend.

- ``RESEND_API_KEY`` in the environment → Resend's HTTP API (bulk-safe).
- otherwise Django's ``EMAIL_BACKEND``. Consumer SMTP (Gmail & co), the
  console/locmem backends and an unconfigured localhost SMTP are flagged
  as not bulk-safe: the wizard refuses audiences above
  :data:`CONSUMER_LIMIT` for those.
"""
import os
import time
from dataclasses import dataclass
from typing import NamedTuple

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

RESEND_URL = "https://api.resend.com/emails"
CONSUMER_LIMIT = 50
DEFAULT_PER_MINUTE = 60
COLD_PER_HOUR = 100
CONSUMER_HOSTS = ("gmail", "googlemail", "outlook", "office365", "hotmail", "live.com", "yahoo", "icloud", "me.com", "aol")
TIMEOUT = 20


@dataclass
class BackendInfo:
    kind: str        # resend | smtp | consumer | console | unconfigured
    label: str
    bulk_ok: bool
    fix: str


def backend_info() -> BackendInfo:
    if os.getenv("RESEND_API_KEY"):
        return BackendInfo("resend", "Resend API", True, "")
    backend = getattr(settings, "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
    host = (getattr(settings, "EMAIL_HOST", "") or "").lower()
    fix = "set RESEND_API_KEY (and NV_EMAIL_FROM) in the env to send through Resend"
    if backend.endswith(("console.EmailBackend", "locmem.EmailBackend", "filebased.EmailBackend", "dummy.EmailBackend")):
        return BackendInfo("console", f"{backend.rsplit('.', 2)[-2]} backend (nothing leaves the box)", False, fix)
    if not backend.endswith("smtp.EmailBackend"):
        return BackendInfo("smtp", backend, True, "")
    if not host or host in ("localhost", "127.0.0.1"):
        return BackendInfo("unconfigured", "SMTP to localhost (EMAIL_HOST unset)", False, fix)
    if any(h in host for h in CONSUMER_HOSTS):
        return BackendInfo("consumer", f"consumer SMTP ({host})", False,
                           "consumer mailboxes throttle and flag bulk mail as spam; " + fix)
    return BackendInfo("smtp", f"SMTP {host}", True, "")


def from_address() -> str:
    env = os.getenv("NV_EMAIL_FROM")
    if env:
        return env
    configured = getattr(settings, "DEFAULT_FROM_EMAIL", "")
    if configured and configured != "webmaster@localhost":
        return configured
    return "NextVibe <noreply@nextvibe.io>"


class EmailResult(NamedTuple):
    status: str  # sent | failed
    message_id: str | None
    error: str | None


def _send_resend(to: str, subject: str, text: str, html: str, unsubscribe_url: str | None,
                 session=None) -> EmailResult:
    http = session or requests
    payload = {"from": from_address(), "to": [to], "subject": subject, "html": html, "text": text}
    if unsubscribe_url:
        payload["headers"] = {"List-Unsubscribe": f"<{unsubscribe_url}>"}
    try:
        res = http.post(
            RESEND_URL, json=payload, timeout=TIMEOUT,
            headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}", "Content-Type": "application/json"},
        )
    except requests.RequestException as e:
        return EmailResult("failed", None, f"network: {e}")
    if res.status_code >= 400:
        try:
            msg = res.json().get("message") or res.text
        except ValueError:
            msg = res.text
        return EmailResult("failed", None, f"HTTP {res.status_code}: {msg[:200]}")
    try:
        return EmailResult("sent", res.json().get("id"), None)
    except ValueError:
        return EmailResult("sent", None, None)


def _send_django(to: str, subject: str, text: str, html: str, unsubscribe_url: str | None) -> EmailResult:
    headers = {"List-Unsubscribe": f"<{unsubscribe_url}>"} if unsubscribe_url else {}
    msg = EmailMultiAlternatives(subject=subject, body=text, from_email=from_address(), to=[to], headers=headers)
    msg.attach_alternative(html, "text/html")
    try:
        sent = msg.send(fail_silently=False)
    except Exception as e:  # smtplib raises a zoo of exception types
        return EmailResult("failed", None, f"{type(e).__name__}: {e}"[:200])
    return EmailResult("sent" if sent else "failed", msg.extra_headers.get("Message-ID"), None if sent else "backend returned 0")


def send_email(to: str, subject: str, text: str, html: str, unsubscribe_url: str | None = None,
               session=None) -> EmailResult:
    if backend_info().kind == "resend":
        return _send_resend(to, subject, text, html, unsubscribe_url, session=session)
    return _send_django(to, subject, text, html, unsubscribe_url)


class RateLimiter:
    """Sleep so that at most `per_minute` sends happen per minute."""

    def __init__(self, per_minute: float):
        self.interval = 60.0 / per_minute if per_minute > 0 else 0.0
        self._last = 0.0

    def wait(self) -> None:
        if self.interval <= 0:
            return
        now = time.monotonic()
        delay = self._last + self.interval - now
        if delay > 0:
            time.sleep(delay)
        self._last = time.monotonic()
