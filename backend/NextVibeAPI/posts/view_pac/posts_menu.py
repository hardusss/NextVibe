from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia

class PostMenuView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id: int) -> Response:
        limit = request.query_params.get("limit", 12)  # Скільки постів отримати (за замовчуванням 12)
        offset = request.query_params.get("offset", 0)  # Зміщення (за замовчуванням 0)

        try:
            limit = int(limit)
            offset = int(offset)
            if limit <= 0 or offset < 0:
                raise ValueError
        except ValueError:
            return Response({"error": "Invalid limit or offset value"}, status=status.HTTP_400_BAD_REQUEST)

        posts = Post.objects.filter(owner__user_id=id).order_by("-id")[offset : offset + limit]  # Пагінація

        data = []
        for post in posts:
            media = PostsMedia.objects.filter(post=post).first()
            media_data = {"id": media.id, "media_url": str(media.file)} if media else None

            data.append({
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": media_data
            })

        return Response({
            "data": data,
            "next_offset": offset + limit if posts else None  # Новий offset для наступного запиту
        }, status=status.HTTP_200_OK)
