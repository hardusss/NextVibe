from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status
from django.contrib.auth import get_user_model
from user.models import OgAvatarMint
import requests
from user.src.send_push_message import send
from user.src.grant_og_status import grant_og_status


User = get_user_model()

class OgNftMintView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mint"
    
    def post(self, request) -> Response:
        user = request.user
        wallet_address = user.wallet_address

        # Basic validation
        if not wallet_address:
            return Response({"error": "Wallet not connected"}, status=status.HTTP_400_BAD_REQUEST)
        
        og_status =  grant_og_status(user)
        if not og_status.get("success"):
            return Response({
                "error": og_status.get("message", "Unknown error")
            })

        edition = int(og_status.get("edition", 0))

        # Execute mint via external service
        try:
            mint_res = requests.post(
                url="http://localhost:3000/mint/og",
                json={
                    "recipient": wallet_address,
                    "userId": user.user_id,
                    "edition": edition,
                },
                timeout=60,
            ).json()
        except Exception:
            return Response({"error": "Mint service connection error."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if not mint_res.get("success"):
            return Response({"error": "Mint failed on service side."}, status=status.HTTP_400_BAD_REQUEST)

        # Save success state to database
        OgAvatarMint.objects.create(
            user=request.user,
            asset_id=mint_res.get("assetId"),
            signature=mint_res.get("signature"),
            edition=edition,
        )
        

        # Send push notification to user
        if user:
            push_token = getattr(user, "expo_push_token", None)
            if push_token:
                try:
                    send(
                        token=push_token,
                        title="You claim your OG cNFT 🎉",
                        body=f"You are #{edition} OG"
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