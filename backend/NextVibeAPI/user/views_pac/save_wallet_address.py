import logging
import httpx
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from user.src.seeker_verification import needs_onchain_check, verify_seeker_in_background
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

logger = logging.getLogger(__name__)

def _queue_meet_mints(user_id):
    try:
        from posts.models import MeetPhoto
        from posts.tasks import mint_meet_photos_for_user
        owed = MeetPhoto.objects.filter(
            status__in=(MeetPhoto.Status.APPROVED, MeetPhoto.Status.MINTED),
        ).filter(
            Q(photographer_id=user_id, asset_id_photographer="") | Q(subject_id=user_id, asset_id_subject=""),
        )
        if owed.exists():
            mint_meet_photos_for_user.delay(user_id)
    except Exception:
        logger.warning("SaveWalletAddressView: queueing Proof of Meet mints failed for %s", user_id, exc_info=True)


class SaveWalletAddressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        wallet_address = request.data.get("walletAddress")

        logger.info(
            "SaveWalletAddressView: Request for user_id=%s with address=%s",
            request.user.user_id,
            wallet_address,
        )

        if not wallet_address or not isinstance(wallet_address, str):
            logger.warning("SaveWalletAddressView: Missing or invalid walletAddress in request body")
            return Response({"error": "walletAddress is required."}, status=status.HTTP_400_BAD_REQUEST)

        wallet_address = wallet_address.strip()

        if len(wallet_address) < 32 or len(wallet_address) > 44:
            logger.warning("SaveWalletAddressView: Invalid address length (%s chars)", len(wallet_address))
            return Response({"error": "Invalid Solana address."}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.wallet_address == wallet_address:
            logger.info("SaveWalletAddressView: User %s already has matching address %s", request.user.user_id, wallet_address)
            return Response({"success": True}, status=status.HTTP_200_OK)

        # A different wallet may already be linked (e.g. an auto-saved LazorKit
        # wallet, or one "disconnected" client-side only). Connecting a new
        # wallet replaces it, provided no other account owns the new address.
        if request.user.wallet_address:
            logger.info(
                "SaveWalletAddressView: User %s replacing linked wallet %s with %s",
                request.user.user_id,
                request.user.wallet_address,
                wallet_address,
            )

        # all_objects: the default manager hides banned users, but the DB unique
        # constraint doesn't — a banned holder must reject cleanly, not 500.
        User = request.user.__class__
        other_user = User.all_objects.filter(wallet_address=wallet_address).exclude(user_id=request.user.user_id).first()
        if other_user:
            logger.warning(
                "SaveWalletAddressView: Address %s is already linked to another user %s",
                wallet_address,
                other_user.user_id,
            )
            return Response(
                {"error": "This wallet address is already linked to another account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            request.user.wallet_address = wallet_address
            request.user.save(update_fields=["wallet_address"])
            logger.info("SaveWalletAddressView: Successfully saved wallet %s for user %s", wallet_address, request.user.user_id)
            if needs_onchain_check(request.user):
                user_id = request.user.user_id
                transaction.on_commit(
                    lambda: verify_seeker_in_background(user_id, wallet_address)
                )
            # Proof of Meet cNFTs minted for the other person while this one
            # had no wallet land now
            transaction.on_commit(lambda: _queue_meet_mints(request.user.user_id))
        except Exception as e:
            logger.error("SaveWalletAddressView: Failed to save wallet %s: %s", wallet_address, e, exc_info=True)
            return Response(
                {"error": "Failed to link wallet address. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Directly call indexer register endpoint to ensure immediate indexing
        indexer_secret = getattr(settings, "INDEXER_INTERNAL_SECRET", None)
        indexer_url = getattr(settings, "INDEXER_URL", None)

        if indexer_secret and indexer_url:
            try:
                httpx.post(
                    f"{indexer_url.rstrip('/')}/index/register",
                    json={
                        "user_id": request.user.user_id,
                        "wallet_address": wallet_address,
                    },
                    headers={"x-internal-secret": indexer_secret},
                    timeout=5.0,
                )
            except Exception as error:
                logger.warning(
                    "Direct indexer register failed in SaveWalletAddressView for %s: %s",
                    wallet_address,
                    error,
                )

        return Response({"success": True}, status=status.HTTP_200_OK)