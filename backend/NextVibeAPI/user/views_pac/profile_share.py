from django.views.decorators.http import require_safe
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from user.src import og_image as og
from user.src.profile_card import (
    avatar_name,
    get_profile_card_png,
    og_edition,
    profile_card_url,
    profile_card_version,
    public_profile,
)


@require_safe
def profile_card_image(request, user_id):
    """GET /api/v1/users/<id>/card.png — public link-preview image for nextvibe.io/u/<id>."""
    user = public_profile(user_id)
    if user is None:
        return og.not_found_response()
    png, version = get_profile_card_png(user)
    return og.card_response(request, png, version)


class ProfileShareView(APIView):
    """
    GET /api/v1/users/<id>/share/ — public, no auth.

    What nextvibe.io/u/<id> shows: only public profile fields, plus the
    link-preview image. The landing site's _worker.js calls it for the card
    tags, and the page reads the same data.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # a stale token on a browser request must not 401
    # No throttle: every visitor arrives through the same few Cloudflare egress IPs

    def get(self, request, user_id) -> Response:
        user = public_profile(user_id)
        if user is None:
            response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            response["Cache-Control"] = "no-store"
            return response

        response = Response({
            "user_id": user.user_id,
            "username": user.username,
            "about": user.about or "",
            "avatar": og.public_file_url(avatar_name(user)),
            "official": bool(user.official),
            "seeker_verified": bool(user.seeker_verified),
            "og_edition": og_edition(user),
            "post_count": user.post_count,
            "followers_count": user.readers_count,
            "following_count": user.follows_count,
            "card_url": profile_card_url(user, profile_card_version(user)),
        })
        response["Cache-Control"] = "public, max-age=60"
        return response
