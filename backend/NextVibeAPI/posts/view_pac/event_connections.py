from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import EventCheckin, Reputation
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta

class UserEventConnectionsView(APIView):
    """
    GET /posts/user-event-connections/
    Returns a list of events the user attended, along with the other attendees and reputation earned.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        my_checkins = EventCheckin.objects.filter(
            user=request.user, is_registered=True
        ).select_related('post')

        events_data = []
        now = timezone.now()

        for checkin in my_checkins:
            post = checkin.post

            checkin_rep = Reputation.objects.filter(
                user=request.user, event=post, is_checkin=True
            ).aggregate(total=Sum('points'))['total'] or 0

            peer_reps = Reputation.objects.filter(
                event=post,
                is_checkin=False,
            ).filter(
                Q(user=request.user) | Q(given_by=request.user)
            ).select_related('user', 'given_by')

            peer_map = {}
            for rep in peer_reps:
                if rep.user == request.user:
                    other = rep.given_by
                    direction = "received"
                else:
                    other = rep.user
                    direction = "given"

                uid = other.user_id
                if uid not in peer_map:
                    avatar_url = None
                    if other.avatar and getattr(other.avatar, 'name', None):
                        avatar_url = other.avatar.url
                    peer_map[uid] = {
                        "user_id": uid,
                        "username": other.username,
                        "is_official": other.official,
                        "avatar": avatar_url,
                        "rep_received": 0,
                        "rep_given": 0,
                    }
                if direction == "received":
                    peer_map[uid]["rep_received"] += rep.points
                else:
                    peer_map[uid]["rep_given"] += rep.points

            connections = list(peer_map.values())

            event_image = None
            media = post.media.first()
            if media and getattr(media, 'file', None):
                event_image = media.file_url

            is_active = False
            start = post.luma_event_start_time
            end = post.luma_event_end_time

            if start and end:
                is_active = start <= now <= end
            elif start:
                is_active = start <= now <= (start + timedelta(days=1))
            else:
                is_active = now <= (checkin.checked_in_at + timedelta(days=1))

            events_data.append({
                "event_id": post.id,
                "event_name": post.about or "Event",
                "event_image": event_image,
                "checkin_rep": checkin_rep,
                "total_rep": checkin_rep + sum(c["rep_received"] for c in connections),
                "connections": connections,
                "checked_in_at": checkin.checked_in_at,
                "is_active": is_active, 
            })

        return Response(events_data, status=status.HTTP_200_OK)