"""
In-app events from Django through the socket service (socket_service/).

The socket service fans events out to every pod over the Redis pub/sub
channel below: each pod delivers `envelope` to its local websockets for the
`target_user_ids`, and skips events whose `sender_pod_id` is its own. Django
publishes on the same channel as a pod of its own ("django"), so no socket
service change is needed. The app's root listener (WebSocketService) gets
the envelope while it's open; pushes cover a closed app.

Best effort: a failure is logged and never raised.
"""
import json
import logging
from functools import lru_cache

import redis
from django.conf import settings

logger = logging.getLogger("posts.realtime")

CHANNEL = "chat_pubsub_events"  # socket_service/connection_manager.py
SENDER = "django"


@lru_cache(maxsize=1)
def _client():
    return redis.Redis.from_url(settings.REALTIME_REDIS_URL, socket_timeout=2, socket_connect_timeout=2)


def publish(user_ids, envelope: dict) -> bool:
    ids = sorted({int(u) for u in user_ids if u})
    if not ids:
        return False
    message = json.dumps({"sender_pod_id": SENDER, "target_user_ids": ids, "envelope": envelope})
    try:
        _client().publish(CHANNEL, message)
        return True
    except Exception:
        logger.warning("realtime.publish_failed type=%s users=%s", envelope.get("type"), ids, exc_info=True)
        return False
