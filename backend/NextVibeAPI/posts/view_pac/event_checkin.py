import logging
import random
import time

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.shortcuts import get_object_or_404
from ..models import Collectible, Post, EventRequest, EventCheckin, Reputation
from ..src import collectibles

logger = logging.getLogger("posts.checkin")


def grant_checkin(user, post, h3_geo=None):
    """Idempotently record a verified check-in.

    Creates the EventCheckin, the Reputation(source='checkin') award and the
    POAP collectible, in one transaction and with or without a wallet: the
    POAP is queued (and minted right away) for someone with a wallet, saved
    off-chain for someone without (posts/src/collectibles.py).
    Returns (checkin, earned_points).
    """
    with transaction.atomic():
        checkin, created = EventCheckin.objects.get_or_create(
            user=user,
            post=post,
            defaults={'is_registered': True},
        )
        if not checkin.is_registered:
            checkin.is_registered = True
            checkin.save(update_fields=['is_registered'])

        existing_rep = Reputation.objects.filter(
            user=user, event=post, is_checkin=True
        ).first()
        if existing_rep:
            earned_points = existing_rep.points
        else:
            earned_points = random.randint(5, 20)
            Reputation.objects.create(
                user=user,
                given_by=post.owner,
                points=earned_points,
                is_checkin=True,
                event=post,
                h3_geo=h3_geo,
                source='checkin',
            )

        collectibles.record_poap(user, post, when=checkin.checked_in_at)

    logger.info(
        "checkin.granted user=%s post=%s points=%s new_checkin=%s new_rep=%s",
        user.pk, post.id, earned_points, created, existing_rep is None,
    )
    return checkin, earned_points


def _verify_event_geofence(post, lat, lng):
    """Returns an error Response when the coordinates fall outside the event
    zone (or are invalid), else None. Callers pass floats or None."""
    if not post.h3_geo:
        return None
    if lat is None or lng is None:
        return Response(
            {"error": "Location coordinates are required to check in."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        import h3
        event_res = h3.get_resolution(post.h3_geo)
        user_cell = h3.latlng_to_cell(float(lat), float(lng), event_res)
        if h3.grid_distance(user_cell, post.h3_geo) > 2:
            return Response(
                {"error": "You must be physically present at the event zone to check in."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except Exception:
        logger.warning("checkin.geofence_error post=%s", post.id, exc_info=True)
        return Response(
            {"error": "Invalid location coordinates provided."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _res15_cell(lat, lng):
    """Best-effort res-15 H3 cell for reputation rows; None on any failure."""
    if lat is None or lng is None:
        return None
    try:
        import h3
        return h3.latlng_to_cell(float(lat), float(lng), res=15)
    except Exception:
        logger.warning("checkin.h3_res15_error", exc_info=True)
        return None


class EventCheckinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        coords = request.data.get("coords") or {}
        lat = coords.get("lat")
        lng = coords.get("lng")
        geo_error = _verify_event_geofence(post, lat, lng)
        if geo_error:
            return geo_error

        is_registered = EventRequest.objects.filter(
            user=request.user,
            post=post,
            status=EventRequest.Status.APPROVED
        ).exists()

        earned_points = 0
        if is_registered:
            _, earned_points = grant_checkin(request.user, post, _res15_cell(lat, lng))
        else:
            logger.info("checkin.rejected_unregistered user=%s post=%s", request.user.pk, post.id)

        post_image = None
        media = post.media.first()
        if media and getattr(media, 'file', None):
            post_image = media.file_url

        avatar_url = None
        if request.user.avatar and getattr(request.user.avatar, 'name', None):
            avatar_url = request.user.avatar.url

        message = "You're verified! Welcome to the event." if is_registered else "You are not registered for this event."

        return Response({
            "verified": is_registered,
            "user_id": request.user.user_id,
            "username": request.user.username,
            "avatar": avatar_url,
            "post_image": post_image,
            "post_name": post.about or "Event",
            "message": message,
            "earned_points": earned_points,
        }, status=status.HTTP_200_OK)


SAVED_TEXT = "Saved to your profile · Claim anytime"
SAVED_TEXT_OLD_APPS = "Saved to your profile. Connect a wallet anytime to put it on Solana."
QUEUED_TEXT = "Putting it on Solana. It lands in a minute."
MINT_FAILED_TEXT = "You're checked in. Putting the POAP on Solana didn't work this time. Tap to retry."
# How long the check-in screen may wait for a worker that's minting this POAP
MINT_WAIT_SECONDS = 45


class ClaimEventNftView(APIView):
    """POST /posts/claim-event-cnft/<post_id>/

    The check-in's POAP. The check-in recorded it already (grant_checkin):
    queued for someone with a wallet, off-chain for someone without. This
    view answers where it stands and, with a wallet, mints it now (or waits
    for the worker already minting it), so the check-in screen can say it
    landed. A failure never un-checks anyone in; the row retries by itself.

    Always 200 once checked in: `status` is the collectible's, `success`
    means it's on Solana. Apps that send `wallet_optional` treat an off-chain
    POAP as done ("Saved to your profile"); older ones read success=false and
    show the text in their retry pill.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        coords = request.data.get("coords") or {}
        geo_error = _verify_event_geofence(post, coords.get("lat"), coords.get("lng"))
        if geo_error:
            return geo_error

        checkin = EventCheckin.objects.filter(
            user=request.user, post=post, is_registered=True
        ).first()
        if not checkin:
            return Response(
                {"error": "Please check in to the event first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_rep = Reputation.objects.filter(
            user=request.user, event=post, is_checkin=True
        ).first()
        earned_points = existing_rep.points if existing_rep else 0

        row = Collectible.objects.filter(user=request.user, kind=Collectible.Kind.POAP, source_id=str(post.id)).first()
        if row is None:
            # Checked in before POAPs were recorded at check-in
            with transaction.atomic():
                row = collectibles.record_poap(request.user, post, when=checkin.checked_in_at)
        if row is None:
            return Response({"error": "NFTs for this event are sold out."}, status=status.HTTP_400_BAD_REQUEST)

        wallet_optional = bool(request.data.get("wallet_optional"))
        if row.status == Collectible.Status.MINTED:
            return self._answer(row, earned_points, already_owned=True,
                                message="You already have an NFT for this event.")

        if not collectibles.can_receive(request.user):
            logger.info("checkin.poap_saved_offchain user=%s post=%s", request.user.pk, post.id)
            return self._answer(row, earned_points, message=SAVED_TEXT,
                                error=None if wallet_optional else SAVED_TEXT_OLD_APPS)

        if row.status in collectibles.CLAIMABLE:
            try:
                row = collectibles.claim(request.user, row.pk)
            except collectibles.CollectibleError:
                row.refresh_from_db()
        row = self._mint_now(row)
        if row.status == Collectible.Status.MINTED:
            logger.info("checkin.minted user=%s post=%s edition=%s", request.user.pk, post.id, row.edition)
            return self._answer(row, earned_points, message="Event NFT minted successfully!")
        if row.status in collectibles.PENDING and not row.last_error:
            return self._answer(row, earned_points, message=QUEUED_TEXT, error=QUEUED_TEXT)
        logger.warning("checkin.mint_not_yet user=%s post=%s status=%s error=%s",
                       request.user.pk, post.id, row.status, row.last_error)
        return self._answer(row, earned_points, message=MINT_FAILED_TEXT, error=MINT_FAILED_TEXT)

    def _mint_now(self, row):
        """Mint it in this request (the screen waits); if a worker has it, wait for that one."""
        from ..src import collectible_mint

        if row.status == Collectible.Status.QUEUED:
            if collectible_mint.budget_left() < 1 or not collectible_mint.tree_has_room(1):
                return row  # it waits in the queue
            minted = collectible_mint.mint_row(row.pk, force=True)
            if minted is not None:
                return minted
        deadline = time.monotonic() + MINT_WAIT_SECONDS
        while time.monotonic() < deadline:
            row.refresh_from_db()
            if row.status != Collectible.Status.MINTING:
                break
            time.sleep(0.5)
        return row

    def _answer(self, row, earned_points, message, error=None, already_owned=False):
        onchain = row.status == Collectible.Status.MINTED
        payload = {
            "success": onchain or (error is None and row.status == Collectible.Status.OFFCHAIN),
            "status": row.status,
            "saved": True,
            "already_owned": already_owned,
            "message": message,
            "earned_points": earned_points,
            "collectible": collectibles.card(row, owner=True),
        }
        if error and not onchain:
            payload["success"] = False
            payload["error"] = error
        return Response(payload, status=status.HTTP_200_OK)


class EventCheckinListView(APIView):
    """
    GET /posts/event-checkin/list/<post_id>/
    Returns all users who checked in via NFC for this event.
    Only the event owner can access this endpoint.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_luma_event=True)

        if post.owner != request.user:
            return Response(
                {"error": "Not authorized"},
                status=status.HTTP_403_FORBIDDEN
            )

        checkins = EventCheckin.objects.filter(post=post).select_related('user')

        data = [
            {
                "user_id": c.user.user_id,
                "username": c.user.username,
                "avatar": c.user.avatar.url if c.user.avatar and getattr(c.user.avatar, 'name', None) else None,
                "is_registered": c.is_registered,
                "checked_in_at": c.checked_in_at,
            }
            for c in checkins
        ]

        registered_count = sum(1 for d in data if d['is_registered'])

        return Response({
            "total": len(data),
            "registered": registered_count,
            "unregistered": len(data) - registered_count,
            "checkins": data,
        }, status=status.HTTP_200_OK)
