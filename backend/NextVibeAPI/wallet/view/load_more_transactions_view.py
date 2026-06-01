import logging
import httpx
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)

class LoadMoreTransactionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet_address = request.user.wallet_address
        if not wallet_address:
            return Response({"error": "User has no wallet"}, status=400)

        if not settings.INDEXER_INTERNAL_SECRET or not settings.INDEXER_URL:
            logger.error("Indexer settings are missing in Django settings.")
            return Response({"error": "Internal server configuration error"}, status=500)

        # Get optional limit from request
        try:
            limit = int(request.data.get("limit", 50))
            if limit > 100:
                limit = 100
        except ValueError:
            limit = 50

        indexer_url = f"{settings.INDEXER_URL.rstrip('/')}/index/load-more"
        
        try:
            # We use a longer timeout because the indexer needs to fetch from Helius and insert into DB
            response = httpx.post(
                indexer_url,
                json={
                    "address": wallet_address,
                    "limit": limit
                },
                headers={"x-internal-secret": settings.INDEXER_INTERNAL_SECRET},
                timeout=20.0,
            )
            
            response.raise_for_status()
            return Response(response.json())
            
        except httpx.HTTPStatusError as e:
            logger.error(f"Indexer returned HTTP {e.response.status_code}: {e.response.text}")
            return Response({"error": "Failed to sync with indexer"}, status=502)
        except Exception as e:
            logger.error(f"Failed to communicate with indexer: {str(e)}")
            return Response({"error": "Failed to communicate with indexer"}, status=502)
