import hmac

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from ..models import Post
from ..src.moderation_notify import notify_author
from django.contrib.auth import get_user_model

User = get_user_model()


class ModerationCallbackView(APIView):
    """
    Result callback from the Go moderation service. Only calls carrying the
    shared X-Moderation-Secret are accepted; without MODERATION_CALLBACK_SECRET
    every call is refused (the Celery task already applies each result).
    """
    authentication_classes = []

    def post(self, request):
        expected = getattr(settings, "MODERATION_CALLBACK_SECRET", "")
        given = request.headers.get("X-Moderation-Secret", "")
        if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        post_id = data.get("id")
        
        if not post_id:
            return Response(
                {"error": "Missing post id"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Checks that aren't about a post (Proof of Meet photos and captions,
        # posts/src/moderation.py) are answered inline; nothing to update here
        if not str(post_id).isdigit():
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)
        
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
        
        notify_author(post, post_passed, data.get("reason"))
        return Response({"status": "ok"}, status=status.HTTP_200_OK)