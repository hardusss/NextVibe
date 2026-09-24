"""
Wallet-optional collectibles over HTTP (posts/src/collectibles.py).

    GET   /api/v1/users/<username>/collectibles?kind=&cursor=   the cNFT tab
    GET   /api/v1/collectibles/<id>                             one item
    POST  /api/v1/collectibles/<id>/claim                       owner: this one to my wallet
    POST  /api/v1/collectibles/claim-all                        owner: everything off-chain
    GET   /api/v1/me/collectibles/summary                       counts for banners
    GET/PATCH /api/v1/me/notification-settings                  Settings → Notifications
    GET   /meta/meet/<slug>/<user_id>.json                      one holder's Proof of Meet JSON

Anyone who can see a profile sees its items the same way, on-chain or not;
only the owner gets the claim state. Blocks hide the profile, and meets or
events with the other person, both ways.
"""
import logging
import zoneinfo

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from posts.models import Collectible, ReminderPreference
from posts.src import collectibles, das
from posts.src import collectible_metadata as meta
from posts.src.meets import is_slug
from user.models import User
from user.src.blocking import blocked_user_ids

logger = logging.getLogger("posts.collectibles")

OG_AVATAR_URL = "https://media.nextvibe.io/og-avatar-{edition}.jpg"


class ClaimThrottle(UserRateThrottle):
    scope = "collectible_claim"
    rate = "30/min"


def _not_found():
    return Response({"error": "Not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)


def _error(e: collectibles.CollectibleError):
    return Response({"error": e.message, "code": e.code}, status=e.http)


def _profile_for(username, viewer):
    """The profile behind a username if `viewer` may see it, else None."""
    profile = User.objects.filter(username=username).first()  # the default manager hides banned accounts
    if profile is None or collectibles.is_deleted(profile):
        return None
    if profile.user_id != viewer.user_id and profile.user_id in blocked_user_ids(viewer):
        return None
    return profile


def _int(value, default, low, high):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _og_avatar(profile):
    og = getattr(profile, "og_avatar", None)
    if og is None:
        return None
    return {"isOG": True, "edition": og.edition, "image_url": OG_AVATAR_URL.format(edition=og.edition),
            "minted_at": og.minted_at}


def _external(profile):
    """The owner's other wallet assets (DAS), minus what's in our table."""
    wallet = profile.wallet_address if collectibles.can_receive(profile) else None
    if not wallet:
        return []
    known = set(
        Collectible.objects.filter(user=profile).exclude(asset_id="").values_list("asset_id", flat=True)
    )
    cards = []
    for item in das.owned_assets(wallet):
        card = das.asset_card(item)
        if card and card["asset_id"] not in known:
            cards.append(card)
    return cards


class CollectibleListView(APIView):
    """GET /api/v1/users/<username>/collectibles?kind=poap|meet|post|badge&cursor=&limit="""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request, username):
        profile = _profile_for(username, request.user)
        if profile is None:
            return _not_found()
        owner = profile.user_id == request.user.user_id
        rows = collectibles.visible_rows(profile, request.user)
        kind_param = request.query_params.get("kind") or ""
        kind = collectibles.FILTER_KINDS.get(kind_param)
        cursor = request.query_params.get("cursor") or None
        limit = _int(request.query_params.get("limit"), collectibles.PAGE_SIZE, 1, collectibles.MAX_PAGE_SIZE)
        items, next_cursor = collectibles.page(rows.filter(kind=kind) if kind else rows, cursor, limit)
        photos = collectibles.live_meet_photos(items)
        data = {
            "user": {"user_id": profile.user_id, "username": profile.username},
            "owner": owner,
            "items": [collectibles.card(row, owner=owner, photos=photos) for row in items],
            "next_cursor": next_cursor,
        }
        if not cursor:
            data["counts"] = collectibles.counts(rows)
            data["og_avatar"] = _og_avatar(profile)
            if owner:
                data["summary"] = collectibles.summary(profile)
                data["external"] = _external(profile) if not kind_param else []
        return Response(data)


def _visible_row(pk, viewer):
    row = Collectible.objects.select_related("user", "counterpart", "post").filter(pk=pk).first()
    if row is None:
        return None, False
    if row.user_id == viewer.user_id:
        return row, True
    profile = row.user
    if profile.is_baned or collectibles.is_deleted(profile) or profile.user_id in blocked_user_ids(viewer):
        return None, False
    if not collectibles.visible_rows(profile, viewer).filter(pk=pk).exists():
        return None, False
    return row, False


class CollectibleDetailView(APIView):
    """GET /api/v1/collectibles/<id>: the card plus what the detail sheet shows."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request, pk):
        row, owner = _visible_row(pk, request.user)
        if row is None:
            return _not_found()
        data = collectibles.card(row, owner=owner)
        served = meta.served(row)
        data["description"] = served.get("description")
        data["attributes"] = served.get("attributes") or []
        data["owner_user"] = {"user_id": row.user.user_id, "username": row.user.username}
        return Response(data)


class CollectibleClaimView(APIView):
    """POST /api/v1/collectibles/<id>/claim"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ClaimThrottle]

    def post(self, request, pk):
        try:
            row = collectibles.claim(request.user, pk)
        except collectibles.CollectibleError as e:
            return _error(e)
        return Response({"collectible": collectibles.card(row, owner=True)}, status=status.HTTP_202_ACCEPTED)


class CollectibleClaimAllView(APIView):
    """POST /api/v1/collectibles/claim-all: 400 {code: "no_wallet"} opens the connect sheet."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ClaimThrottle]

    def post(self, request):
        try:
            queued = collectibles.claim_all(request.user)
        except collectibles.CollectibleError as e:
            return _error(e)
        return Response({"queued": queued, "summary": collectibles.summary(request.user)},
                        status=status.HTTP_202_ACCEPTED)


def _valid_zone(name) -> bool:
    if not name or not isinstance(name, str) or len(name) > 64:
        return False
    try:
        zoneinfo.ZoneInfo(name)
        return True
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return False


def _preference(user):
    return ReminderPreference.objects.filter(user=user).first()


class CollectibleSummaryView(APIView):
    """
    GET /api/v1/me/collectibles/summary?tz=Europe/Kyiv: counts for the banner
    and the badge. `tz` (the phone's time zone) keeps reminders inside
    10:00–21:00 local time.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post_menu"

    def get(self, request):
        tz = request.query_params.get("tz")
        pref = _preference(request.user)
        if _valid_zone(tz) and (pref is None or pref.timezone != tz):
            ReminderPreference.objects.update_or_create(user=request.user, defaults={"timezone": tz})
            pref = _preference(request.user)
        data = collectibles.summary(request.user)
        data["wallet_reminders"] = pref.wallet_reminders if pref else True
        return Response(data)


class NotificationSettingsView(APIView):
    """GET/PATCH /api/v1/me/notification-settings: {wallet_reminders: bool}"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile_edit"

    def get(self, request):
        pref = _preference(request.user)
        return Response({"wallet_reminders": pref.wallet_reminders if pref else True})

    def patch(self, request):
        value = request.data.get("wallet_reminders")
        if not isinstance(value, bool):
            return Response({"error": "wallet_reminders must be true or false.", "code": "INVALID"},
                            status=status.HTTP_400_BAD_REQUEST)
        ReminderPreference.objects.update_or_create(user=request.user, defaults={"wallet_reminders": value})
        logger.info("collectibles.reminders_%s user=%s", "on" if value else "off", request.user.user_id)
        return Response({"wallet_reminders": value})


class MeetHolderMetadataView(APIView):
    """
    GET https://api.nextvibe.io/meta/meet/<slug>/<user id>.json: what one
    person's Proof of Meet cNFT points to, the same before and after it's
    minted. Public and cacheable.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request, slug, user_id):
        row = None
        if is_slug(slug):
            row = (
                Collectible.objects.filter(user_id=user_id, kind=Collectible.Kind.MEET, source_id=slug)
                .select_related("user", "counterpart").first()
            )
        data = meta.served(row) if row is not None else None
        if not data:
            response = Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            response["Cache-Control"] = "no-store"
            return response
        response = Response(data)
        response["Cache-Control"] = "public, max-age=300"
        response["Access-Control-Allow-Origin"] = "*"
        return response
