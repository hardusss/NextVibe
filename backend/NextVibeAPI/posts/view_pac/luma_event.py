import random
import re
import json
from urllib.parse import urlparse
from datetime import datetime
import requests
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from bs4 import BeautifulSoup

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


def _parse_dt(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
def _fetch_luma_event(url: str) -> dict:
    """
    Minimal Luma fetch by scraping public page HTML.
    We intentionally keep parsing conservative: title, start time, location, cover image, description text.
    """
    r = requests.get(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        },
        timeout=12,
    )
    r.raise_for_status()
    
    soup = BeautifulSoup(r.text, 'html.parser')

    def _meta(name: str) -> str | None:
        tag = soup.find("meta", property=name) or soup.find("meta", attrs={"name": name})
        return tag["content"] if tag and tag.has_attr("content") else None
 
    title = _meta("og:title") or _meta("twitter:title")
    cover_image = _meta("og:image") or _meta("twitter:image")
    description = _meta("description") or _meta("og:description") or _meta("twitter:description")

    location = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") in ("Event", "SocialEvent"):
                    loc = item.get("location", {})
                    # 1. Search for coordinates in the standard geo object
                    geo = loc.get("geo", {})
                    lat = geo.get("latitude")
                    lng = geo.get("longitude")
                    
                    gmaps_url = loc.get("url") or ""
                    
                    # 2. If there is no direct geo, try to get it from the Google Maps URL using a regular expression
                    if not lat or not lng:
                        # Search for patterns like @49.839,24.029 or q=49.839,24.029
                        match = re.search(r'[@=](-?\d+\.\d+),(-?\d+\.\d+)', gmaps_url)
                        if match:
                            lat = match.group(1)
                            lng = match.group(2)
                            
                    # Safely convert to float
                    try:
                        lat = float(lat) if lat else None
                        lng = float(lng) if lng else None
                    except (ValueError, TypeError):
                        lat, lng = None, None

                    location = {
                        "name": loc.get("name"),
                        "address": loc.get("address") if isinstance(loc.get("address"), str)
                                   else loc.get("address", {}).get("streetAddress"),
                        "url": gmaps_url if gmaps_url else None,
                        "lat": lat,
                        "lng": lng,
                    }
                    start_time = _parse_dt(item.get("startDate"))
                    end_time = _parse_dt(item.get("endDate"))
                    break
        except (json.JSONDecodeError, AttributeError):
            continue

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    full_text = soup.get_text(separator=" ", strip=True)
 
    return {
        "url": url,
        "title": title,
        "cover_image": cover_image,
        "description": description,
        "location": location,
        "full_text": full_text,   
        "start_time": start_time,
        "end_time": end_time,
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

        full_text = (event.get("full_text") or "").lower()
        desc_text = (event.get("description") or "").lower()

        ok = (code.lower() in full_text) or (code.lower() in desc_text)

        return Response(
            {"status": "ok", "data": {"verified": ok, "code": code, "event": event}},
            status=status.HTTP_200_OK,
        )

