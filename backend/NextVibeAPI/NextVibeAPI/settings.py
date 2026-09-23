import os
from dotenv import load_dotenv

load_dotenv()

ENV = os.getenv("DJANGO_ENV", "dev")  

if ENV == "prod":
    from .setting.prod import *
else:
    from .setting.dev import *

# Absolute base for public image URLs (Seeker Verified card). Crawlers need
# an absolute og:image, so it doesn't come from the request.
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "https://api.nextvibe.io")
# Where stored files are public; empty means https://<AWS_S3_CUSTOM_DOMAIN> (R2)
PUBLIC_MEDIA_URL = os.getenv("PUBLIC_MEDIA_URL", "")

# Proof of Meet selfies (posts/src/meet_photo_store.py). Raw uploads and
# previews go to this private R2 bucket (same R2 credentials), never to the
# public one; empty turns the feature off (uploads answer 503).
# MEET_PHOTO_LOCAL_DIR keeps them on disk instead, for local runs.
MEET_PHOTO_BUCKET = os.getenv("R2_PRIVATE_BUCKET_NAME", "")
MEET_PHOTO_LOCAL_DIR = os.getenv("MEET_PHOTO_LOCAL_DIR", "")
# The socket service's Redis: Django publishes in-app events on its pub/sub
# channel (posts/src/realtime.py)
REALTIME_REDIS_URL = os.getenv("REALTIME_REDIS_URL", "redis://127.0.0.1:6379/0")

# Email goes over Resend's HTTPS API: the server can't reach SMTP (465/587
# are blocked). Django's send_mail uses nvcli/email_backend.py; the nv
# console calls Resend itself (nvcli/send_email.py).
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "nvcli.email_backend.ResendBackend")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
# Signing secret (whsec_…) of the webhook registered in Resend → Webhooks for
# /api/v1/nv/resend-webhook/. Empty: the endpoint rejects every call.
RESEND_WEBHOOK_SECRET = os.environ.get("RESEND_WEBHOOK_SECRET", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Danylo from NextVibe <danylo@nextvibe.io>")

# Console logging for mint/collect diagnostics — the "posts" logger emits
# INFO-level flow logs (prepare/submit/mint outcomes) in both environments.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "loggers": {
        "posts": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
