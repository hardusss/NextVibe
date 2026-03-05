from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, Comment, CommentReply
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

class GetPostView(APIView):

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request) -> Response:
        post_id = request.query_params.get("postId")
        if not post_id:
            return Response({"error": "postID is required"}, status=status.HTTP_400_BAD_REQUEST)

        post = (
            Post.objects
            .prefetch_related("media")
            .select_related("owner")          # fix: select_related on model, not field
            .filter(id=post_id)
            .first()
        )

        if not post:
            return Response({"error": "Post not found"}, status=status.HTTP_404_NOT_FOUND)

        owner = post.owner

        # Build avatar URL
        avatar_url = None
        if owner.avatar:
            raw = str(owner.avatar)
            avatar_url = raw if raw.startswith("https://") else owner.avatar.url

        comments = (
            Comment.objects
            .filter(post=post_id)
            .prefetch_related("replies")
        )

        comments_count = comments.count()
        replies_count = sum(len(comment.replies.all()) for comment in comments)

        count_comments = comments_count + replies_count
        return Response({
            "status": "ok",
            "data": {
                "post_id": post.id,
                "user_id": owner.user_id,
                "username": owner.username,
                "liked_posts": request.user.liked_posts,
                "avatar": avatar_url,
                "official": getattr(owner, "official", False),
                "about": post.about,
                "count_likes": post.count_likes,
                "comments_count": comments_count,
                "media": [
                    {
                        "id": m.id,
                        "media_url": (
                            str(m.file)
                            if str(m.file).startswith("https://res.cloudinary.com/")
                            else m.file.url
                        ),
                    }
                    for m in post.media.all()
                ],
                "create_at": post.create_at,
                "is_ai_generated": post.is_ai_generated,
                "location": post.location,
                "moderation_status": post.moderation_status,
                "is_comments_enabled": post.is_comments_enabled,
            }
        })