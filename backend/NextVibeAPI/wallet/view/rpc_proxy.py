import hashlib
import json
import logging

import requests
from django.conf import settings
from django.core.cache import cache
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

# DAS methods whose responses are cached briefly so wallet tab switches
# don't hammer Helius. Keyed per method+params, 60s TTL.
_DAS_CACHE_METHODS = {"getAssetsByOwner"}
_DAS_CACHE_TTL_SECONDS = 60

# Methods that scan large parts of the chain. The app, its wallets and Jupiter
# don't call them; getProgramAccounts is only used by the LazorKit SDK, for its
# own program.
_BLOCKED_METHODS = frozenset({
    "getBlock", "getBlocks", "getBlocksWithLimit", "getBlockProduction",
    "getLargestAccounts", "getSupply", "getVoteAccounts", "getClusterNodes",
})
_PROGRAM_ACCOUNTS_ALLOWED = frozenset({"LazorjRFNavitUaBu5m3WaNPjU1maipvSW2rZfAFAKi"})
_MAX_BATCH = 20


def _rejection(payload) -> str | None:
    """Why this JSON-RPC payload isn't forwarded, or None when it is."""
    if isinstance(payload, list):
        if not payload or len(payload) > _MAX_BATCH:
            return f"A batch holds 1 to {_MAX_BATCH} requests"
        items = payload
    else:
        items = [payload]
    for item in items:
        if not isinstance(item, dict):
            return "Invalid request"
        method = item.get("method")
        if method in _BLOCKED_METHODS:
            return f"{method} is not available"
        if method == "getProgramAccounts":
            params = item.get("params") or [None]
            if params[0] not in _PROGRAM_ACCOUNTS_ALLOWED:
                return "getProgramAccounts is not available for this program"
    return None


def _das_cache_key(payload: dict) -> str | None:
    """Returns a cache key for a cacheable single JSON-RPC request, else None."""
    if not isinstance(payload, dict):
        return None
    method = payload.get("method")
    if method not in _DAS_CACHE_METHODS:
        return None
    params = json.dumps(payload.get("params"), sort_keys=True, default=str)
    digest = hashlib.sha256(f"{method}:{params}".encode()).hexdigest()
    return f"rpc_proxy:das:{digest}"


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

            try:
                payload = json.loads(body)
            except (ValueError, TypeError):
                return JsonResponse(
                    {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}},
                    status=400,
                )
            reason = _rejection(payload)
            if reason:
                return JsonResponse(
                    {"jsonrpc": "2.0", "id": payload.get("id") if isinstance(payload, dict) else None,
                     "error": {"code": -32601, "message": reason}},
                    status=403,
                )

            cache_key = _das_cache_key(payload)

            if cache_key:
                cached = cache.get(cache_key)
                if cached is not None:
                    return HttpResponse(
                        content=cached,
                        status=200,
                        content_type="application/json",
                    )

            resp = _session.post(
                _HELIUS_RPC_URL,
                data=body,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            if cache_key and resp.status_code == 200:
                try:
                    if "error" not in resp.json():
                        cache.set(cache_key, resp.content, _DAS_CACHE_TTL_SECONDS)
                except ValueError:
                    pass  # Non-JSON upstream body — never cache it.

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
