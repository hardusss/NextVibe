import random
import re
from urllib.parse import urlparse

import requests
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView


def _normalize_luma_url(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if not raw.startswith("http://") and not raw.startswith("https://"):
        raw = f"https://{raw}"
    try:
        p = urlparse(raw)
    except Exception:
        return None

    host = (p.netloc or "").lower()
    if host not in ("lu.ma", "www.lu.ma", "luma.com", "www.luma.com"):
        return None

    # keep only path (no query/fragment)
    path = (p.path or "").strip("/")
    if not path:
        return None

    return f"https://{host}/{path}"


def _generate_nv_code() -> str:
    # NV-123 (3 digits). Retry a few times to reduce collisions.
    for _ in range(10):
        code = f"NV-{random.randint(100, 999)}"
        return code
    return f"NV-{random.randint(100, 999)}"


def _cache_key(user_id: int, luma_url: str) -> str:
    return f"luma_verify:{user_id}:{luma_url}"


def _fetch_luma_event(url: str) -> dict:
    """
    Minimal Luma fetch by scraping public page HTML.
    We intentionally keep parsing conservative: title, start time, location, cover image, description text.
    """
    r = requests.get(
        url,
        headers={
            "User-Agent": "NextVibe/1.0 (+https://nextvibe.io)",
            "Accept": "text/html,application/xhtml+xml",
        },
        timeout=12,
    )
    r.raise_for_status()
    html = r.text

    def _meta(name: str) -> str | None:
        # og:title, og:image, description etc.
        m = re.search(rf'<meta[^>]+property="{re.escape(name)}"[^>]+content="([^"]*)"', html, re.IGNORECASE)
        if not m:
            m = re.search(rf'<meta[^>]+name="{re.escape(name)}"[^>]+content="([^"]*)"', html, re.IGNORECASE)
        return m.group(1).strip() if m else None

    title = _meta("og:title") or _meta("twitter:title")
    image = _meta("og:image") or _meta("twitter:image")

    # best-effort description: meta description usually contains short summary
    desc = _meta("description") or _meta("og:description") or _meta("twitter:description")

    return {
        "url": url,
        "title": title,
        "cover_image": image,
        "description": desc,
    }


class LumaEventPreviewView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "luma_event_preview"

    def post(self, request) -> Response:
        luma_url = _normalize_luma_url(request.data.get("luma_url"))
        if not luma_url:
            return Response({"status": "error", "error": "invalid_luma_url"}, status=status.HTTP_400_BAD_REQUEST)

        user_id = int(request.user.user_id)
        code = _generate_nv_code()

        try:
            event = _fetch_luma_event(luma_url)
        except Exception:
            return Response({"status": "error", "error": "fetch_failed"}, status=status.HTTP_502_BAD_GATEWAY)

        cache.set(_cache_key(user_id, luma_url), {"code": code}, timeout=60 * 15)

        return Response(
            {"status": "ok", "data": {"event": event, "code": code}},
            status=status.HTTP_200_OK,
        )


class LumaEventVerifyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "luma_event_verify"

    def post(self, request) -> Response:
        luma_url = _normalize_luma_url(request.data.get("luma_url"))
        if not luma_url:
            return Response({"status": "error", "error": "invalid_luma_url"}, status=status.HTTP_400_BAD_REQUEST)

        user_id = int(request.user.user_id)
        cached = cache.get(_cache_key(user_id, luma_url)) or {}
        code = cached.get("code")
        if not code:
            return Response({"status": "error", "error": "no_code_or_expired"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            event = _fetch_luma_event(luma_url)
        except Exception:
            return Response({"status": "error", "error": "fetch_failed"}, status=status.HTTP_502_BAD_GATEWAY)

        hay = (event.get("description") or "").lower()
        ok = code.lower() in hay

        return Response(
            {"status": "ok", "data": {"verified": ok, "code": code, "event": event}},
            status=status.HTTP_200_OK,
        )

