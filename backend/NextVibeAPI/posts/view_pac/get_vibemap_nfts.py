from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..models import Post, PostsMedia


class GetVibemapNFTsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "get_vibemap_nfts"

    def get(self, request) -> Response:
        posts = (
            Post.objects.filter(is_nft=True, h3_geo__isnull=False)
            .exclude(h3_geo="")
            .exclude(is_hide=True)
            .exclude(moderation_status="denied")
            .select_related("owner")
            .prefetch_related("media")
            .order_by("-id")
        )

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

        data = [
            {
                "post_id": post.id,
                "image": post_image_url(post),
                "owner_avatar": owner_avatar_url(post),
            }
            for post in posts
        ]

        return Response({"status": "ok", "data": data}, status=status.HTTP_200_OK)
