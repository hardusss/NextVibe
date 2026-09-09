from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
import requests

from ..constants import COLLECT_MAX_EDITIONS, NFT_SERVICE_URL
from ..models import PendingClaim, Post, UserCollection

User = get_user_model()


class MintNftView(APIView):
    """
    Owner-only publish path: mints the owner's edition of their post as a
    cNFT (backend pays, no price). Collectors use /posts/collect/*.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        post_id = request.data.get("postId")

        if not post_id:
            return Response({"error": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            post = Post.objects.select_related("owner").get(id=post_id)
        except Post.DoesNotExist:
            return Response({"error": "Invalid post."}, status=status.HTTP_400_BAD_REQUEST)

        if not post.is_approved:
            return Response({"error": "Post is not approved."}, status=status.HTTP_400_BAD_REQUEST)

        if post.owner != request.user:
            return Response(
                {"error": "Use the collect flow to claim this post.", "code": "USE_COLLECT"},
                status=status.HTTP_403_FORBIDDEN,
            )

        wallet_address = request.user.wallet_address
        if not wallet_address:
            return Response({"error": "User wallet address is not set."}, status=status.HTTP_400_BAD_REQUEST)

        total = post.total_supply if post.total_supply is not None else COLLECT_MAX_EDITIONS

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return Response({"error": "You already minted this post."}, status=status.HTTP_400_BAD_REQUEST)

        # Account for in-flight collect reservations so the owner's edition
        # never collides with a pending claim.
        now = timezone.now()
        pending = PendingClaim.objects.filter(post=post, expires_at__gte=now).count()
        edition = post.minted_count + pending + 1
        if edition > total:
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
            return Response({"error": "Mint service connection error."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not mint_res.get("success"):
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

        return Response({
            "success": True,
            "edition": edition,
            "assetId": mint_res.get("assetId"),
            "signature": mint_res.get("signature"),
        }, status=status.HTTP_201_CREATED)
