from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..models import Post, PostsMedia, EventRequest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db.models import Prefetch
from rest_framework.throttling import ScopedRateThrottle
from user.src.blocking import blocked_user_ids, is_blocked_between
from ..src.meet_photos import on_profile_q, post_meet_fields, user_brief

User: AbstractUser = get_user_model()



class PostMenuView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request, id: int) -> Response:
        index = int(request.query_params.get("index", 0))
        limit = int(request.query_params.get("limit", 9))
        is_event = request.query_params.get("is_event", "false").lower() == "true"

        if is_blocked_between(request.user.user_id, id):
            return Response({
                "user": None,
                "data": [],
                "more_posts": False,
                "total_posts": 0,
                "liked_posts": []
            }, status=status.HTTP_200_OK)

        # Your own posts, plus Proof of Meet posts you're the co-author of
        hidden = blocked_user_ids(request.user)
        posts_qs = (
            Post.objects
            .filter(on_profile_q(id), is_hide=False, is_ai_generated=False)
            .exclude(owner__user_id__in=hidden)
            .exclude(co_author__user_id__in=hidden)
            .exclude(co_author__is_baned=True)
        )
        
        if is_event:
            posts_qs = posts_qs.filter(is_luma_event=True)
            total_posts = Post.objects.filter(owner__user_id=id, is_luma_event=True).exclude(moderation_status="denied").count()
        else:
            total_posts = (
                Post.objects.filter(owner__user_id=id).exclude(moderation_status="denied").count()
                + posts_qs.filter(co_author__user_id=id).exclude(moderation_status="denied").count()
            )

        posts_qs = (
            posts_qs
            .exclude(moderation_status="denied")
            .select_related("owner", "co_author")
            .prefetch_related(
                Prefetch("media", queryset=PostsMedia.objects.all()),
                Prefetch("event_requests", queryset=EventRequest.objects.filter(user=request.user), to_attr="user_request")
            )
            .order_by("-id")[index:index + limit]
        )

        if not posts_qs:
            return Response({
                "user": None,
                "data": [],
                "more_posts": False,
                "total_posts": 0,
                "liked_posts": []
            }, status=status.HTTP_200_OK)

        # The profile's owner (a co-authored post's owner is the other person)
        user_owner_posts = User.objects.filter(user_id=id).first() or posts_qs[0].owner
        user_request = request.user
        data = [
            {
                "user_id": post.owner.user_id,
                "post_id": post.id,
                "about": post.about,
                "count_likes": post.count_likes,
                "media": [{
                    "id": m.id, 
                    "media_url": m.file.url if not str(m.file).startswith("https://res.cloudinary.com/") else str(m.file), # Check where media saved
                    "media_preview": m.preview.url if m.preview else None # Get media if exists
                    } for m in post.media.all()],
                "create_at": post.create_at,
                "is_ai_generated": post.is_ai_generated,
                "location": post.location,
                "moderation_status": post.moderation_status,
                "is_comments_enabled": post.is_comments_enabled,
                "is_nft": post.is_nft,
                "is_luma_event": post.is_luma_event,
                "luma_event_url": post.luma_event_url,
                "luma_event_verified": post.luma_event_verified,
                "luma_event_start_time": post.luma_event_start_time,
                "luma_event_end_time": post.luma_event_end_time,
                "event_request_status": post.user_request[0].status if hasattr(post, 'user_request') and post.user_request else None,
                "total_supply": post.total_supply,
                **post_meet_fields(post),
                "owner": user_brief(post.owner) if post.meet_slug else None,
            }
            for post in posts_qs
        ]

        return Response({
            "user": {
                "id": user_owner_posts.user_id,
                "username": user_owner_posts.username,
                "avatar": user_owner_posts.avatar.url,
                "official": user_owner_posts.official,
                "seeker_verified": user_owner_posts.seeker_verified
            },
            "data": data,
            "more_posts": (index + limit) < total_posts,
            "total_posts": total_posts,
            "liked_posts": user_request.liked_posts
        }, status=status.HTTP_200_OK)
