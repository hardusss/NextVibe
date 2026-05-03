from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import EventCheckin, Reputation
from django.db.models import Sum

class UserEventConnectionsView(APIView):
    """
    GET /posts/user-event-connections/
    Returns a list of events the user attended, along with the other attendees and reputation earned.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        my_checkins = EventCheckin.objects.filter(user=request.user, is_registered=True).select_related('post')
        
        events_data = []
        for checkin in my_checkins:
            post = checkin.post
            rep_earned = Reputation.objects.filter(
                user=request.user, event=post, is_checkin=True
            ).aggregate(total=Sum('points'))['total'] or 0

            other_checkins = EventCheckin.objects.filter(
                post=post, is_registered=True
            ).exclude(user=request.user).select_related('user')

            connections = []
            for oc in other_checkins:
                avatar_url = None
                if oc.user.avatar and getattr(oc.user.avatar, 'name', None):
                    avatar_url = oc.user.avatar.url
                connections.append({
                    "user_id": oc.user.user_id,
                    "username": oc.user.username,
                    "avatar": avatar_url,
                })

            events_data.append({
                "event_id": post.id,
                "event_name": post.about,
                "reputation_earned": rep_earned,
                "connections": connections,
                "checked_in_at": checkin.checked_in_at
            })

        return Response(events_data, status=status.HTTP_200_OK)
