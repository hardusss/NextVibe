from django.core.cache import cache
from typing import NoReturn

def clear_notification_cache(user_id: int) -> NoReturn:
    redis_client = getattr(cache, "client", None)
    if redis_client:
        client = redis_client.get_client()
        pattern = f"user_{user_id}_notifications_page_*"
        keys = client.keys(pattern)
        if keys:
            client.delete(*keys)
    cache.delete(f"user_{user_id}_notifications_count")
