from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from ..models import Post, Reputation
import h3


class EventTapsView(APIView):
    """
    GET /posts/event-taps/<int:post_id>/
    Returns coordinates of all check-ins and networking taps for a specific event,
    along with metadata about participants, points earned, and tap types.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id) -> Response:
        try:
            post = Post.objects.get(id=post_id, is_luma_event=True)
        except Post.DoesNotExist:
            return Response({"error": "Event not found"}, status=status.HTTP_404_NOT_FOUND)

        # Decode event's default center location from its h3_geo
        center_coords = None
        if post.h3_geo:
            try:
                lat, lng = h3.cell_to_latlng(post.h3_geo)
                center_coords = {"lat": float(lat), "lng": float(lng)}
            except Exception as e:
                print(f"[EventTapsView] Failed to decode post h3_geo {post.h3_geo}: {e}")

        # Helper to decode coordinates from a reputation's geo-index, falling back to center
        def get_coords(rep):
            if rep.h3_geo:
                try:
                    lat, lng = h3.cell_to_latlng(rep.h3_geo)
                    return {"lat": float(lat), "lng": float(lng)}
                except Exception as e:
                    print(f"[EventTapsView] Failed to decode reputation h3_geo {rep.h3_geo}: {e}")
            return center_coords

        # Helper to serialize user metadata
        def serialize_user(user):
            if not user:
                return None
            avatar_url = None
            if user.avatar and getattr(user.avatar, 'name', None):
                raw = str(user.avatar)
                if raw.startswith("https://") or raw.startswith("http://"):
                    avatar_url = raw
                else:
                    avatar_url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{raw}"
            return {
                "user_id": user.user_id,
                "username": user.username,
                "avatar": avatar_url
            }

        taps = []

        # Fetch all reputation records for this event
        reps = Reputation.objects.filter(event=post).select_related('user', 'given_by')

        # 1. Process Check-ins
        checkin_reps = [r for r in reps if r.is_checkin]
        for rep in checkin_reps:
            coords = get_coords(rep)
            if coords:
                taps.append({
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "type": "checkin",
                    "user": serialize_user(rep.user),
                    "given_by": serialize_user(rep.given_by),
                    "points": rep.points
                })

        # 2. Process Networking (group mutual scanner/scanned pairs to avoid duplicate map markers)
        networking_reps = [r for r in reps if not r.is_checkin]
        net_groups = {}
        for rep in networking_reps:
            # Create a unique key for the user pair
            key = frozenset({rep.user.user_id, rep.given_by.user_id})
            if key not in net_groups:
                net_groups[key] = []
            net_groups[key].append(rep)

        for key, group in net_groups.items():
            if not group:
                continue
            rep1 = group[0]
            coords = get_coords(rep1)
            if not coords:
                continue

            user_a = rep1.user
            user_b = rep1.given_by

            points_a = rep1.points
            points_b = 0

            # If there's a paired record, extract its points
            if len(group) > 1:
                rep2 = group[1]
                if rep2.user == user_a:
                    points_a = rep2.points
                    points_b = rep1.points
                else:
                    points_b = rep2.points

            taps.append({
                "lat": coords["lat"],
                "lng": coords["lng"],
                "type": "networking",
                "user": serialize_user(user_a),
                "given_by": serialize_user(user_b),
                "points": points_a,
                "points_given_by": points_b
            })

        return Response({
            "event_id": post.id,
            "title": post.about or "Event",
            "center": center_coords,
            "taps": taps
        }, status=status.HTTP_200_OK)
