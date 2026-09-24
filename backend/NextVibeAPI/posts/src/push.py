"""
Pushes from the collectibles flows (a batch that landed, wallet reminders)
through Expo's HTTP API, with the nv console's sender (nvcli/send_push.py:
retries on 429 and 5xx). A token Expo reports as DeviceNotRegistered is
cleared right away; receipts that say so later are handled by the reminder
job (posts/src/wallet_reminders.py), the way the nv console does it.
"""
import logging

from nvcli import send_push as expo

logger = logging.getLogger("posts.collectibles")


def send(user, title, body, data):
    """Send one push to `user` (a User or a user id). Returns nvcli's PushResult, or None without a token."""
    from user.models import User

    if not isinstance(user, User):
        user = User.all_objects.filter(user_id=user).first()
    token = getattr(user, "expo_push_token", None)
    if not token or not user.is_active:
        return None
    message = {"to": token, "title": title, "body": body, "data": data, "sound": "default", "priority": "high"}
    try:
        result = expo.send_batch([message])[0]
    except Exception:
        logger.warning("push.failed user=%s type=%s", user.user_id, data.get("type"), exc_info=True)
        return None
    if result.status == "unregistered":
        clear_token(user.user_id, token)
    elif result.status == "failed":
        logger.warning("push.rejected user=%s type=%s: %s", user.user_id, data.get("type"), result.error)
    return result


def clear_token(user_id, token=None) -> int:
    """Forget a dead token (only if it's still the one we tried)."""
    from user.models import User

    rows = User.all_objects.filter(user_id=user_id)
    if token:
        rows = rows.filter(expo_push_token=token)
    cleared = rows.update(expo_push_token=None)
    if cleared:
        logger.info("push.token_cleared user=%s", user_id)
    return cleared
