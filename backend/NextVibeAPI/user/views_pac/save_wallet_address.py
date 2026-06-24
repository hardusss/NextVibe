import logging
import httpx
from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

logger = logging.getLogger(__name__)

class SaveWalletAddressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        wallet_address = request.data.get("walletAddress")

        if not wallet_address:
            return Response({"error": "walletAddress is required."}, status=status.HTTP_400_BAD_REQUEST)

        if len(wallet_address) < 32 or len(wallet_address) > 44:
            return Response({"error": "Invalid Solana address."}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.wallet_address == wallet_address:
            return Response({"success": True}, status=status.HTTP_200_OK)
        
        if request.user.wallet_address:
            existing = request.user.wallet_address
            short = f"{existing[:6]}...{existing[-6:]}"
            return Response(
                {"error": f"Wallet already linked to your account: {short}. Use it to continue."},
                status=status.HTTP_400_BAD_REQUEST
            )

        request.user.wallet_address = wallet_address
        request.user.save(update_fields=["wallet_address"])

        # Directly call indexer register endpoint to ensure immediate indexing
        if settings.INDEXER_INTERNAL_SECRET and settings.INDEXER_URL:
            try:
                httpx.post(
                    f"{settings.INDEXER_URL.rstrip('/')}/index/register",
                    json={
                        "user_id": request.user.user_id,
                        "wallet_address": wallet_address,
                    },
                    headers={"x-internal-secret": settings.INDEXER_INTERNAL_SECRET},
                    timeout=5.0,
                )
            except Exception as error:
                logger.warning(
                    "Direct indexer register failed in SaveWalletAddressView for %s: %s",
                    wallet_address,
                    error,
                )

        return Response({"success": True}, status=status.HTTP_200_OK)