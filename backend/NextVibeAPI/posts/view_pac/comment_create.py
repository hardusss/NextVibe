from ..serializers_pac import CommentSerializer, CommentReplySerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Comment, CommentReply
from django.contrib.auth import get_user_model
from user.models import Notification
from user.src.clear_notify_cache import clear_notification_cache
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()


class CommentCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comment"

    def post(self, request, *args, **kwargs):
        if "comment_id" in request.data:
            comment = CommentReplySerializer(data=request.data)
        else:
            comment = CommentSerializer(data=request.data)

        if comment.is_valid():
            comment_obj = comment.save()
            user = User.objects.get(user_id=comment.data["owner"])

            if user != comment_obj.post.owner:
                existing = Notification.objects.filter(
                    sender=user,
                    recipient=comment_obj.post.owner,
                    post=comment_obj.post,
                    notification_type="comment",
                    comment=comment_obj
                ).first()
                
                if not existing:
                    Notification.objects.create(
                        sender=user,
                        recipient=comment_obj.post.owner,
                        post=comment_obj.post,
                        notification_type="comment",
                        text_preview=f"{user.username} commented on your post!",
                        comment=comment_obj
                    )

            user_data = {
                "username": user.username,
                "avatar": user.avatar.url,
                "official": user.official
            }
            return Response(
                dict({"user": user_data}, **comment.data, **{"replises": []}),
                status=status.HTTP_201_CREATED
            )
        
        return Response(comment.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, *args, **kwargs):
        comment = Comment.objects.get(id=kwargs["comment_id"])
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentReplyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comment"

    def post(self, request, *args, **kwargs):
        comment_id = kwargs["comment_id"]

        comment = Comment.objects.filter(id=comment_id).first()
        is_reply_to_reply = False

        if not comment:
            comment = CommentReply.objects.get(id=comment_id)
            is_reply_to_reply = True

        reply = CommentReplySerializer(data=request.data)

        if reply.is_valid():
            reply_obj = reply.save()
            user = reply_obj.owner

            if is_reply_to_reply:
                parent_reply = comment  

                if user != parent_reply.owner:
                    Notification.objects.create(
                        sender=user,
                        recipient=parent_reply.owner,
                        post=parent_reply.post,
                        comment=parent_reply.comment, 
                        comment_reply=reply_obj,
                        notification_type="comment_reply",
                        text_preview=f"{user.username} replied to your reply!"
                    )

            else:
                if user != comment.owner:
                    Notification.objects.create(
                        sender=user,
                        recipient=comment.owner,
                        post=comment.post,
                        comment=comment,
                        comment_reply=reply_obj,
                        notification_type="comment_reply",
                        text_preview=f"{user.username} replied to your comment!"
                    )

            user_data = {
                "username": user.username,
                "avatar": user.avatar.url,
                "official": user.official
            }

            return Response(
                dict({"user": user_data}, **reply.data),
                status=status.HTTP_201_CREATED
            )

        return Response(reply.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, *args, **kwargs):
        reply = CommentReply.objects.get(id=kwargs["reply_id"])
        reply.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)