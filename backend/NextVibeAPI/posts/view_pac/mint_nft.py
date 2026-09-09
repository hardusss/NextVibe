from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import logging
import requests

from ..constants import COLLECT_MAX_EDITIONS, NFT_SERVICE_URL
from ..models import PendingClaim, Post, UserCollection

User = get_user_model()
logger = logging.getLogger("posts.collect")


class MintNftView(APIView):
    """
    Owner-only publish path: mints the owner's edition of their post as a
    cNFT (backend pays, no price). Collectors use /posts/collect/*.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        post_id = request.data.get("postId")
        logger.info("publish.request user=%s post=%s", request.user.pk, post_id)

        if not post_id:
            logger.info("publish.rejected user=%s reason=missing_post_id", request.user.pk)
            return Response({"error": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            post = Post.objects.select_related("owner").get(id=post_id)
        except Post.DoesNotExist:
            logger.info("publish.rejected user=%s post=%s reason=not_found", request.user.pk, post_id)
            return Response({"error": "Invalid post."}, status=status.HTTP_400_BAD_REQUEST)

        if not post.is_approved:
            logger.info("publish.rejected user=%s post=%s reason=not_approved", request.user.pk, post_id)
            return Response({"error": "Post is not approved."}, status=status.HTTP_400_BAD_REQUEST)

        if post.owner != request.user:
            logger.info("publish.rejected user=%s post=%s reason=not_owner", request.user.pk, post_id)
            return Response(
                {"error": "Use the collect flow to claim this post.", "code": "USE_COLLECT"},
                status=status.HTTP_403_FORBIDDEN,
            )

        wallet_address = request.user.wallet_address
        if not wallet_address:
            logger.info("publish.rejected user=%s post=%s reason=no_wallet", request.user.pk, post_id)
            return Response({"error": "User wallet address is not set."}, status=status.HTTP_400_BAD_REQUEST)

        total = post.total_supply if post.total_supply is not None else COLLECT_MAX_EDITIONS

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            logger.info("publish.rejected user=%s post=%s reason=already_minted", request.user.pk, post_id)
            return Response({"error": "You already minted this post."}, status=status.HTTP_400_BAD_REQUEST)

        # Account for in-flight collect reservations so the owner's edition
        # never collides with a pending claim.
        now = timezone.now()
        pending = PendingClaim.objects.filter(post=post, expires_at__gte=now).count()
        edition = post.minted_count + pending + 1
        if edition > total:
            logger.info("publish.rejected user=%s post=%s reason=sold_out", request.user.pk, post_id)
            return Response({"error": "Edition sold out."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mint_res = requests.post(
                url=f"{NFT_SERVICE_URL}/mint",
                json={
                    "recipient": wallet_address,
                    "postId": post_id,
                    "edition": edition,
                },
                timeout=60,
            ).json()
        except Exception:
            logger.error("publish.mint_service_unreachable user=%s post=%s edition=%s",
                         request.user.pk, post_id, edition, exc_info=True)
            return Response({"error": "Mint service connection error."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not mint_res.get("success"):
            logger.error("publish.mint_service_error user=%s post=%s edition=%s error=%s",
                         request.user.pk, post_id, edition, mint_res.get("error"))
            return Response({"error": "Mint failed on service side."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            locked = Post.objects.select_for_update().get(id=post.id)
            UserCollection.objects.create(
                user=request.user,
                post=locked,
                asset_id=mint_res.get("assetId"),
                signature=mint_res.get("signature"),
                edition=edition,
                price=Decimal("0"),
            )
            locked.minted_count += 1
            locked.is_nft = True
            locked.save(update_fields=["minted_count", "is_nft"])

        logger.info("publish.done user=%s post=%s edition=%s asset=%s",
                    request.user.pk, post_id, edition, mint_res.get("assetId"))
        return Response({
            "success": True,
            "edition": edition,
            "assetId": mint_res.get("assetId"),
            "signature": mint_res.get("signature"),
        }, status=status.HTTP_201_CREATED)
