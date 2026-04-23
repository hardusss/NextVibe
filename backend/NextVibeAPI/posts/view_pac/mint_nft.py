from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from ..models import Post, UserCollection
from decimal import Decimal
import requests
from user.src.send_push_message import send

User = get_user_model()

class MintNftView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        wallet_address = request.data.get("walletAddress")
        post_id = request.data.get("postId")
        raw_price = request.data.get("price")
        payment_signature = request.data.get("paymentSignature")

        # Basic validation
        if not wallet_address or not post_id:
            return Response({"error": "Missing required fields."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            price = Decimal(str(raw_price))
            post = Post.objects.select_related("owner").get(id=post_id)
        except (Post.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Invalid post or price."}, status=status.HTTP_400_BAD_REQUEST)

        if not post.is_approved:
            return Response({"error": "Post is not approved."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Supply and duplication checks
        if int(post.minted_count) >= int(post.total_supply if post.total_supply is not None else 50):
            return Response({"error": "Edition sold out."}, status=status.HTTP_400_BAD_REQUEST)

        if UserCollection.objects.filter(user=request.user, post=post).exists():
            return Response({"error": "You already minted this post."}, status=status.HTTP_400_BAD_REQUEST)

        edition = post.minted_count + 1
        is_owner_mint = (post.owner == request.user)

        # Require payment signature for collectors (editions 2+)
        if edition > 1 and not is_owner_mint:
            if not payment_signature:
                return Response(
                    {"error": "Payment signature is required for collectors."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Execute mint via external service
        try:
            mint_res = requests.post(
                url="http://localhost:3000/mint",
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

        # Save success state to database
        UserCollection.objects.create(
            user=request.user,
            post=post,
            asset_id=mint_res.get("assetId"),
            signature=mint_res.get("signature"),
            edition=edition,
            price=price,
        )
        
        post.minted_count += 1
        post.is_nft = True
        post.save(update_fields=["minted_count", "is_nft"])

        # Send push notification to the owner if claimed by someone else
        if not is_owner_mint:
            push_token = getattr(post.owner, "expo_push_token", None)
            if push_token:
                try:
                    buyer_name = request.user.username or "Someone"
                    send(
                        token=push_token,
                        title="Your Post was Claimed! 🎉",
                        body=f"{buyer_name} just claimed your post for {price} SOL."
                    )
                except Exception as e:
                    # Log the error but don't fail the request
                    print(f"Push notification failed: {e}")

        return Response({
            "success": True,
            "edition": edition,
            "assetId": mint_res.get("assetId"),
            "signature": mint_res.get("signature"),
        }, status=status.HTTP_201_CREATED)