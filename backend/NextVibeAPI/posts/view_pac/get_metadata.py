from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Prefetch
from ..models import Post, PostsMedia
from user.models import User


class PostMetadataView(APIView):
    def get(self, request, post_id: int, edition: int) -> Response:
        is_og = request.query_params.get("isOg", "").lower() == "true"

        if is_og:
            user_id = request.query_params.get("userId")
            
            if not user_id:
                return Response(
                    {"error": "User ID is required for OG mints"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                user = User.objects.get(user_id=user_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "User not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )

            if not (1 <= edition <= 25):
                return Response(
                    {"error": "Edition must be between 1 and 25"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            og_image_url = f"https://media.nextvibe.io/og-avatar-{edition}.jpg"

            og_metadata = {
                "name": f"NextVibe OG #{edition}/25",
                "symbol": "NVOG",
                "description": f"Exclusive NextVibe OG PFP owned by @{user.username}. Only 25 exist.",
                "image": og_image_url,
                "seller_fee_basis_points": 0,
                "attributes": [
                    {"trait_type": "Status", "value": "OG"},
                    {"trait_type": "Edition", "value": f"{edition} of 25"},
                    {"trait_type": "Owner", "value": f"@{user.username}"}
                ],
                "properties": {
                    "files": [{"uri": og_image_url, "type": "image/jpg"}],
                    "category": "image",
                },
            }
            
            return Response(og_metadata, status=status.HTTP_200_OK)

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