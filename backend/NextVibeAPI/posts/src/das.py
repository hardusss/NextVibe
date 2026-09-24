"""
Reading Solana assets through Helius DAS, server-side (the key never leaves
the backend, like wallet/view/rpc_proxy.py).

- find_leaf: did a mint we got no answer for land? (collectible_mint.py)
- owned_assets: the rest of a wallet, for the owner's cNFT tab.
"""
import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("posts.collectibles")

TIMEOUT = 10
OWNED_TTL = 60
OWNED_LIMIT = 100

_session = requests.Session()


class DasUnavailable(Exception):
    pass


def _url() -> str:
    key = getattr(settings, "HELIUS_API_KEY", "")
    if not key:
        raise DasUnavailable("HELIUS_API_KEY isn't set")
    return f"https://mainnet.helius-rpc.com/?api-key={key}"


def _rpc(method, params) -> dict:
    try:
        response = _session.post(_url(), json={"jsonrpc": "2.0", "id": "nv", "method": method, "params": params},
                                 timeout=TIMEOUT)
        data = response.json()
    except DasUnavailable:
        raise
    except Exception as e:
        raise DasUnavailable(str(e)) from e
    if "error" in data:
        raise DasUnavailable(str(data["error"]))
    return data.get("result") or {}


def find_leaf(owner, json_uri):
    """The asset id of `owner`'s cNFT whose metadata is `json_uri`, or None. Raises DasUnavailable."""
    result = _rpc("searchAssets", {"ownerAddress": owner, "jsonUri": json_uri, "compressed": True,
                                   "page": 1, "limit": 10})
    for item in result.get("items") or []:
        content = item.get("content") or {}
        if content.get("json_uri") == json_uri and not item.get("burnt"):
            return item.get("id")
    return None


def owned_assets(owner) -> list:
    """Up to 100 of a wallet's assets (60 s cache); [] when DAS can't answer."""
    key = "das:owned:" + hashlib.sha256(owner.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        result = _rpc("getAssetsByOwner", {"ownerAddress": owner, "page": 1, "limit": OWNED_LIMIT,
                                           "displayOptions": {"showUnverifiedCollections": True}})
    except DasUnavailable as e:
        logger.warning("das.owned_failed owner=%s: %s", owner, e)
        return []
    items = [item for item in result.get("items") or [] if not item.get("burnt")]
    cache.set(key, items, OWNED_TTL)
    return items


def asset_card(item) -> dict | None:
    """A DAS asset in the cNFT tab's card shape (only images; fungible tokens are skipped)."""
    interface = item.get("interface") or ""
    if interface in ("FungibleToken", "FungibleAsset"):
        return None
    content = item.get("content") or {}
    metadata = content.get("metadata") or {}
    links = content.get("links") or {}
    image = links.get("image")
    if not image:
        files = content.get("files") or []
        image = next((f.get("cdn_uri") or f.get("uri") for f in files if f.get("uri") or f.get("cdn_uri")), None)
    asset_id = item.get("id")
    if not asset_id:
        return None
    collection = next(
        (g.get("collection_metadata", {}).get("name") or g.get("group_value")
         for g in item.get("grouping") or [] if g.get("group_key") == "collection"),
        None,
    )
    return {
        "id": f"das:{asset_id}",
        "kind": "external",
        "kind_label": "In your wallet",
        "name": metadata.get("name") or "Collectible",
        "image_url": image,
        "recorded_at": None,
        "edition": None,
        "onchain": True,
        "asset_id": asset_id,
        "minted_at": None,
        "wallet": (item.get("ownership") or {}).get("owner"),
        "explorer_url": f"https://solscan.io/token/{asset_id}",
        "metadata_uri": content.get("json_uri"),
        "collection": collection,
        "claimed_later": False,
        "event_id": None,
        "post_id": None,
        "meet_slug": None,
        "with": None,
    }
