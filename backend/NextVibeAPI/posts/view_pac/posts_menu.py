from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db.models import Prefetch

User: AbstractUser = get_user_model()



class PostMenuView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id: int) -> Response:
        index = int(request.query_params.get("index", 0))
        limit = int(request.query_params.get("limit", 9))

        posts_qs = (
            Post.objects
            .filter(owner__user_id=id)
            .exclude(moderation_status="denied")
            .select_related("owner") 
            .prefetch_related(Prefetch("media", queryset=PostsMedia.objects.all()))
            .order_by("-id")[index:index + limit]
        )

        total_posts = Post.objects.filter(owner__user_id=id).exclude(moderation_status="denied").count()

        if not posts_qs:
            return Response({
                "user": None,
                "data": [],
                "more_posts": False,
                "total_posts": 0,
                "liked_posts": []
            }, status=status.HTTP_200_OK)

        user_owner_posts = posts_qs[0].owner
        user_request = request.user
        data = [
            {
                "user_id": post.owner.user_id,
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": [{
                    "id": m.id, 
                    "media_url": m.file.url if not str(m.file).startswith("https://res.cloudinary.com/") else str(m.file), # Check where media saved
                    "media_preview": m.preview.url if m.preview else None # Get media if exists
                    } for m in post.media.all()],
                "create_at": post.create_at,
                "is_ai_generated": post.is_ai_generated,
                "location": post.location,
                "moderation_status": post.moderation_status,
                "is_comments_enabled": post.is_comments_enabled,
            }
            for post in posts_qs
        ]

        return Response({
            "user": {
                "id": user_owner_posts.user_id,
                "username": user_owner_posts.username,
                "avatar": user_owner_posts.avatar.url,
                "official": user_owner_posts.official
            },
            "data": data,
            "more_posts": (index + limit) < total_posts,
            "total_posts": total_posts,
            "liked_posts": user_request.liked_posts
        }, status=status.HTTP_200_OK)
