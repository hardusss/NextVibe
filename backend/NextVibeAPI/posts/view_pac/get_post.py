from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()



class GetPostView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request) -> Response:
        post_id = request.query_params.get("postId")
        if not post_id:
            return Response({"error": "postID is required"}, status=status.HTTP_400_BAD_REQUEST)

        post = Post.objects.prefetch_related("media").filter(id=post_id).first()

        if not post:
            return Response({"error": "Post not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({"status": "ok", "data":
                         {
                            "user_id": post.owner.user_id,
                            "post_id": post.id,
                            "about": post.about,
                            "count_likes": post.count_likes,
                            "media": [{
                                "id": m.id, 
                                "media_url": m.file.url if not str(m.file).startswith("https://res.cloudinary.com/") else str(m.file), # Check where media saved
                                } for m in post.media.all()],
                            "create_at": post.create_at,
                            "is_ai_generated": post.is_ai_generated,
                            "location": post.location,
                            "moderation_status": post.moderation_status,
                            "is_comments_enabled": post.is_comments_enabled,
                        }})