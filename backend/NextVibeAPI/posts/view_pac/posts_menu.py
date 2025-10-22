from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser


User: AbstractUser = get_user_model()


class PostMenuView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id: int) -> Response:
        index: int = int(request.query_params.get("index", 0))
        limit: int = int(request.query_params.get("limit", 9))  # Default to 9 posts per page
        who_send_request: int = int(request.user.user_id)
        
        posts = Post.objects.filter(owner__user_id=id).order_by("-id")[index:index + limit]
        if not posts.exists():
            return Response({
                "user": None,
                "data": [],
                "more_posts": False,
                "total_posts": 0,
                "liked_posts": []
            }, status=status.HTTP_200_OK)

        total_posts = Post.objects.filter(owner__user_id=id).count()
        data = []

        user_id_for_post = None
        for post in posts:
            media = PostsMedia.objects.filter(post=post)
            media_data = [{"id": m.id, "media_url": str(m.file)} for m in media] if media.exists() else None
            if not user_id_for_post:
                user_id_for_post = post.owner.user_id
            data.append({
                "user_id": post.owner.user_id,
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": media_data,
                "create_at": post.create_at,
                "is_ai_generated": post.is_ai_generated,
                "location": post.location,
                "moderation_status": post.moderation_status, 
                "is_comments_enabled": post.is_comments_enabled
            })
            
        user = User.objects.get(user_id=who_send_request)
        user_owner_posts = User.objects.get(user_id=user_id_for_post)
        return Response({
            "user": {
                "id": user_owner_posts.user_id,
                "username": user_owner_posts.username,
                "avatar": str(user_owner_posts.avatar),
                "official": user_owner_posts.official
            },
            "data": data,
            "more_posts": (index + limit) < total_posts,
            "total_posts": total_posts,
            "liked_posts": user.liked_posts
        }, status=status.HTTP_200_OK)
