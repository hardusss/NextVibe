from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from ..models import Post
from ..src.meet_photos import user_brief

MAX_LIMIT = 500


class AllEventsView(APIView):
    """
    GET /posts/all-events/?index=0&limit=100
    Every event, newest first, for admins (User.is_admin): the organizer
    dashboard lists them so an admin can open any event, not only their own.
    Items have the posts-menu shape plus the event's owner. Others get 403.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request) -> Response:
        if not request.user.is_admin:
            return Response({"error": "Only admins can list all events"}, status=status.HTTP_403_FORBIDDEN)

        try:
            index = max(int(request.query_params.get("index", 0)), 0)
            limit = min(max(int(request.query_params.get("limit", 100)), 1), MAX_LIMIT)
        except ValueError:
            return Response({"error": "index and limit must be numbers"}, status=status.HTTP_400_BAD_REQUEST)

        # Same events an owner's own list has: deleted and denied ones left out
        events_qs = (
            Post.objects
            .filter(is_luma_event=True, is_hide=False)
            .exclude(moderation_status="denied")
        )
        total_posts = events_qs.count()

        events = (
            events_qs
            .select_related("owner")
            .prefetch_related("media")
            .order_by("-id")[index:index + limit]
        )

        data = [
            {
                "user_id": post.owner.user_id,
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": [{
                    "id": m.id,
                    "media_url": m.file.url if not str(m.file).startswith("https://res.cloudinary.com/") else str(m.file), # Check where media saved
                    "media_preview": m.preview.url if m.preview else None
                    } for m in post.media.all()],
                "create_at": post.create_at,
                "location": post.location,
                "moderation_status": post.moderation_status,
                "is_luma_event": post.is_luma_event,
                "luma_event_url": post.luma_event_url,
                "luma_event_verified": post.luma_event_verified,
                "luma_event_start_time": post.luma_event_start_time,
                "luma_event_end_time": post.luma_event_end_time,
                "total_supply": post.total_supply,
                "owner": user_brief(post.owner),
            }
            for post in events
        ]

        return Response({
            "data": data,
            "more_posts": (index + limit) < total_posts,
            "total_posts": total_posts,
        }, status=status.HTTP_200_OK)
