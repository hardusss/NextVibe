from django.contrib.auth import get_user_model
from user.models import Notification

ADMIN_USER_ID = 39


def notify_admin_new_user(new_user) -> None:
    """
    Sends an in-app Notification (and push via signals) to the admin user
    (user_id=39) whenever a new user registers — via standard or Google flow.

    Args:
        new_user: the freshly created User instance.
    """
    User = get_user_model()

    try:
        admin = User.all_objects.get(user_id=ADMIN_USER_ID)
    except User.DoesNotExist:
        # Admin account not yet created — silently skip
        return

    Notification.objects.create(
        sender=None,          # system notification — no sender
        recipient=admin,
        notification_type="new_user",
        text_preview=f"🆕 New user registered: @{new_user.username}",
    )


def notify_admin_text(text: str) -> None:
    """
    An operational alert (e.g. the cNFT tree filling up) through the same
    channel: an in-app notification, and its push, to the admin account.
    """
    User = get_user_model()
    admin = User.all_objects.filter(user_id=ADMIN_USER_ID).first()
    if admin is None:
        return
    Notification.objects.create(
        sender=None,
        recipient=admin,
        notification_type="new_user",  # the admin-only type: its push shows text_preview as is
        text_preview=text[:255],
    )
