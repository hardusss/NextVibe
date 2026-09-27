"""
Who is sharing Tap to Meet right now.

The share screen asks for a new proximity token every 50 seconds, and each
request marks its owner as sharing for the token's lifetime. The legacy tap
endpoints (irl-tap, event-nfc-connect), which get the other person's id
instead of a token, only record a tap when that person is sharing.
"""
from django.core.cache import cache

SHARING_PREFIX = "proximity:sharing:"
SHARING_TTL = 300  # seconds, the same as a proximity token


def mark_sharing(user_id) -> None:
    cache.set(f"{SHARING_PREFIX}{user_id}", 1, timeout=SHARING_TTL)


def is_sharing(user_id) -> bool:
    return bool(user_id) and bool(cache.get(f"{SHARING_PREFIX}{user_id}"))
