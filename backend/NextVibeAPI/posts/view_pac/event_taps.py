from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, Reputation
from django.db.models import F
import h3


class EventTapsView(APIView):
    """
    GET /posts/event-taps/<int:post_id>/
    Returns coordinates of all check-ins and networking taps for a specific event.
    Used for rendering event tap heatmaps.
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

        taps = []

        # 1. Fetch check-in reputation points
        checkin_reps = Reputation.objects.filter(event=post, is_checkin=True)
        for rep in checkin_reps:
            coords = get_coords(rep)
            if coords:
                taps.append({
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "type": "checkin"
                })

        # 2. Fetch distinct networking interactions (one reputation record per interaction)
        networking_reps = Reputation.objects.filter(
            event=post,
            is_checkin=False
        ).filter(user__user_id__lt=F('given_by__user_id'))

        for rep in networking_reps:
            coords = get_coords(rep)
            if coords:
                taps.append({
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "type": "networking"
                })

        return Response({
            "event_id": post.id,
            "title": post.about or "Event",
            "center": center_coords,
            "taps": taps
        }, status=status.HTTP_200_OK)
