from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest, EventCheckin


class EventCheckinView(APIView):
    """
    POST /posts/event-checkin/<post_id>/
    Called by the attendee after tapping NFC and opening the deeplink.
    Checks if the user has an approved EventRequest, creates a check-in record.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        # Check if user has an approved event request
        is_registered = EventRequest.objects.filter(
            user=request.user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        # Create or get check-in record
        checkin, created = EventCheckin.objects.get_or_create(
            user=request.user,
            post=post,
            defaults={'is_registered': is_registered}
        )

        if not created:
            # Update registration status in case it changed
            if checkin.is_registered != is_registered:
                checkin.is_registered = is_registered
                checkin.save(update_fields=['is_registered'])

        avatar_url = None
        if request.user.avatar and getattr(request.user.avatar, 'name', None):
            avatar_url = request.user.avatar.url

        return Response({
            "verified": is_registered,
            "already_checked_in": not created,
            "user_id": request.user.user_id,
            "username": request.user.username,
            "avatar": avatar_url,
            "checked_in_at": checkin.checked_in_at,
            "message": "You're verified! Welcome to the event." if is_registered
                       else "You are not registered for this event."
        }, status=status.HTTP_200_OK)


class EventCheckinListView(APIView):
    """
    GET /posts/event-checkin/list/<post_id>/
    Returns all users who checked in via NFC for this event.
    Only the event owner can access this endpoint.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        if post.owner != request.user:
            return Response(
                {"error": "Not authorized"},
                status=status.HTTP_403_FORBIDDEN
            )

        checkins = EventCheckin.objects.filter(post=post).select_related('user')

        data = [
            {
                "user_id": c.user.user_id,
                "username": c.user.username,
                "avatar": c.user.avatar.url if c.user.avatar and getattr(c.user.avatar, 'name', None) else None,
                "is_registered": c.is_registered,
                "checked_in_at": c.checked_in_at,
            }
            for c in checkins
        ]

        registered_count = sum(1 for d in data if d['is_registered'])

        return Response({
            "total": len(data),
            "registered": registered_count,
            "unregistered": len(data) - registered_count,
            "checkins": data,
        }, status=status.HTTP_200_OK)
