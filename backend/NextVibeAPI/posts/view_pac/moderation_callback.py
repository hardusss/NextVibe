from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from ..models import Post
from django.contrib.auth import get_user_model
from user.models import Notification

User = get_user_model()


class ModerationCallbackView(APIView):
    """
    Webhook endpoint for get result moderation from go service
    """
    
    def post(self, request):
        data = request.data
        post_id = data.get("id")
        
        if not post_id:
            return Response(
                {"error": "Missing post id"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            post = Post.objects.select_related('owner').get(id=post_id)
        except Post.DoesNotExist:
            return Response(
                {"error": "Post not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        text_passed = data.get("text", {}).get("passed", False)
        categories = data.get("text", {}).get("details", {}).get("categories", ["universal"])
        files_passed = all(f.get("passed", False) for f in data.get("files", []))
        post_passed = text_passed and files_passed
        
        # Update post
        post.categories = categories
        post.is_approved = post_passed
        post.moderation_status = "approved" if post_passed else "denied"
        post.save(update_fields=['categories', 'is_approved', 'moderation_status'])
        
        # Notify user if post moderation is not success
        if not post_passed:
            reason = data.get("reason", "violated community guidelines")
            existing = Notification.objects.filter(
                recipient=post.owner,
                post=post,
            ).exists()
            if not existing:
                Notification.objects.create(
                    recipient=post.owner,
                    post=post,
                    notification_type="moderation_fail",
                    text_preview=f"Your post was rejected: {reason}"
                )
        else:
            existing = Notification.objects.filter(
                recipient=post.owner,
                post=post,
            ).exists()
            if not existing:
               Notification.objects.create(
                    recipient=post.owner,
                    post=post,
                    notification_type="moderation_success",
                    text_preview=f"Post published successfully"
                ) 
        
        return Response({"status": "ok"}, status=status.HTTP_200_OK)