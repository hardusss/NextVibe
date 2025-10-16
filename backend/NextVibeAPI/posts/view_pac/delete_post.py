"""Method for delete post"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post

class DeletePostView(APIView):
    permission_classes = [IsAuthenticated]
    def delete(self, request) -> Response:
        post_id: int = request.query_params.get("postId", 0)

        # Validation
        if post_id == 0:
            return Response({"error": "Post not foud, check post id"}, status=status.HTTP_404_NOT_FOUND)
        
        post = Post.objects.get(id=post_id)
        if post and post.owner.user_id == request.user.user_id:
            try:
                post.delete()
                return Response({"data": "Post deleted"}, status=status.HTTP_200_OK)
            except Exception as ex:
                return Response({"error":f"Can't delete the post. Error: {ex}"})
        else:
            return Response({"data": "You can't delete post another user"})