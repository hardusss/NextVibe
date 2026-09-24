"""
Collectibles follow what they record (posts/src/collectibles.py): a check-in
the organizer removes, or an event that's deleted, takes its POAPs with it
unless they're on Solana already (those can't be undone and are logged).
"""
import logging

logger = logging.getLogger("posts.collectibles")


def checkin_deleted(sender, instance, **kwargs):
    try:
        from posts.src.collectibles import forget_checkin
        forget_checkin(instance.user_id, instance.post_id)
    except Exception:
        logger.error("collectibles.checkin_cleanup_failed checkin=%s", instance.pk, exc_info=True)


def post_deleted(sender, instance, **kwargs):
    if not instance.is_luma_event:
        return
    try:
        from posts.src.collectibles import forget_event
        forget_event(instance.pk)
    except Exception:
        logger.error("collectibles.event_cleanup_failed event=%s", instance.pk, exc_info=True)
