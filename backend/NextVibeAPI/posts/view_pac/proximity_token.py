import logging
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

logger = logging.getLogger("posts.proximity")

TOKEN_TTL = 300  # seconds (time-limited window; long enough to cover the responder's confirmation step)
TOKEN_PREFIX = "proximity:"


class GenerateProximityTokenView(APIView):
    """
    POST /api/v1/posts/proximity/generate-token/
    Body: { "interaction_type": "checkin" | "networking" | "irl", "event_id": int (not for 'irl') }
    Returns: { "token": "<8-char-token>", "interaction_type": str, "event_id": int|null }

    The server owns the mode: an 'irl' request from a user with an active
    check-in is upgraded to 'networking' at that event, and a 'networking'
    request requires an active check-in for the event (mirroring the
    scanner-side gate in process_nfc_connect). The response echoes the
    resolved mode so the client UI can follow it.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        interaction_type = request.data.get('interaction_type')
        event_id = request.data.get('event_id')

        if interaction_type not in ('checkin', 'networking', 'irl'):
            return Response(
                {"error": "interaction_type must be 'checkin', 'networking' or 'irl'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if interaction_type == 'irl':
            event_id = None
            from .event_connections import get_active_checkins
            active = get_active_checkins(request.user)
            if active:
                # IRL is only for users with no active check-in; taps from a
                # checked-in attendee count for their event.
                post = active[0][0]
                interaction_type = 'networking'
                event_id = post.id
                logger.info(
                    "proximity.irl_upgraded_to_networking user=%s event=%s",
                    request.user.pk, post.id,
                )
        else:
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

            if interaction_type == 'networking':
                is_checked_in = EventCheckin.objects.filter(
                    user=request.user, post=post, is_registered=True
                ).exists()
                if not is_checked_in:
                    logger.info(
                        "proximity.networking_denied_no_checkin user=%s event=%s",
                        request.user.pk, post.id,
                    )
                    return Response(
                        {"error": "You must check in to this event first."},
                        status=status.HTTP_403_FORBIDDEN
                    )

        # Generate cryptographically secure token
        token = secrets.token_urlsafe(6)  # Produces 8 chars

        # Store in Cache with TTL (temporary, non-single-use)
        payload = {
            "user_id": str(request.user.user_id),
            "event_id": int(event_id) if event_id else None,
            "interaction_type": str(interaction_type),
        }

        cache_key = f"{TOKEN_PREFIX}{token}"
        cache.set(cache_key, payload, timeout=TOKEN_TTL)

        logger.info(
            "proximity.token_generated user=%s type=%s event=%s",
            request.user.pk, interaction_type, event_id,
        )
        return Response({
            "token": token,
            "interaction_type": interaction_type,
            "event_id": payload["event_id"],
        }, status=status.HTTP_200_OK)


class VerifyProximityTokenView(APIView):
    """
    POST /api/v1/posts/proximity/verify-token/
    Body: { "token": str, "latitude": float (optional), "longitude": float (optional),
            "preview": bool (optional) }

    Retrieves the temporary token from cache.
    Dispatches to the appropriate business logic based on interaction_type.
    With preview=true, networking/irl interactions run all validations and
    return the broadcaster + points without granting anything — the grant
    happens only on the follow-up call the responder's confirmation sends.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('token')
        preview = str(request.data.get('preview', '')).lower() in ('1', 'true', 'yes')

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
                logger.warning("proximity.token_payload_not_json user=%s", request.user.pk)

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
            response = self._handle_networking(
                request.user, event_id, broadcaster_user_id, latitude, longitude,
                commit=not preview
            )
        elif interaction_type == 'irl':
            response = self._handle_irl(
                request.user, broadcaster_user_id, latitude, longitude,
                commit=not preview
            )
        elif interaction_type == 'checkin':
            response = self._handle_checkin(
                request.user, event_id, latitude, longitude
            )
        else:
            return Response(
                {"error": "Unknown interaction type."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Echo the interaction type so clients can branch on it.
        if isinstance(response.data, dict) and 'interaction_type' not in response.data:
            response.data['interaction_type'] = interaction_type
        return response

    def _handle_networking(self, scanner_user, event_id, broadcaster_user_id, latitude, longitude, commit=True):
        """Delegate to the extracted networking logic."""
        from .event_connections import process_nfc_connect
        return process_nfc_connect(
            requesting_user=scanner_user,
            event_id=event_id,
            scanned_user_id=broadcaster_user_id,
            latitude=latitude,
            longitude=longitude,
            commit=commit
        )

    def _handle_irl(self, scanner_user, broadcaster_user_id, latitude, longitude, commit=True):
        """Tap outside any event — no geofence, no check-in gate."""
        from .event_connections import process_irl_tap
        return process_irl_tap(
            requesting_user=scanner_user,
            scanned_user_id=broadcaster_user_id,
            latitude=latitude,
            longitude=longitude,
            commit=commit
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
            except Exception:
                logger.warning("proximity.checkin_geofence_error post=%s", post.id, exc_info=True)
                return Response(
                    {"error": "Invalid location coordinates provided."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        is_registered = EventRequest.objects.filter(
            user=user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        earned_points = 0
        if is_registered:
            from .event_checkin import grant_checkin, _res15_cell
            _, earned_points = grant_checkin(user, post, _res15_cell(latitude, longitude))

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
            "post_id": post.id,
            "earned_points": earned_points,
            "user_id": user.user_id,
            "username": user.username,
            "avatar": avatar_url,
            "post_image": post_image,
            "post_name": post.about or "Event",
            "message": message,
        }, status=status.HTTP_200_OK)
