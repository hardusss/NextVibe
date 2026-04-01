"""A module for like or dislike comment or comment reply"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from ..models import Comment, CommentReply
from user.models import Notification
from user.src.clear_notify_cache import clear_notification_cache
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()


class LikeCommentView(APIView):
    """
    A class for ApiView which can like or dislike comment or comment reply
    Args:
        APIView (_type_): Parent class from drf for api
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comment_like"

    def put(self, request, comment_id: int) -> Response:
        """
        Args:
            request: a required parameter for drf function api view
            comment_id (int): comment_id it is a pk of Comment or CommentReply model
            is_reply (bool): indicates if the like is for a reply instead of a comment
        Returns:
            Response: A data (success or not) and status
        """
        is_reply = request.query_params.get("is_reply", "false").lower() == 'true'
        
        try:
            user = User.objects.get(user_id=request.user.user_id)
        except User.DoesNotExist:
            return Response(
                {"data": "Error: user not exist"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            if is_reply:
                comment = CommentReply.objects.select_related('comment', 'owner').get(id=comment_id)
                liked_field = 'liked_comment_replies'
            else:
                comment = Comment.objects.select_related('post', 'owner').get(id=comment_id)
                liked_field = 'liked_comments'
        except (Comment.DoesNotExist, CommentReply.DoesNotExist):
            return Response(
                {"data": f"{'Reply' if is_reply else 'Comment'} does not exist"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        liked_items = getattr(user, liked_field, [])
        
        if comment_id in liked_items:
            liked_items.remove(comment_id)
            comment.count_likes = max(0, comment.count_likes - 1)
            setattr(user, liked_field, liked_items)
            comment.save()
            user.save()
            
            return Response(
                {"data": f"{'Reply' if is_reply else 'Comment'} is unliked"}, 
                status=status.HTTP_200_OK
            )
        
        else:
            liked_items.append(comment_id)
            comment.count_likes += 1
            setattr(user, liked_field, liked_items)
            comment.save()
            user.save()
            
            if user != comment.owner:
                if is_reply:
                    post = comment.comment.post
                    text = f"{user.username} liked your reply!"

                    existing = Notification.objects.filter(
                        sender=user,
                        recipient=comment.owner,
                        post=post,
                        notification_type="comment_like",
                        comment_reply=comment
                    ).exists()
                    
                    if not existing:
                        Notification.objects.create(
                            sender=user,
                            recipient=comment.owner,
                            post=post,
                            notification_type="comment_like",
                            text_preview=text,
                            comment=comment.comment,  
                            comment_reply=comment  
                        )
                else:
                    post = comment.post
                    text = f"{user.username} liked your comment!"

                    existing = Notification.objects.filter(
                        sender=user,
                        recipient=comment.owner,
                        post=post,
                        notification_type="comment_like",
                        comment=comment
                    ).exists()
                    
                    if not existing:
                        Notification.objects.create(
                            sender=user,
                            recipient=comment.owner,
                            post=post,
                            notification_type="comment_like",
                            text_preview=text,
                            comment=comment
                        )
            
            return Response(
                {"data": "Success"}, 
                status=status.HTTP_200_OK
            )