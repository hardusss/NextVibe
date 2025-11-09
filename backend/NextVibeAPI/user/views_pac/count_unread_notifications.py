from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from user.models import Notification
from django.core.cache import cache
from typing import Self, NewType

CacheKey = NewType("CacheKey", str)


class GetCountUnreadNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self: Self, request: Request) -> Response:
        """Method for getting unread notifications"""

        # Get user directly from request
        user = request.user

        # Cache key
        cache_key: CacheKey = CacheKey(f"user_{user.user_id}_notifications_count")

        # Try to get from cache
        count_unread_notifications_cache = cache.get(cache_key)
        if count_unread_notifications_cache is not None:
            return Response({
                "status": count_unread_notifications_cache > 0,
                "count": count_unread_notifications_cache
            }, status=status.HTTP_200_OK)

        # Calculate unread notifications count
        count_unread_notifications: int = Notification.objects.filter(
            recipient=user, is_read=False
        ).count()

        # Set cache (30 seconds)
        cache.set(cache_key, count_unread_notifications, timeout=30)

        return Response({
            "status": count_unread_notifications > 0,
            "count": count_unread_notifications
        }, status=status.HTTP_200_OK)
