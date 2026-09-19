from django.contrib.auth import get_user_model
from django.views.decorators.http import require_safe
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from user.src import og_image as og
from user.src.seeker_card import (
    card_image_url,
    card_subline,
    card_version,
    get_card_png,
    verified_user,
)


@require_safe
def seeker_card_image(request, username):
    """
    GET /api/v1/users/<username>/seeker-card.png — public, no auth.

    404 for anyone who isn't Seeker Verified. The share page asks for
    ?v=<current version>, which is safe to cache for a day because a new
    avatar or username gives a new version. Requests without it (the app's
    "Share image") always get the latest card.
    """
    user = verified_user(username)
    if user is None:
        return og.not_found_response()
    png, version = get_card_png(user)
    return og.card_response(request, png, version)


class SeekerShareView(APIView):
    """
    GET /api/v1/users/<username>/seeker-share/ — public, no auth.

    What nextvibe.io/u/verified/<username> needs to render the share page and
    its card tags (the landing site's _worker.js calls this). Unknown and
    unverified usernames get the same 404, so nothing can be probed.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # a stale token on a browser request must not 401
    # No throttle: every visitor arrives through the same few Cloudflare egress IPs

    def get(self, request, username) -> Response:
        user = verified_user(username)
        if user is None:
            response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            response["Cache-Control"] = "no-store"
            return response

        response = Response({
            "username": user.username,
            "source": user.seeker_verified_source or "onchain",
            "subline": card_subline(user.seeker_verified_source),
            "card_url": card_image_url(user.username, card_version(user)),
        })
        response["Cache-Control"] = "public, max-age=60"
        return response


class UserLookupView(APIView):
    """
    GET /api/v1/users/lookup/?username=<username> → { user_id }

    Lets the app open nextvibe://profile/<username> and
    nextvibe.io/u/verified/<username> links, which carry a username rather
    than an id. A blocked pair still resolves: the profile screen shows its
    own blocked state.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile"

    def get(self, request) -> Response:
        username = (request.query_params.get("username") or "").strip()
        user = (
            get_user_model().objects.filter(username=username, is_active=True).only("user_id").first()
            if username else None
        )
        if user is None:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"user_id": user.user_id})
