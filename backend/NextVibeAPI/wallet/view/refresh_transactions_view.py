import logging
import httpx
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)


class RefreshTransactionsView(APIView):
    """
    Triggers a refresh of the latest transactions from the blockchain.
    Calls the tx-indexer's /index/refresh-latest endpoint, which fetches
    the most recent N transactions from Helius and upserts them into the DB.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet_address = request.user.wallet_address
        if not wallet_address:
            return Response({"error": "User has no wallet"}, status=400)

        if not settings.INDEXER_INTERNAL_SECRET or not settings.INDEXER_URL:
            logger.error("Indexer settings are missing in Django settings.")
            return Response({"error": "Internal server configuration error"}, status=500)

        try:
            limit = int(request.data.get("limit", 20))
            if limit > 100:
                limit = 100
        except ValueError:
            limit = 20

        indexer_url = f"{settings.INDEXER_URL.rstrip('/')}/index/refresh-latest"

        try:
            response = httpx.post(
                indexer_url,
                json={
                    "address": wallet_address,
                    "limit": limit,
                },
                headers={"x-internal-secret": settings.INDEXER_INTERNAL_SECRET},
                timeout=20.0,
            )
            response.raise_for_status()
            return Response(response.json())
        except httpx.HTTPStatusError as e:
            logger.error(f"Indexer returned HTTP {e.response.status_code}: {e.response.text}")
            return Response({"error": "Failed to refresh transactions"}, status=502)
        except Exception as e:
            logger.error(f"Failed to communicate with indexer: {str(e)}")
            return Response({"error": "Failed to communicate with indexer"}, status=502)
