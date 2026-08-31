import secrets
import json
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest, EventCheckin
from user.models import User

TOKEN_TTL = 120  # seconds (time-limited window)
TOKEN_PREFIX = "proximity:"


class GenerateProximityTokenView(APIView):
    """
    POST /api/v1/posts/proximity/generate-token/
    Body: { "interaction_type": "checkin" | "networking", "event_id": int }
    Returns: { "token": "<8-char-token>" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interaction_type = request.data.get('interaction_type')
        event_id = request.data.get('event_id')

        if interaction_type not in ('checkin', 'networking'):
            return Response(
                {"error": "interaction_type must be 'checkin' or 'networking'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not event_id:
            return Response(
                {"error": "event_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify event exists
        try:
            post = Post.objects.get(id=event_id, is_luma_event=True)
        except Post.DoesNotExist:
            return Response(
                {"error": "Event not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Generate cryptographically secure token
        token = secrets.token_urlsafe(6)  # Produces 8 chars

        # Store in Cache with TTL (temporary, non-single-use)
        payload = {
            "user_id": str(request.user.user_id),
            "event_id": int(event_id),
            "interaction_type": str(interaction_type),
        }

        cache_key = f"{TOKEN_PREFIX}{token}"
        cache.set(cache_key, payload, timeout=TOKEN_TTL)

        return Response({"token": token}, status=status.HTTP_200_OK)


class VerifyProximityTokenView(APIView):
    """
    POST /api/v1/posts/proximity/verify-token/
    Body: { "token": str, "latitude": float (optional), "longitude": float (optional) }
    
    Retrieves the temporary token from cache.
    Dispatches to the appropriate business logic based on interaction_type.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('token')

        if not token:
            return Response(
                {"error": "token is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')

        cache_key = f"{TOKEN_PREFIX}{token}"
        payload = cache.get(cache_key)

        if not payload:
            return Response(
                {"error": "Token is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                pass

        if not isinstance(payload, dict):
            return Response(
                {"error": "Invalid token payload."},
                status=status.HTTP_400_BAD_REQUEST
            )

        broadcaster_user_id = payload.get('user_id')
        event_id = payload.get('event_id')
        interaction_type = payload.get('interaction_type')

        # Prevent self-interaction
        if str(request.user.user_id) == str(broadcaster_user_id):
            return Response(
                {"error": "You cannot interact with yourself."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if interaction_type == 'networking':
            return self._handle_networking(
                request.user, event_id, broadcaster_user_id, latitude, longitude
            )
        elif interaction_type == 'checkin':
            return self._handle_checkin(
                request.user, event_id, latitude, longitude
            )
        else:
            return Response(
                {"error": "Unknown interaction type."},
                status=status.HTTP_400_BAD_REQUEST
            )

    def _handle_networking(self, scanner_user, event_id, broadcaster_user_id, latitude, longitude):
        """Delegate to the extracted networking logic."""
        from .event_connections import process_nfc_connect
        return process_nfc_connect(
            requesting_user=scanner_user,
            event_id=event_id,
            scanned_user_id=broadcaster_user_id,
            latitude=latitude,
            longitude=longitude
        )

    def _handle_checkin(self, user, event_id, latitude, longitude):
        """Handle event check-in via token."""
        post = get_object_or_404(Post, id=event_id, is_luma_event=True)

        # Geolocation check (same as EventCheckinView)
        if post.h3_geo:
            if latitude is None or longitude is None:
                return Response(
                    {"error": "Location coordinates are required to check in."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                import h3
                lat = float(latitude)
                lng = float(longitude)
                event_res = h3.get_resolution(post.h3_geo)
                user_cell = h3.latlng_to_cell(lat, lng, event_res)
                if h3.grid_distance(user_cell, post.h3_geo) > 2:
                    return Response(
                        {"error": "You must be physically present at the event zone to check in."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                print(f"Error checking check-in geolocation: {e}")
                return Response(
                    {"error": "Invalid location coordinates provided."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        is_registered = EventRequest.objects.filter(
            user=user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        post_image = None
        media = post.media.first()
        if media and getattr(media, 'file', None):
            post_image = media.file_url

        avatar_url = None
        if user.avatar and getattr(user.avatar, 'name', None):
            avatar_url = user.avatar.url

        message = "You're verified! Welcome to the event." if is_registered else "You are not registered for this event."

        return Response({
            "verified": is_registered,
            "interaction_type": "checkin",
            "user_id": user.user_id,
            "username": user.username,
            "avatar": avatar_url,
            "post_image": post_image,
            "post_name": post.about or "Event",
            "message": message,
        }, status=status.HTTP_200_OK)
