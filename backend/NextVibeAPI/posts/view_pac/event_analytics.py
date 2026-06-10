from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, EventRequest, EventCheckin, Reputation
from django.db.models import Sum

class EventAnalyticsView(APIView):
    """
    GET /posts/event-analytics/<int:post_id>/
    Returns analytics data for a specific event (only accessible by the event owner).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        try:
            post = Post.objects.get(id=post_id, is_luma_event=True)
        except Post.DoesNotExist:
            return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

        # Ensure only the owner can view analytics
        if post.owner != request.user:
            return Response({"error": "Only the event owner can view analytics"}, status=status.HTTP_403_FORBIDDEN)

        # 1. Event Requests counts
        total_requests = EventRequest.objects.filter(post=post).count()
        accepted_requests = EventRequest.objects.filter(post=post, status=EventRequest.Status.APPROVED).count()
        rejected_requests = EventRequest.objects.filter(post=post, status=EventRequest.Status.REJECTED).count()

        # 2. NFC Check-ins
        nfc_checkins = EventCheckin.objects.filter(post=post, is_registered=True).count()

        # 3. Total IRL taps (NFC Networking)
        # Each networking tap creates 2 Reputation records (one for each user)
        # Therefore, we divide by 2 to get the number of distinct networking taps
        networking_records_count = Reputation.objects.filter(event=post, is_checkin=False).count()
        total_irl_taps = networking_records_count // 2

        # 4. Total reputation earned at this event
        total_reputation = Reputation.objects.filter(event=post).aggregate(total=Sum('points'))['total'] or 0

        data = {
            "total_requests": total_requests,
            "accepted_requests": accepted_requests,
            "rejected_requests": rejected_requests,
            "nfc_checkins": nfc_checkins,
            "total_irl_taps": total_irl_taps,
            "total_reputation_earned": total_reputation,
        }

        return Response(data, status=status.HTTP_200_OK)
