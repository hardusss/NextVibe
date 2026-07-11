from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import EventCheckin, Reputation, Post
from user.models import User
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta
import h3

class UserEventConnectionsView(APIView):
    """
    GET /posts/user-event-connections/
    Returns a list of events the user attended, along with the other attendees and reputation earned.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        target_user = request.user
        user_id_param = request.query_params.get('user_id')
        if user_id_param:
            try:
                target_user = User.objects.get(user_id=user_id_param)
            except User.DoesNotExist:
                return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        my_checkins = EventCheckin.objects.filter(
            user=target_user, is_registered=True
        ).select_related('post')

        events_data = []
        now = timezone.now()

        for checkin in my_checkins:
            post = checkin.post

            checkin_rep = Reputation.objects.filter(
                user=target_user, event=post, is_checkin=True
            ).aggregate(total=Sum('points'))['total'] or 0

            peer_reps = Reputation.objects.filter(
                event=post,
                is_checkin=False,
            ).filter(
                Q(user=target_user) | Q(given_by=target_user)
            ).select_related('user', 'given_by')

            peer_map = {}
            for rep in peer_reps:
                if rep.user == target_user:
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


class EventNFCConnectView(APIView):
    """
    POST /posts/event-nfc-connect/
    Body: { "event_id": int, "scanned_user_id": int, "latitude": float, "longitude": float }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        event_id = request.data.get('event_id')
        scanned_user_id = request.data.get('scanned_user_id')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        h3_geo_val = None
        if latitude is not None and longitude is not None:
            try:
                # Use resolution 15 for max precision
                h3_geo_val = h3.latlng_to_cell(float(latitude), float(longitude), res=15)
            except Exception as e:
                print(f"H3 calculation error: {e}")

        if not event_id or not scanned_user_id:
            return Response({"error": "event_id and scanned_user_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        if str(request.user.user_id) == str(scanned_user_id):
            return Response({"error": "You cannot network with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            post = Post.objects.get(id=event_id, is_luma_event=True)
            scanned_user = User.objects.get(user_id=scanned_user_id)
        except (Post.DoesNotExist, User.DoesNotExist):
            return Response({"error": "Invalid event or user."}, status=status.HTTP_404_NOT_FOUND)

        # Geolocation check
        if post.h3_geo:
            if latitude is None or longitude is None:
                return Response({"error": "Location coordinates are required for networking at this event."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                lat = float(latitude)
                lng = float(longitude)
                event_res = h3.get_resolution(post.h3_geo)
                user_cell = h3.latlng_to_cell(lat, lng, event_res)
                if h3.grid_distance(user_cell, post.h3_geo) > 1:
                    return Response({"error": "You must be physically present at the event zone to network."}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                print(f"Error checking networking geolocation: {e}")
                return Response({"error": "Invalid location coordinates provided."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if the scanning user is registered/checked-in
        is_registered = EventCheckin.objects.filter(user=request.user, post=post, is_registered=True).exists()
        if not is_registered:
            return Response({"error": "You must check-in to this event first."}, status=status.HTTP_403_FORBIDDEN)

        # Check if they already networked at this event
        already_networked = Reputation.objects.filter(
            event=post,
            is_checkin=False,
            user=request.user,
            given_by=scanned_user
        ).exists()

        if already_networked:
            return Response({"error": "You have already connected with this user at this event."}, status=status.HTTP_400_BAD_REQUEST)

        # Calculate total rep for both
        rep_scanner = Reputation.objects.filter(user=request.user).aggregate(total=Sum('points'))['total'] or 0
        rep_scanned = Reputation.objects.filter(user=scanned_user).aggregate(total=Sum('points'))['total'] or 0

        # Formula: max(2, min(20, int((HighRep - LowRep) * 0.15)))
        # For the scanner (request.user):
        if rep_scanned > rep_scanner:
            scanner_gains = max(2, min(20, int((rep_scanned - rep_scanner) * 0.15)))
            scanned_gains = 2
        else:
            scanner_gains = 2
            scanned_gains = max(2, min(20, int((rep_scanner - rep_scanned) * 0.15)))

        # Create Reputation records
        Reputation.objects.create(
            user=request.user,
            given_by=scanned_user,
            points=scanner_gains,
            is_checkin=False,
            event=post,
            h3_geo=h3_geo_val
        )

        Reputation.objects.create(
            user=scanned_user,
            given_by=request.user,
            points=scanned_gains,
            is_checkin=False,
            event=post,
            h3_geo=h3_geo_val
        )

        # Avatar URL for response
        avatar_url = None
        if scanned_user.avatar and getattr(scanned_user.avatar, 'name', None):
            avatar_url = scanned_user.avatar.url

        return Response({
            "success": True,
            "message": f"Connected with {scanned_user.username}!",
            "earned_points": scanner_gains,
            "scanned_user": {
                "user_id": scanned_user.user_id,
                "username": scanned_user.username,
                "avatar": avatar_url,
                "is_official": scanned_user.official,
            }
        }, status=status.HTTP_200_OK)