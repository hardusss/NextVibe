from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from ..models import Post, UserCollection
from decimal import Decimal
import requests

User = get_user_model()

class MintNftView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        wallet_address = request.data.get("walletAddress")
        post_id = request.data.get("postId")
        raw_price = request.data.get("price")

        # Validate required fields
        if not wallet_address:
            return Response({"error": "Wallet address is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not post_id:
            return Response({"error": "Post id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if raw_price is None:
            return Response({"error": "Price is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            price = Decimal(str(raw_price))
        except Exception:
            return Response({"error": "Invalid price."}, status=status.HTTP_400_BAD_REQUEST)

        # Fetch post
        try:
            post = Post.objects.select_related("owner").get(id=post_id)
        except Post.DoesNotExist:
            return Response({"error": "Post not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check sold out
        if int(post.minted_count) >= int(post.total_supply):
            return Response({"error": "Edition sold out."}, status=status.HTTP_400_BAD_REQUEST)

        # Check duplicate mint 
        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return Response({"error": "You already minted this post."}, status=status.HTTP_400_BAD_REQUEST)

        edition = post.minted_count + 1

        # Edition #1 — owner only
        if edition == 1 and post.owner != request.user:
            return Response(
                {"error": "Edition #1 can only be minted by the post owner."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Call Elysia mint service
        try:
            mint_response = requests.post(
                url="http://localhost:3000/mint",
                json={
                    "recipient": wallet_address,
                    "postId": post_id,
                    "edition": edition,
                },
                timeout=60  # finalized
            ).json()
        except Exception:
            return Response({"error": "Mint service unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not mint_response.get("success"):
            return Response({"error": "Mint failed."}, status=status.HTTP_400_BAD_REQUEST)

        # Save to DB 
        UserCollection.objects.create(
            user=request.user,
            post=post,
            asset_id=mint_response.get("assetId"),
            signature=mint_response.get("signature"),
            edition=edition,
            price=price,
        )

        post.minted_count += 1
        post.is_nft = True
        post.save(update_fields=["minted_count", "is_nft"])
        
        return Response({
            "success": True,
            "edition": edition,
            "assetId": mint_response.get("assetId"),
            "signature": mint_response.get("signature"),
        }, status=status.HTTP_201_CREATED)