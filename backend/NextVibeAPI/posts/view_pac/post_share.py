from django.views.decorators.http import require_safe
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.src.post_card import get_post_card_png, media_items, post_card_url, post_card_version, shared_post
from user.src import og_image as og


@require_safe
def post_card_image(request, post_id):
    """GET /api/v1/posts/<id>/card.png — public link-preview image for nextvibe.io/u/post/<id>."""
    found = shared_post(post_id)
    if found is None:
        return og.not_found_response()
    post, state = found
    png, version = get_post_card_png(post, state)
    return og.card_response(request, png, version)


class PostShareView(APIView):
    """
    GET /api/v1/posts/<id>/share/ — public, no auth.

    What nextvibe.io/u/post/<id> shows. Approved posts come with their caption
    and media; posts still in moderation only name their author. Hidden,
    deleted and denied posts, and posts by banned or deleted accounts, are 404.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # a stale token on a browser request must not 401
    # No throttle: every visitor arrives through the same few Cloudflare egress IPs

    def get(self, request, post_id) -> Response:
        found = shared_post(post_id)
        if found is None:
            response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            response["Cache-Control"] = "no-store"
            return response

        post, state = found
        owner = post.owner
        data = {
            "post_id": post.id,
            "state": state,
            "owner": {
                "user_id": owner.user_id,
                "username": owner.username,
                "avatar": og.public_file_url(owner.avatar.name if owner.avatar else ""),
                "official": bool(owner.official),
                "seeker_verified": bool(owner.seeker_verified),
            },
            "card_url": post_card_url(post, post_card_version(post, state)),
        }
        if state == "public":
            data.update({
                "about": post.about or "",
                "created_at": post.create_at.isoformat(),
                "likes_count": post.count_likes or 0,
                "media": [{key: item[key] for key in ("url", "preview", "kind")} for item in media_items(post)],
                "is_event": bool(post.is_luma_event),
                "event_url": post.luma_event_url if post.is_luma_event else None,
                "event_start": post.luma_event_start_time.isoformat() if post.is_luma_event and post.luma_event_start_time else None,
            })
        response = Response(data)
        response["Cache-Control"] = "public, max-age=60"
        return response
