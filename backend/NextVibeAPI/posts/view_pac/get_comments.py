from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from ..models import Comment, Post


class GetCommentView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comments_list"

    def get(self, request, post_id: int) -> Response:

        post = (
            Post.objects
            .select_related("owner")
            .filter(id=post_id)
            .first()
        )

        if not post:
            return Response({"error": "Post not found"}, status=404)

        comments = (
            Comment.objects
            .filter(post_id=post_id)
            .select_related("owner")
            .prefetch_related(
                "replies",
                "replies__owner"
            )
            .order_by("-create_at")
        )

        data = {
            "post_id": post_id,
            "author": post.owner.username,
            "comments": []
        }

        for comment in comments:

            comment_data = {
                "user": {
                    "username": comment.owner.username,
                    "avatar": comment.owner.avatar.url if comment.owner.avatar else None,
                    "official": comment.owner.official
                },
                "user_id": comment.owner.user_id,
                "id": comment.id,
                "content": comment.content,
                "create_at": comment.create_at,
                "count_likes": comment.count_likes,
                "replies": []
            }

            for reply in comment.replies.all():

                comment_data["replies"].append({
                    "user": {
                        "username": reply.owner.username,
                        "avatar": reply.owner.avatar.url if reply.owner.avatar else None,
                        "official": reply.owner.official
                    },
                    "user_id": reply.owner.user_id,
                    "reply_id": reply.id,
                    "content": reply.content,
                    "create_at": reply.create_at,
                    "count_likes": reply.count_likes
                })

            data["comments"].append(comment_data)

        return Response(data, status=status.HTTP_200_OK)