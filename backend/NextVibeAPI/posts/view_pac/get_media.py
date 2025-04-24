from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser


User: AbstractUser = get_user_model()


class GetMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        post_id = request.query_params.get("post_id")
        post = Post.objects.get(id=post_id)
        media = PostsMedia.objects.filter(post=post)
        media_data = [{"id": m.id, "media_url": str(m.file)} for m in media] if media.exists() else None
        return Response(media_data, status=200)