"""
City and time zone for a Proof of Meet card, from the tap's H3 cell.

Only a city name leaves this module, never coordinates or a street.

City: Mapbox (the geocoder the app's map uses) when MAPBOX_ACCESS_TOKEN is set
on the server, otherwise OpenStreetMap's Nominatim through geopy (already a
dependency). Lookups use the centre of the cell's res-7 parent (~5 km²), so
every tap nearby gets the same answer, and are cached for 30 days; a failed
lookup is cached for a minute, so a card isn't stuck on "In person".
Nominatim allows about one request a second: calls take turns through a
cache slot and give up after a second and a half. The app asks for a meet
right after the tap, so the lookup is normally done before anyone shares it.

Time zone: tzdata (pinned in modules.txt) ships zone1970.tab, the reference
point of every zone. The zone is the nearest one in the city's country, or
the nearest one at all when the country is unknown.
"""
import logging
import math
import os
import time
from functools import lru_cache
from importlib import resources
from zoneinfo import ZoneInfo

import h3
import requests
from django.core.cache import cache

logger = logging.getLogger("posts.meets")

CACHE_RES = 7
FOUND_TTL = 30 * 24 * 3600
FAILED_TTL = 60
USER_AGENT = "NextVibe/1.0 (https://nextvibe.io; Proof of Meet cards)"
NOMINATIM_SLOT = "meet:geocode:nominatim-slot"
NOMINATIM_WAIT = 1.5
# Place kinds that read as a city on the card, most specific first
CITY_KEYS = ("city", "town", "village", "municipality")


class LookupFailed(Exception):
    """The geocoder couldn't answer (network, quota); try again later."""


def place_for_cell(cell):
    """(city, ISO 3166 country code) for an H3 cell; either may be None."""
    anchor = _anchor_cell(cell)
    if anchor is None:
        return None, None
    key = f"meet:place:{anchor}"
    cached = cache.get(key)
    if cached is not None:
        return cached.get("city"), cached.get("country")
    lat, lng = h3.cell_to_latlng(anchor)
    try:
        city, country = lookup(lat, lng)
    except LookupFailed as e:
        logger.warning("meets.geocode_failed cell=%s: %s", anchor, e)
        cache.set(key, {}, FAILED_TTL)
        return None, None
    cache.set(key, {"city": city, "country": country}, FOUND_TTL)
    return city, country


def cell_latlng(cell):
    try:
        return h3.cell_to_latlng(cell)
    except Exception:
        return None


def _anchor_cell(cell):
    if not cell:
        return None
    try:
        if not h3.is_valid_cell(cell):
            return None
        res = h3.get_resolution(cell)
        return h3.cell_to_parent(cell, CACHE_RES) if res > CACHE_RES else cell
    except Exception:
        return None


def lookup(lat, lng):
    """(city, country code) at a point. Raises LookupFailed when it can't tell."""
    token = os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get("MAPBOX_TOKEN")
    if token:
        return _mapbox(lat, lng, token)
    return _nominatim(lat, lng)


def _mapbox(lat, lng, token):
    try:
        resp = requests.get(
            f"https://api.mapbox.com/geocoding/v5/mapbox.places/{lng:.5f},{lat:.5f}.json",
            params={"types": "place", "language": "en", "limit": 1, "access_token": token},
            headers={"User-Agent": USER_AGENT},
            timeout=(3, 4),
        )
        resp.raise_for_status()
        features = resp.json().get("features") or []
    except Exception as e:
        raise LookupFailed(f"mapbox: {type(e).__name__}") from None
    if not features:
        return None, None  # nothing there (open sea)
    feature = features[0]
    country = next(
        (c.get("short_code") for c in feature.get("context") or [] if str(c.get("id", "")).startswith("country.")),
        None,
    )
    return _clean(feature.get("text")), _country(country)


def _nominatim(lat, lng):
    if not _take_nominatim_slot():
        raise LookupFailed("nominatim: busy")
    try:
        from geopy.geocoders import Nominatim

        found = Nominatim(user_agent=USER_AGENT, timeout=3).reverse(
            (lat, lng), zoom=10, language="en", addressdetails=True,
        )
    except Exception as e:
        raise LookupFailed(f"nominatim: {type(e).__name__}") from None
    if found is None:
        return None, None
    address = (found.raw or {}).get("address") or {}
    city = next((address[k] for k in CITY_KEYS if address.get(k)), None)
    return _clean(city), _country(address.get("country_code"))


def _take_nominatim_slot():
    deadline = time.monotonic() + NOMINATIM_WAIT
    while True:
        if cache.add(NOMINATIM_SLOT, 1, timeout=1):
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.25)


def _clean(name):
    name = " ".join(str(name or "").split())
    return name[:60] or None


def _country(code):
    code = str(code or "").split("-")[0].strip().upper()
    return code if len(code) == 2 else None


# ── Time zones ───────────────────────────────────────────────────────────

def timezone_at(lat, lng, country=None):
    """ZoneInfo for a point, or None if tzdata's table can't be read."""
    zones = _zones()
    if not zones:
        return None
    pool = [z for z in zones if country and country in z[0]] or zones
    name = min(pool, key=lambda z: _distance(lat, lng, z[1], z[2]))[3]
    try:
        return ZoneInfo(name)
    except Exception:
        return None


@lru_cache(maxsize=1)
def _zones():
    """[(country codes, lat, lng, zone name)] from zone1970.tab."""
    text = None
    try:
        text = resources.files("tzdata").joinpath("zoneinfo").joinpath("zone1970.tab").read_text(encoding="utf-8")
    except Exception:
        for path in ("/usr/share/zoneinfo/zone1970.tab",):
            try:
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
                break
            except OSError:
                continue
    if not text:
        logger.warning("meets.no_zone_table")
        return ()
    zones = []
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        try:
            lat, lng = _iso6709(parts[1])
        except (ValueError, IndexError):
            continue
        zones.append((frozenset(parts[0].split(",")), lat, lng, parts[2]))
    return tuple(zones)


def _iso6709(coord):
    """'+5026+03031' or '+404251-0740023' → (lat, lng) in degrees."""
    split = max(coord.rfind("+"), coord.rfind("-"))
    return _degrees(coord[:split], 2), _degrees(coord[split:], 3)


def _degrees(part, degree_digits):
    sign = -1 if part[0] == "-" else 1
    digits = part[1:]
    degrees = int(digits[:degree_digits])
    minutes = int(digits[degree_digits:degree_digits + 2])
    seconds = int(digits[degree_digits + 2:degree_digits + 4] or 0)
    return sign * (degrees + minutes / 60 + seconds / 3600)


def _distance(lat1, lng1, lat2, lng2):
    """Great-circle distance (radians); only compared, never shown."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlng = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * math.asin(min(1.0, math.sqrt(a)))
