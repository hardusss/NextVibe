"""A module for like or dislike comment or comment reply"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from ..models import Comment, CommentReply


User = get_user_model()

class LikeCommentView(APIView):
    """
    A class for ApiView which can like or dislike comment or comment reply
    Args:
        APIView (_type_): Parent class from drf for api

    """
    permission_classes = [IsAuthenticated] # checks if the user is authorized

    def put(self, request, comment_id: int) -> Response:
        """
        Args:
            request: a required parameter for drf dunction api view
            comment_id (int): comment_id it is a pk of Comment or CommentReply model
            is_reply (bool): indicates if the like is for a reply instead of a comment

        Returns:
            Response: A data (success or not) and status
        """
        is_reply = request.query_params.get("is_reply").lower() == 'true'
        try:
            user = User.objects.get(user_id=request.user.user_id)
        except User.DoesNotExist:
            return Response({"data": "Error: user not exist"}, status=status.HTTP_404_NOT_FOUND)
        
        try:
            if is_reply:
                comment = CommentReply.objects.get(id=comment_id)
                liked_field = 'liked_comment_replies'
            else:
                comment = Comment.objects.get(id=comment_id)
                liked_field = 'liked_comments'
        except (Comment.DoesNotExist, CommentReply.DoesNotExist):
            return Response(
                {"data": f"{'Reply' if is_reply else 'Comment'} does not exist"}, 
                status=status.HTTP_404_NOT_FOUND
            )

        liked_items = getattr(user, liked_field, [])
        
        if comment_id in liked_items:
            # Unlike
            liked_items.remove(comment_id)
            comment.count_likes = max(0, comment.count_likes - 1)  # Prevent negative likes
            setattr(user, liked_field, liked_items)
            comment.save()
            user.save()
            return Response(
                {"data": f"{'Reply' if is_reply else 'Comment'} is unliked"}, 
                status=status.HTTP_200_OK
            )
        else:
            # Like
            liked_items.append(comment_id)
            comment.count_likes += 1
            setattr(user, liked_field, liked_items)
            comment.save()
            user.save()
            return Response({"data": "Success"}, status=status.HTTP_200_OK)