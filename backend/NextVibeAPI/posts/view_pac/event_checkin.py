import logging
import random

import requests
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.shortcuts import get_object_or_404
from ..models import Post, EventRequest, EventCheckin, UserCollection, Reputation
from ..constants import NFT_SERVICE_URL

logger = logging.getLogger("posts.checkin")


def grant_checkin(user, post, h3_geo=None):
    """Idempotently record a verified check-in.

    Creates the EventCheckin (mint_status defaults to 'pending' — that row is
    the pending-mint record for the POAP) and the Reputation(source='checkin')
    award, so both exist even if the cNFT mint later fails or never runs.
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


class ClaimEventNftView(APIView):
    """POST /posts/claim-event-cnft/<post_id>/

    Mints the POAP cNFT for an already checked-in user. The check-in itself
    (EventCheckin + Reputation) is granted at verification time by
    grant_checkin — this view only performs the mint and transitions the
    check-in's mint_status, so a mint failure never un-checks anyone in.
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

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            if checkin.mint_status != EventCheckin.MintStatus.MINTED:
                checkin.mint_status = EventCheckin.MintStatus.MINTED
                checkin.save(update_fields=['mint_status'])
            return Response({
                "success": True,
                "already_owned": True,
                "message": "You already have an NFT for this event.",
                "earned_points": earned_points,
            }, status=status.HTTP_200_OK)

        if not request.user.wallet_address:
            return Response({"error": "No wallet address. Please link your wallet."}, status=status.HTTP_400_BAD_REQUEST)

        total_supply = int(post.total_supply if post.total_supply is not None else 50)
        if int(post.minted_count) >= total_supply:
            return Response({"error": "NFTs for this event are sold out."}, status=status.HTTP_400_BAD_REQUEST)

        # Provisional edition for the mint request; the DB writes below re-run
        # under a row lock, so concurrent claims can't double-write a row —
        # only the on-chain edition number can drift in a race.
        edition = post.minted_count + 1

        try:
            mint_res = requests.post(
                url=f"{NFT_SERVICE_URL}/mint",
                json={
                    "recipient": request.user.wallet_address,
                    "postId": post.id,
                    "edition": edition,
                },
                timeout=90,
            ).json()
        except Exception:
            checkin.mint_status = EventCheckin.MintStatus.FAILED
            checkin.save(update_fields=['mint_status'])
            logger.error(
                "checkin.mint_error user=%s post=%s edition=%s",
                request.user.pk, post.id, edition, exc_info=True,
            )
            return Response(
                {"error": "Minting service error. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not mint_res.get("success"):
            checkin.mint_status = EventCheckin.MintStatus.FAILED
            checkin.save(update_fields=['mint_status'])
            logger.error(
                "checkin.mint_rejected user=%s post=%s edition=%s service_error=%s",
                request.user.pk, post.id, edition, mint_res.get('error'),
            )
            return Response(
                {"error": f"Failed to mint NFT: {mint_res.get('error', 'Unknown error')}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked_post = Post.objects.select_for_update().get(id=post.id)
            UserCollection.objects.create(
                user=request.user,
                post=locked_post,
                asset_id=mint_res.get("assetId"),
                signature=mint_res.get("signature"),
                edition=edition,
                price=0,
            )
            locked_post.minted_count += 1
            locked_post.is_nft = True
            locked_post.save(update_fields=["minted_count", "is_nft"])
            checkin.mint_status = EventCheckin.MintStatus.MINTED
            checkin.save(update_fields=['mint_status'])

        logger.info(
            "checkin.minted user=%s post=%s edition=%s",
            request.user.pk, post.id, edition,
        )
        return Response({
            "success": True,
            "message": "Event NFT minted successfully!",
            "earned_points": earned_points,
        }, status=status.HTTP_200_OK)


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
