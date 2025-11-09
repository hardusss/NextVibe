from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from user.models import Notification
from user.src.clear_notify_cache import clear_notification_cache


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
        clear_notification_cache(user.user_id)

        return Response(
            {"detail": f"{updated_count} notifications marked as read."},
            status=status.HTTP_200_OK
        )
