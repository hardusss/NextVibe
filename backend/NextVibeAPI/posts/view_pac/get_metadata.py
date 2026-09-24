from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Prefetch
from ..models import Post, PostsMedia
from user.models import User
from ..src import collectible_metadata as meta


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
                "seller_fee_basis_points": 500,
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

        # A recorded POAP or collected post: its JSON, frozen when it was recorded
        row = meta.row_for_post_leaf(post_id, edition)
        if row is not None:
            data = meta.served(row)
            if data:
                return Response(data, status=status.HTTP_200_OK)

        post = get_object_or_404(
            Post.objects
                .select_related("owner")
                .prefetch_related(Prefetch("media", queryset=PostsMedia.objects.all())),
            id=post_id
        )
        return Response(meta.legacy_post_json(post, edition, request.build_absolute_uri), status=status.HTTP_200_OK)
