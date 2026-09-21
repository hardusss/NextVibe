"""
Django email backend over Resend's HTTPS API, for everything that isn't
the nv console (send_mail, password reset…). The server can't reach SMTP,
so settings.EMAIL_BACKEND points here by default.
"""
import base64
import uuid
from email.mime.base import MIMEBase

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

from nvcli import resend_api


class ResendBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            if not message.recipients():
                continue
            try:
                # A fresh key per message makes network retries safe without deduping real resends
                resend_api.send_email(self.payload(message), idempotency_key=f"django:{uuid.uuid4().hex}")
            except Exception:
                if not self.fail_silently:
                    raise
            else:
                sent += 1
        return sent

    @staticmethod
    def payload(message) -> dict:
        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": list(message.to),
            "subject": message.subject,
        }
        if message.content_subtype == "html":
            payload["html"] = message.body
        else:
            payload["text"] = message.body
            html = next((c for c, t in getattr(message, "alternatives", None) or [] if t == "text/html"), None)
            if html:
                payload["html"] = html
        for key in ("cc", "bcc", "reply_to"):
            value = list(getattr(message, key, None) or [])
            if value:
                payload[key] = value
        if message.extra_headers:
            payload["headers"] = {str(k): str(v) for k, v in message.extra_headers.items()}
        attachments = [ResendBackend._attachment(a) for a in message.attachments or []]
        if attachments:
            payload["attachments"] = attachments
        return payload

    @staticmethod
    def _attachment(item) -> dict:
        if isinstance(item, MIMEBase):
            filename, content = item.get_filename(), item.get_payload(decode=True)
        else:
            filename, content, _ = item
        if isinstance(content, str):
            content = content.encode("utf-8")
        return {"filename": filename or "attachment", "content": base64.b64encode(content or b"").decode("ascii")}
