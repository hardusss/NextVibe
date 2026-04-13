"""Method for delete post"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

class DeletePostView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_delete"
    def delete(self, request) -> Response:
        post_id: int = request.query_params.get("postId", 0)

        # Validation
        if post_id == 0:
            return Response({"error": "Post not foud, check post id"}, status=status.HTTP_404_NOT_FOUND)
        
        try:
            post = Post.objects.get(id=post_id)
        except Post.DoesNotExist:
            return Response({"error": "Post not foud, check post id"}, status=status.HTTP_404_NOT_FOUND)
        
        if post and post.owner.user_id == request.user.user_id:
            try:
                user = User.objects.get(user_id=request.user.user_id)
                if user.post_count > 0:
                    user.post_count -= 1
                else:
                    user.post_count = 0
                user.save()
                post.is_hide = True
                post.save()
                return Response({"data": "Post deleted"}, status=status.HTTP_200_OK)
            except Exception as ex:
                return Response({"error": f"Can't delete the post. Error: {ex}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({"data": "You can't delete post another user"}, status=status.HTTP_400_BAD_REQUEST)