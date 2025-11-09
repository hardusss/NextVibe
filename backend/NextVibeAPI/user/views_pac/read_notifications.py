from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from user.models import Notification
from django.core.cache import cache


class ReadNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        unread_qs = Notification.objects.filter(recipient=user, is_read=False)
        updated_count = unread_qs.update(is_read=True)

        if updated_count == 0:
            return Response(
                {"detail": "You have no unread notifications."},
                status=status.HTTP_200_OK
            )

        redis_client = getattr(cache, "client", None)
        if redis_client:
            client = redis_client.get_client()
            pattern = f"user_{user.user_id}_notifications_page_*"
            keys = client.keys(pattern)
            if keys:
                client.delete(*keys)

        cache.delete(f"user_{user.user_id}_notifications_count")

        return Response(
            {"detail": f"{updated_count} notifications marked as read."},
            status=status.HTTP_200_OK
        )
