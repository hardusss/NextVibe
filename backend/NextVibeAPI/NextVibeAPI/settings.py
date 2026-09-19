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
