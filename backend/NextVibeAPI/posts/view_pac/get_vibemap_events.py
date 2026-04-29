from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..models import Post, PostsMedia, EventRequest
import h3


class GetVibemapEventsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "get_vibemap_events"

    def get(self, request) -> Response:
        now = timezone.now()

        posts = (
            Post.objects.filter(is_luma_event=True, h3_geo__isnull=False)
            .exclude(h3_geo="")
            .exclude(is_hide=True)
            .exclude(moderation_status="denied")
            .select_related("owner")
            .prefetch_related("media", "event_requests")
            .order_by("-id")
        )

        def coords_from_h3(post: Post) -> tuple[float, float] | None:
            try:
                if not post.h3_geo:
                    return None
                lat, lng = h3.cell_to_latlng(post.h3_geo)
                return float(lat), float(lng)
            except Exception:
                return None

        def owner_avatar_url(post: Post) -> str | None:
            owner = post.owner
            if not getattr(owner, "avatar", None):
                return None
            raw = str(owner.avatar)
            if raw.startswith("https://res.cloudinary.com/") or raw.startswith("https://"):
                return raw
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{owner.avatar}"

        def post_image_url(post: Post) -> str | None:
            media_items = list(getattr(post, "media").all())
            if not media_items:
                return None
            m: PostsMedia = media_items[0]
            raw = str(m.file)
            if raw.startswith("https://res.cloudinary.com/") or raw.startswith("https://"):
                return raw
            return m.file.url if m.file else None

        data = []
        user = request.user

        for post in posts:
            coords = coords_from_h3(post)
            if not coords:
                continue

            # Determine if the event is still active
            end_time = post.luma_event_end_time or post.luma_event_start_time
            is_active = end_time > now if end_time else True

            # Count approved attendees
            attendee_count = post.event_requests.filter(
                status=EventRequest.Status.APPROVED
            ).count()

            # Check current user's request status
            user_request = post.event_requests.filter(user=user).first()
            request_status = user_request.status if user_request else None

            data.append(
                {
                    "post_id": post.id,
                    "lat": coords[0],
                    "lng": coords[1],
                    "image": post_image_url(post),
                    "owner_avatar": owner_avatar_url(post),
                    "owner_username": post.owner.username,
                    "owner_id": post.owner.user_id,
                    "about": post.about or "",
                    "luma_event_url": post.luma_event_url,
                    "luma_event_start_time": post.luma_event_start_time,
                    "luma_event_end_time": post.luma_event_end_time,
                    "is_active": is_active,
                    "attendee_count": attendee_count,
                    "request_status": request_status,  # null | 'pending' | 'approved' | 'rejected'
                }
            )

        return Response({"status": "ok", "data": data}, status=status.HTTP_200_OK)
