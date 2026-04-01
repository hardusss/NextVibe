# user/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification
from user.src.send_push_message import send
from user.src.clear_notify_cache import clear_notification_cache

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

        token = getattr(instance.recipient, 'expo_push_token', None)
        if token:
            send(
                token=token,
                title=instance.text_preview, 
                body=body_text
            )