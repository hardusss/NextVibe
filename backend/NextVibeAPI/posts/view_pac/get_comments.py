from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Comment
from ..models import CommentReply
from django.contrib.auth import get_user_model
from ..models import Post

User = get_user_model()

class GetCommentView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, post_id: int) -> Response:
        comments = Comment.objects.filter(post__id=post_id)[::-1]
        data = [{"post_id": post_id, "author": User.objects.get(user_id=Post.objects.get(id=post_id).owner.user_id).username}]
        for comment in comments:
            try:
                replies = CommentReply.objects.filter(comment=comment)
            
            except CommentReply.DoesNotExist:
                replies = None
            data.append({
                "user": {
                    "username": User.objects.get(user_id=comment.owner.user_id).username,
                    "avatar": str(User.objects.get(user_id=comment.owner.user_id).avatar),
                    "official": User.objects.get(user_id=comment.owner.user_id).official
                    },
                "user_id": comment.owner.user_id,
                "id": comment.id,
                "content": comment.content,
                "create_at": comment.create_at,
                "count_likes": comment.count_likes,
                "replies": [
                    {
                        "user": {
                            "username": User.objects.get(user_id=r.owner.user_id).username,
                            "avatar": str(User.objects.get(user_id=r.owner.user_id).avatar),
                            "official": User.objects.get(user_id=r.owner.user_id).official
                            },
                        "user_id": r.owner.user_id,
                        "reply_id": r.id,
                        "content": r.content,
                        "create_at": r.create_at,
                        "count_likes": r.count_likes
                        }
                    for r in replies if replies is not None # List generator
                    ]
            })
            
        return Response(data, status=status.HTTP_200_OK)