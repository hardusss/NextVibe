"""The author's notification once moderation has decided on a post."""
from user.models import Notification

DEFAULT_REASON = "violated our guidelines"


def notify_author(post, passed: bool, reason: str | None = None) -> None:
    """One notification per post: "Post published successfully" or "Your post was rejected: …"."""
    already = Notification.objects.filter(
        recipient=post.owner, post=post,
        notification_type__in=("moderation_success", "moderation_fail"),
    ).exists()
    if already:
        return
    if passed:
        Notification.objects.create(recipient=post.owner, post=post, notification_type="moderation_success",
                                    text_preview="Post published successfully")
    else:
        Notification.objects.create(recipient=post.owner, post=post, notification_type="moderation_fail",
                                    text_preview=f"Your post was rejected: {reason or DEFAULT_REASON}")
