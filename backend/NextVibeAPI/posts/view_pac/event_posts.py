from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from posts.models import Post, UserCollection, EventRequest
from posts.serializers_pac.recommendation_feed_serializer import PostFeedSerializer
from user.models import InviteUser


class EventPostsView(APIView):
    """
    GET /event-posts/<post_id>/?index=0&limit=20
    Returns all posts from all users that were created during
    the specified event (i.e. Post.on_event == event post).
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request, post_id: int) -> Response:
        user = request.user
        index = int(request.query_params.get("index", 0))
        limit = int(request.query_params.get("limit", 20))

        # Verify the event post exists and is actually an event
        try:
            event_post = Post.objects.get(id=post_id, is_luma_event=True)
        except Post.DoesNotExist:
            return Response(
                {"error": "Event not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Fetch all posts linked to this event via the on_event FK
        total_count = (
            Post.objects
            .filter(on_event=event_post, is_hide=False)
            .exclude(moderation_status="denied")
            .count()
        )

        posts_qs = (
            Post.objects
            .select_related("owner", "owner__og_avatar")
            .prefetch_related("media")
            .filter(on_event=event_post, is_hide=False)
            .exclude(moderation_status="denied")
            .order_by("-create_at")
        )[index:index + limit]

        posts_list = list(posts_qs)

        if not posts_list:
            return Response({
                "results": [],
                "count": 0,
                "total": total_count,
                "more_posts": False,
                "liked_posts": user.liked_posts,
            }, status=status.HTTP_200_OK)

        # Build context for PostFeedSerializer (same pattern as recommendation_feed)
        post_ids = [p.id for p in posts_list]
        owner_ids = [p.owner.user_id for p in posts_list]

        edition_ones = UserCollection.objects.filter(
            post_id__in=post_ids,
            edition=1,
        ).values("post_id", "price")
        nft_prices = {e["post_id"]: str(e["price"]) for e in edition_ones}

        claimed_post_ids = set(
            UserCollection.objects
            .filter(user=user, post_id__in=post_ids)
            .values_list("post_id", flat=True)
        )

        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(owner_id__in=owner_ids)
        }

        event_requests = EventRequest.objects.filter(
            post_id__in=post_ids,
            user=user,
        ).values_list("post_id", "status")
        event_request_statuses = dict(event_requests)

        serializer = PostFeedSerializer(
            posts_list,
            many=True,
            context={
                "request": request,
                "nft_prices": nft_prices,
                "claimed_post_ids": claimed_post_ids,
                "invite_counts": invite_counts,
                "event_request_statuses": event_request_statuses,
            },
        )

        return Response({
            "results": serializer.data,
            "count": len(posts_list),
            "total": total_count,
            "more_posts": (index + limit) < total_count,
            "liked_posts": user.liked_posts,
        }, status=status.HTTP_200_OK)
