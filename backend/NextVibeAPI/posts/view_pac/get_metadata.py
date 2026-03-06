from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Prefetch
from ..models import Post, PostsMedia


class PostMetadataView(APIView):
    def get(self, request, post_id: int, edition: int) -> Response:
        post = get_object_or_404(
            Post.objects
                .select_related("owner")
                .prefetch_related(Prefetch("media", queryset=PostsMedia.objects.all())),
            id=post_id
        )

        media_data = [
            {
                "id": m.id,
                "media_url": m.file.url if not str(m.file).startswith("https://res.cloudinary.com/") else str(m.file),
                "media_preview": m.preview.url if m.preview else None
            }
            for m in post.media.all()
        ]

        main_image_url = ""
        if media_data:
            main_image_url = media_data[0]["media_url"]
            if not main_image_url.startswith("http"):
                main_image_url = request.build_absolute_uri(main_image_url)

        metadata = {
            "name": f"Post by @{post.owner.username} #{edition}",
            "symbol": "NVIBE",
            "description": post.about or f"Original post by @{post.owner.username} on NextVibe",
            "image": main_image_url,
            "seller_fee_basis_points": 500,
            "attributes": [
                {"trait_type": "Edition", "value": f"{edition} of {post.total_supply}"},
                {"trait_type": "Original Creator", "value": f"@{post.owner.username}"},
            ],
            "properties": {
                "files": [{"uri": main_image_url, "type": "image/jpeg"}],
                "category": "image",
            },
        }

        return Response(metadata, status=status.HTTP_200_OK)