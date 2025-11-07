from ..serializers_pac import CommentSerializer, CommentReplySerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Comment
from ..models import CommentReply
from django.contrib.auth import get_user_model
from user.models import Notification

User = get_user_model()


class CommentCreateView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        if "comment_id" in request.data:
            comment = CommentReplySerializer(data=request.data)
        else:
            comment = CommentSerializer(data=request.data)
        if comment.is_valid():
            comment_obj = comment.save()
            user = User.objects.get(user_id=comment.data["owner"])
            
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
                
            user_data: dict = {
                "username": user.username,
                "avatar": str(user.avatar),
                "official": user.official
            }
            return Response(dict({"user": user_data}, **comment.data, **{"replises": []}) , status=status.HTTP_201_CREATED)
        return Response(comment.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, *args, **kwargs):
        comment = Comment.objects.get(id=kwargs["comment_id"])
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
class CommentReplyView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        comment = Comment.objects.get(id=kwargs["comment_id"])
        reply = CommentReplySerializer(data=request.data)
        if reply.is_valid():
            reply.save()
            user = User.objects.get(user_id=reply.data["owner"])
            user_data: dict = {
                "username": user.username,
                "avatar": str(user.avatar),
                "official": user.official
            }
            return Response(dict({"user": user_data}, **reply.data), status=status.HTTP_201_CREATED)
        return Response(reply.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, *args, **kwargs):
        reply = CommentReply.objects.get(id=kwargs["reply_id"])
        reply.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)