from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.conf import settings
from django.core.cache import cache
from django.db import transaction

from ..models import Block, User
from user.src.clear_notify_cache import clear_notification_cache

PAGE_SIZE = 12


def _without(ids, user_id):
    # Follow lists are JSON; compare as strings in case an old write stored "12"
    return [value for value in (ids or []) if str(value) != str(user_id)]


def _clear_follow_list_cache(user_id):
    # get-readers / get-follows cache pages by start index (0, 12, 24, ...)
    for index in range(0, PAGE_SIZE * 5, PAGE_SIZE):
        for end in ("True", "False"):
            cache.delete(f"readers_{user_id}_page_{index}_end_{end}")
            cache.delete(f"follows_{user_id}_page_{index}_end_{end}")


def _avatar_url(user):
    if not user.avatar:
        return None
    raw = str(user.avatar)
    return raw if raw.startswith("https://") else f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{raw}"


class BlockUserView(APIView):
    """
    POST /users/block/  { "user_id": int }
    Hides both people from each other everywhere and removes any follow
    between them. Idempotent: 201 for a new block, 204 if it already exists.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "block"

    def post(self, request):
        try:
            target_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        my_id = request.user.user_id
        if target_id == my_id:
            return Response({"error": "You can't block yourself"}, status=status.HTTP_400_BAD_REQUEST)

        if not User.objects.filter(user_id=target_id).exists():
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            _, created = Block.objects.get_or_create(blocker_id=my_id, blocked_id=target_id)
            if not created:
                return Response(status=status.HTTP_204_NO_CONTENT)

            # Lock both rows in id order so a concurrent follow toggle can't
            # write back a stale follow list after we clean it.
            users = list(
                User.objects.select_for_update()
                .filter(user_id__in=[my_id, target_id])
                .order_by("user_id")
            )
            for user in users:
                other_id = target_id if user.user_id == my_id else my_id
                user.follow_for = _without(user.follow_for, other_id)
                user.readers = _without(user.readers, other_id)
                user.follows_count = len(user.follow_for)
                user.readers_count = len(user.readers)
                user.save(update_fields=["follow_for", "readers", "follows_count", "readers_count"])

        for user_id in (my_id, target_id):
            _clear_follow_list_cache(user_id)
            clear_notification_cache(user_id)

        return Response({"message": "Blocked"}, status=status.HTTP_201_CREATED)


class UnblockUserView(APIView):
    """
    DELETE /users/block/<user_id>/
    Idempotent: 204 whether or not a block existed.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "block"

    def delete(self, request, user_id: int):
        deleted, _ = Block.objects.filter(blocker_id=request.user.user_id, blocked_id=user_id).delete()
        if deleted:
            clear_notification_cache(request.user.user_id)
            clear_notification_cache(user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockedUsersView(APIView):
    """
    GET /users/blocked/?index=0
    People the caller blocked, newest first, PAGE_SIZE per page.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "block"

    def get(self, request):
        try:
            index = max(int(request.query_params.get("index") or 0), 0)
        except ValueError:
            index = 0

        blocks = list(
            Block.objects
            .filter(blocker_id=request.user.user_id, blocked__is_baned=False)
            .select_related("blocked")
            .order_by("-created_at", "-id")[index:index + PAGE_SIZE + 1]
        )

        data = [
            {
                "user_id": block.blocked.user_id,
                "username": block.blocked.username,
                "avatar": _avatar_url(block.blocked),
                "official": block.blocked.official,
                "seeker_verified": block.blocked.seeker_verified,
                "blocked_at": block.created_at,
            }
            for block in blocks[:PAGE_SIZE]
        ]
        return Response({"data": data, "end": len(blocks) <= PAGE_SIZE}, status=status.HTTP_200_OK)
