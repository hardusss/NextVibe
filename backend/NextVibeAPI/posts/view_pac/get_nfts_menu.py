
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
 
from ..models import PostsMedia, UserCollection
 
User = get_user_model()
 
OG_AVATAR_BASE_URL = "https://media.nextvibe.io/og-avatar-{edition}.jpg"
OG_MAX_SUPPLY = 25
 
 
class UserCollectionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"
 
    def get(self, request, id: int) -> Response:
        index = int(request.query_params.get("index", 0))
        limit = int(request.query_params.get("limit", 9))
 
        collections_qs = (
            UserCollection.objects
            .filter(user__user_id=id, post__is_hide=False, post__is_ai_generated=False)
            .select_related("post__owner")
            .prefetch_related(Prefetch("post__media", queryset=PostsMedia.objects.all()))
            .order_by("-minted_at")[index:index + limit]
        )
 
        total = UserCollection.objects.filter(user__user_id=id).count()
 
        if not collections_qs:
            return Response({
                "user": None,
                "data": [],
                "more_posts": False,
                "total_posts": 0,
                "liked_posts": [],
                "og_avatar": None,
            }, status=status.HTTP_200_OK)
 
        user_owner = collections_qs[0].post.owner
        user_request = request.user
 
        # Attach OG avatar info for the profile being viewed
        og_avatar = None
        og_mint = getattr(user_owner, "og_avatar", None)
        if og_mint is not None:
            og_avatar = {
                "isOG": True,
                "edition": og_mint.edition,
                "image_url": OG_AVATAR_BASE_URL.format(edition=og_mint.edition),
                "minted_at": og_mint.minted_at,
            }
 
        data = [
            {
                "user_id": col.post.owner.user_id,
                "post_id": col.post.id,
                "about": col.post.about,
                "count_likes": col.post.count_likes,
                "media": [
                    {
                        "id": m.id,
                        "media_url": (
                            m.file.url
                            if not str(m.file).startswith("https://res.cloudinary.com/")
                            else str(m.file)
                        ),
                        "media_preview": m.preview.url if m.preview else None,
                    }
                    for m in col.post.media.all()
                ],
                "create_at": col.post.create_at,
                "is_ai_generated": col.post.is_ai_generated,
                "location": col.post.location,
                "moderation_status": col.post.moderation_status,
                "is_comments_enabled": col.post.is_comments_enabled,
                "is_nft": col.post.is_nft,
                "edition": col.edition,
                "price": str(col.price),
                "asset_id": col.asset_id,
                "minted_at": col.minted_at,
            }
            for col in collections_qs
        ]
 
        return Response({
            "user": {
                "id": user_owner.user_id,
                "username": user_owner.username,
                "avatar": user_owner.avatar.url,
                "official": user_owner.official,
            },
            "data": data,
            "more_posts": (index + limit) < total,
            "total_posts": total,
            "liked_posts": user_request.liked_posts,
            "og_avatar": og_avatar,
        }, status=status.HTTP_200_OK)