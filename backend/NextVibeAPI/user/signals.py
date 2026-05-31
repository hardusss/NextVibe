# user/signals.py
import logging

import httpx
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification, User
from user.src.send_push_message import send
from user.src.clear_notify_cache import clear_notification_cache

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Notification)
def trigger_push_and_cache(sender, instance, created, **kwargs):
    if created:
        clear_notification_cache(instance.recipient.user_id) 
        
        body_text = ""
        if instance.post and instance.notification_type in ['like', 'comment']:
            body_text = instance.post.about

        elif instance.comment and instance.notification_type in ['comment_like', 'comment_reply']:
            body_text = instance.comment.text 
            
        elif instance.notification_type == 'follow':
            body_text = "Check out their profile!"
            
        elif instance.notification_type == 'moderation_fail':
            body_text = "Please review our community guidelines."
            
        elif instance.notification_type == 'event_request':
            body_text = "Someone requested to join your event!"
            if instance.post and instance.post.about:
                body_text = f"Event: {instance.post.about}"
                
        elif instance.notification_type == 'event_request_status':
            body_text = "The organizer has responded to your request."
            if instance.post and instance.post.about:
                body_text = f"Event: {instance.post.about}"

        elif instance.notification_type == 'new_user':
            body_text = instance.text_preview

        token = getattr(instance.recipient, 'expo_push_token', None)
        if token:
            send(
                token=token,
                title=instance.text_preview, 
                body=body_text
            )


@receiver(post_save, sender=User)
def sync_wallet_to_indexer(sender, instance, created, update_fields, **kwargs):
    if not instance.wallet_address:
        return

    if not created and update_fields and "wallet_address" not in update_fields:
        return

    if not settings.INDEXER_INTERNAL_SECRET:
        return

    try:
        httpx.post(
            f"{settings.INDEXER_URL.rstrip('/')}/index/register",
            json={
                "user_id": instance.user_id,
                "wallet_address": instance.wallet_address,
            },
            headers={"x-internal-secret": settings.INDEXER_INTERNAL_SECRET},
            timeout=5,
        )
    except Exception as error:
        logger.warning(
            "Indexer register failed for %s: %s",
            instance.wallet_address,
            error,
        )