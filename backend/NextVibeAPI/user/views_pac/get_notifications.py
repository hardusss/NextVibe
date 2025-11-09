from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from user.models import Notification
from django.core.cache import cache
from typing import Self, Any

PAGE_SIZE: int = 15

class GetNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self: Self, request: Request) -> Response:
        user: Any = request.user
        page_number: int = int(request.query_params.get("page", 1))
        cache_key: str = f"user_{user.user_id}_notifications_page_{page_number}"
        cached = cache.get(cache_key)
        if cached:
            return Response({"data": cached}, status=status.HTTP_200_OK)

        offset: int = (page_number - 1) * PAGE_SIZE
        notifications = (
            Notification.objects.filter(recipient=user)
            .select_related("sender", "post", "comment", "comment_reply")
            .order_by("-created_at")
            .values(
                "id",
                "sender__user_id",
                "sender__username",
                "sender__avatar",
                "notification_type",
                "post",
                "post__about",
                "comment",
                "comment__content",
                "comment_reply",
                "comment_reply__content",
                "text_preview",
                "is_read",
                "created_at"
            )[offset:offset + PAGE_SIZE]
        )
        notifications_data = list(notifications)
        load_more: bool = len(notifications_data) == PAGE_SIZE 
        cache.set(cache_key, {"notify": notifications_data, "load_more": load_more}, timeout=60)

        return Response({"data": {"notify": notifications_data, "load_more": load_more}}, status=status.HTTP_200_OK)