from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
import h3
from ..models import Post


class EventUpdateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post"

    def patch(self, request, post_id) -> Response:
        """
        Partially update event metadata.
        Required that the requesting user is the owner of the event.
        """
        post = get_object_or_404(Post, id=post_id)

        # Permissions check
        if post.owner != request.user:
            return Response(
                {"error": "Not authorized to update this event."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if it is a Luma event
        if not post.is_luma_event:
            return Response(
                {"error": "This post is not registered as a Luma event."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Fields to update
        about = request.data.get("about")
        if about is not None:
            post.about = about

        location = request.data.get("location")
        if location is not None:
            post.location = location

        coords = request.data.get("coords")
        if coords is not None:
            try:
                lat = float(coords.get("lat"))
                lng = float(coords.get("lng"))
                res = int(request.data.get("resolution", 11))
                post.h3_geo = h3.latlng_to_cell(lat, lng, res)
            except (ValueError, TypeError, KeyError) as e:
                return Response(
                    {"error": f"Invalid coordinates or resolution: {e}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        start_time_str = request.data.get("luma_event_start_time")
        if start_time_str is not None:
            if start_time_str == "":
                post.luma_event_start_time = None
            else:
                parsed = parse_datetime(start_time_str)
                if not parsed:
                    return Response(
                        {"error": "Invalid start time format (expected ISO 8601)."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                post.luma_event_start_time = parsed

        end_time_str = request.data.get("luma_event_end_time")
        if end_time_str is not None:
            if end_time_str == "":
                post.luma_event_end_time = None
            else:
                parsed = parse_datetime(end_time_str)
                if not parsed:
                    return Response(
                        {"error": "Invalid end time format (expected ISO 8601)."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                post.luma_event_end_time = parsed

        total_supply = request.data.get("total_supply")
        if total_supply is not None:
            try:
                ts = int(total_supply)
                if ts < post.minted_count:
                    return Response(
                        {"error": f"Total supply cannot be less than minted count ({post.minted_count})."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                post.total_supply = ts
            except (ValueError, TypeError):
                return Response(
                    {"error": "Invalid total supply. Must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Save fields
        post.save()

        # Build response representation
        return Response({
            "success": True,
            "id": post.id,
            "about": post.about,
            "location": post.location,
            "h3_geo": post.h3_geo,
            "luma_event_url": post.luma_event_url,
            "luma_event_start_time": post.luma_event_start_time.isoformat() if post.luma_event_start_time else None,
            "luma_event_end_time": post.luma_event_end_time.isoformat() if post.luma_event_end_time else None,
            "total_supply": post.total_supply,
            "minted_count": post.minted_count
        }, status=status.HTTP_200_OK)
