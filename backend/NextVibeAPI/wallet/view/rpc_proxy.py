import json
import logging

import requests
from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from django.http import JsonResponse, HttpResponse


logger = logging.getLogger(__name__)

# Helius RPC URL assembled server-side; the API key never leaves the backend.
_HELIUS_RPC_URL: str = (
    f"https://mainnet.helius-rpc.com/?api-key={settings.HELIUS_API_KEY}"
)

# Requests session for connection pooling / keep-alive.
_session = requests.Session()


class SolanaRpcProxyView(APIView):
    """
    Transparent JSON-RPC proxy to Helius.

    The mobile app sends standard Solana JSON-RPC payloads here instead of
    calling Helius directly, so the API key stays on the server.

    • Accepts POST with a JSON body (single request or batch).
    • Forwards the body as-is to Helius and streams the response back.
    • No authentication required (public chain data only).
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "rpc_proxy"

    def post(self, request, *_args, **_kwargs):
        try:
            # Forward the raw JSON body to Helius.
            body = request.body
            if not body:
                return JsonResponse(
                    {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Empty request body"}},
                    status=400,
                )

            resp = _session.post(
                _HELIUS_RPC_URL,
                data=body,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            # Return Helius' response directly.
            return HttpResponse(
                content=resp.content,
                status=resp.status_code,
                content_type=resp.headers.get("Content-Type", "application/json"),
            )

        except requests.Timeout:
            logger.warning("[RPC Proxy] Upstream timeout")
            return JsonResponse(
                {"jsonrpc": "2.0", "error": {"code": -32000, "message": "RPC timeout"}},
                status=504,
            )
        except Exception as exc:
            logger.exception("[RPC Proxy] Unexpected error: %s", exc)
            return JsonResponse(
                {"jsonrpc": "2.0", "error": {"code": -32603, "message": "Internal proxy error"}},
                status=502,
            )
