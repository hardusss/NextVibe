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
        who_send_request: int = int(request.user.user_id)
        
        posts = Post.objects.filter(owner__user_id=id).order_by("-id")[int(index):]
        data = []
        for post in posts:
            media = PostsMedia.objects.filter(post=post)
            media_data = [{"id": m.id, "media_url": str(m.file)} for m in media] if media.exists() else None
            
            data.append({
                "user_id": post.owner.user_id,
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": media_data,
                "create_at": post.create_at,
            })
            
        user = User.objects.get(user_id=who_send_request)
        return Response({
            "data": data,
            "more_posts": len(data) > 0,
            "liked_posts": user.liked_posts
        }, status=status.HTTP_200_OK)
