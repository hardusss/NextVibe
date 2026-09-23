from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from posts.src import meet_card, meet_photos
from posts.src.meet_photo_store import public_key, public_url, read_public
from posts.src.meets import load_meet
from user.auth import CustomJWTAuthentication
from user.models import User
from user.src import og_image as og


class OptionalJWTAuthentication(CustomJWTAuthentication):
    """A valid token names the viewer; a missing, stale or bad one is just anonymous."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None


class MeetCardThrottle(SimpleRateThrottle):
    """Per client IP: X's crawler, link previews and the app each come from their own."""
    scope = "meet_card"
    rate = "120/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class IgnoreAccept(BaseContentNegotiation):
    """
    Image fetches send `Accept: image/*`, which no DRF renderer offers: without
    this they'd get a 406 before the view runs. Only errors (429) are rendered.
    """

    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def _not_found():
    response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    response["Cache-Control"] = "no-store"  # a block can be lifted
    return response


def meet_payload(meet, version):
    a, b = meet.people
    text = meet_card.card_text(meet)
    card_url = meet_card.card_url(meet.slug, "og", version)
    story_url = meet_card.card_url(meet.slug, "story", version)
    photo = meet_photos.live_photo(meet.slug) if meet.selfie else None
    if photo is not None:
        # The selfie is live: both cards are the photo (JPEG, public on the media host)
        photo_version = meet_photos.photo_version(photo)
        card_url = public_url(meet.slug, "og", photo_version)
        story_url = public_url(meet.slug, "story", photo_version)
        version = f"{version}-{photo_version}"
    return {
        "slug": meet.slug,
        "url": meet.url,
        "source": meet.source,
        "tier": meet.tier,
        "tier_label": meet.tier_label,
        "met_at": meet.met_at.isoformat(),
        "timezone": meet.tz.key if meet.tz else None,
        "place": meet.city,
        "when_line": text.when_line,
        "event": {"id": meet.event_id, "name": meet.event_name} if meet.event_name else None,
        "users": [
            {
                "user_id": p.user_id,
                "username": p.username,
                "avatar": og.public_file_url(p.avatar_name) if p.avatar_name else None,
                "seeker_verified": p.seeker,
                "official": p.official,
                "deleted": p.deleted,
                "points": p.points,
                "meet_number": p.number,
            }
            for p in meet.people
        ],
        "pair": {"count": meet.pair_count, "first_met_at": meet.pair_first_at.isoformat()},
        "history_line": " · ".join(part for part in (text.lead, text.detail) if part),
        "proof_line": f"Proof of Meet · {text.proof}",
        "asset_id": meet.asset_id,
        "title": f"@{a.username} met @{b.username} · NextVibe",
        "description": _description(meet),
        "card_url": card_url,
        "story_url": story_url,
        "version": version,
        # Proof of Meet v2: the two people's selfie, once both approved and it's minted
        "selfie": photo is not None,
        "photo": {
            "photographer_id": photo.photographer_id,
            "post_id": photo.post_id,
        } if photo is not None else None,
        "photo_available": meet_photos.is_available(),
    }


def _description(meet) -> str:
    """One line for og:description."""
    local = meet_card.local_time(meet)
    day = f"{local:%a}, {local:%b} {local.day}"
    where = f" in {meet.city}" if meet.city else ""
    how = f"at {meet.event_name}{where}" if meet.event_name else f"in person{where}"
    count = f" Their {meet_card.ordinal(meet.pair_count)} meeting." if meet.pair_count > 1 else ""
    return f"Met {how} on {day}.{count} Proof of Meet on NextVibe: tap phones, prove you met."


class MeetView(APIView):
    """
    GET /api/v1/meet/<slug> — public; a token is optional.

    One tap as data: both people, event, place, local time, tier, REP, meet
    numbers and the card URLs. nextvibe.io/u/meet/<slug> (landing _worker.js)
    and the app's meet sheet read it. Unknown slugs, meets with a banned
    account, blocked pairs and, for a signed-in viewer, people they blocked
    or were blocked by, all get the same 404.
    """
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication]
    # No throttle: the share page's requests all come from Cloudflare's egress IPs

    def get(self, request, slug) -> Response:
        viewer = request.user if request.user.is_authenticated else None
        meet = load_meet(slug, viewer=viewer)
        if meet is None:
            return _not_found()
        response = Response(meet_payload(meet, meet_card.card_version(meet)))
        # A signed-in answer depends on the viewer's blocks
        response["Cache-Control"] = "private, no-store" if viewer else "public, max-age=60"
        response["Vary"] = "Authorization"
        return response


class MeetCardView(APIView):
    """
    GET /api/v1/meet/<slug>/card.png?v=og|story — public PNG (JPEG once the
    pair's selfie is live: then it's the photo card, cached 5 minutes).

    og = 1200×630 (link previews), story = 1080×1350. Cached an hour, with
    an ETag of the card's version (a hash of everything drawn); the JSON
    hands out URLs with &rev=<version>, so new content gets a new URL.
    Unknown or unavailable meets get a neutral "not found" card with a 404.
    Rate limited per IP.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MeetCardThrottle]
    content_negotiation_class = IgnoreAccept

    def get(self, request, slug):
        variant = "story" if request.GET.get("v") == "story" else "og"
        meet = load_meet(slug)
        if meet is None:
            response = HttpResponse(meet_card.not_found_png(variant), status=404, content_type="image/png")
            response["Cache-Control"] = "no-store"
            return response

        if meet.selfie:
            photo = meet_photos.live_photo(slug)
            try:
                jpeg = read_public(public_key(slug, variant))
            except Exception:
                jpeg = None  # storage hiccup: the v1 card still works
            if photo is not None and jpeg is not None:
                etag = f'"{variant}-photo-{meet_photos.photo_version(photo)}"'
                # Short cache: a takedown must reach link previews quickly
                return _png_response(request, etag, lambda: jpeg, content_type="image/jpeg", max_age=300)

        etag = f'"{variant}-{meet_card.card_version(meet)}"'
        return _png_response(request, etag, lambda: meet_card.get_card_png(meet, variant)[0])


class FirstTapCardView(APIView):
    """
    GET /api/v1/meet/first-tap/<user_id>/card.png — public 1200×630 PNG.

    The first-tap email's teaser: "@username met @???", waiting for the
    first tap. Shows only what the public profile card already does
    (username, avatar, Seeker badge). Inactive or banned accounts get the
    "not found" card with a 404. Cached like the meet card.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MeetCardThrottle]
    content_negotiation_class = IgnoreAccept

    def get(self, request, user_id):
        user = User.all_objects.filter(user_id=user_id, is_active=True, is_baned=False).first()
        if user is None:
            response = HttpResponse(meet_card.not_found_png("og"), status=404, content_type="image/png")
            response["Cache-Control"] = "no-store"
            return response
        etag = f'"first-tap-{meet_card.teaser_version(user)}"'
        return _png_response(request, etag, lambda: meet_card.get_teaser_png(user)[0])


def _png_response(request, etag, png, content_type="image/png", max_age=3600):
    """200 with the image, or 304 when the client already has this version; cached an hour."""
    if etag in [tag.strip() for tag in request.headers.get("If-None-Match", "").split(",")]:
        response = HttpResponse(status=304)
    else:
        response = HttpResponse(png(), content_type=content_type)
    response["ETag"] = etag
    response["Cache-Control"] = f"public, max-age={max_age}"
    return response
