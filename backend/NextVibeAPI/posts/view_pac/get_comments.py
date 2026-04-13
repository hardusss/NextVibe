from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from ..models import Comment, Post
from user.models import InviteUser


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
            .select_related("owner", "owner__og_avatar")
            .prefetch_related(
                "replies",
                "replies__owner",
                "replies__owner__og_avatar",
            )
            .order_by("-create_at")
        )

        all_owner_ids = set()
        for comment in comments:
            all_owner_ids.add(comment.owner.user_id)
            for reply in comment.replies.all():
                all_owner_ids.add(reply.owner.user_id)

        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(owner_id__in=all_owner_ids)
        }

        def build_user(owner):
            og = getattr(owner, 'og_avatar', None)
            return {
                "username": owner.username,
                "avatar": owner.avatar.url if owner.avatar else None,
                "official": owner.official,
                "is_og": og is not None,
                "og_edition": og.edition if og is not None else None,
                "invited_count": invite_counts.get(owner.user_id, 0),
            }

        data = {
            "post_id": post_id,
            "author": post.owner.username,
            "comments": []
        }

        for comment in comments:
            comment_data = {
                "user": build_user(comment.owner),
                "user_id": comment.owner.user_id,
                "id": comment.id,
                "content": comment.content,
                "create_at": comment.create_at,
                "count_likes": comment.count_likes,
                "replies": []
            }
            for reply in comment.replies.all():
                comment_data["replies"].append({
                    "user": build_user(reply.owner),
                    "user_id": reply.owner.user_id,
                    "reply_id": reply.id,
                    "content": reply.content,
                    "create_at": reply.create_at,
                    "count_likes": reply.count_likes,
                })
            data["comments"].append(comment_data)

        return Response(data, status=status.HTTP_200_OK)