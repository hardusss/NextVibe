from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia

class PostMenuView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id: int) -> Response:
        posts = Post.objects.filter(owner__user_id=id)

        if not posts.exists():
            return Response({"error": "Error, post not exist"}, status=status.HTTP_404_NOT_FOUND)

        data = []
        for post in posts:
            media = PostsMedia.objects.filter(post=post).first()  # Беремо лише перше медіа
            media_data = {"id": media.id, "media_url": str(media.file)} if media else None  # Перевірка на випадок, якщо немає медіа

            data.append({
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": media_data  # Тут тільки 1 файл або None
            })

        return Response({"data": data}, status=status.HTTP_200_OK)
