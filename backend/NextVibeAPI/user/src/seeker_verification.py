import logging
import threading

import requests
from django.core.cache import cache
from django.db import IntegrityError
from django.utils import timezone

from posts.constants import NFT_SERVICE_URL
from user.src.send_push_message import send

logger = logging.getLogger(__name__)

SGT_CACHE_TTL = 86400  # 24h per wallet
_CACHE_MISS = "none"


class SgtCheckError(Exception):
    """The on-chain SGT check could not be completed (RPC/service failure)."""


def check_sgt_onchain(wallet_address: str, force: bool = False):
    """
    Returns the Seeker Genesis Token mint address held by the wallet, or None.
    Results (including misses) are cached for 24h; force=True skips the cached
    value so a manual "Verify Seeker" always does a fresh scan.
    """
    cache_key = f"sgt:{wallet_address}"
    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return None if cached == _CACHE_MISS else cached

    try:
        res = requests.post(
            url=f"{NFT_SERVICE_URL}/seeker/sgt-check",
            json={"wallet": wallet_address},
            timeout=30,
        ).json()
    except Exception as e:
        raise SgtCheckError(str(e)) from e

    if not res.get("success"):
        raise SgtCheckError(res.get("error") or "SGT_CHECK_FAILED")

    mint = res.get("sgtMint")
    cache.set(cache_key, mint or _CACHE_MISS, SGT_CACHE_TTL)
    return mint


def grant_seeker_verified(user, sgt_mint, source: str):
    """
    Marks the user Seeker Verified. Returns (granted, error).
    error 'SGT_ALREADY_USED' when another account already holds this mint —
    one Genesis Token can only ever verify one user.
    """
    User = type(user)
    if sgt_mint and User.all_objects.filter(seeker_sgt_mint=sgt_mint).exclude(user_id=user.user_id).exists():
        return False, "SGT_ALREADY_USED"

    user.seeker_verified = True
    if sgt_mint:
        user.seeker_sgt_mint = sgt_mint
    user.seeker_verified_at = timezone.now()
    user.seeker_verified_source = source
    try:
        user.save(update_fields=[
            "seeker_verified", "seeker_sgt_mint",
            "seeker_verified_at", "seeker_verified_source",
        ])
    except IntegrityError:
        return False, "SGT_ALREADY_USED"
    return True, None


def needs_onchain_check(user) -> bool:
    # .skr-bootstrapped users still get checked so they can upgrade to 'onchain'
    return not (user.seeker_verified and user.seeker_verified_source == "onchain")


def verify_seeker_in_background(user_id, wallet_address: str):
    """Fire-and-forget SGT check after sign-in / wallet save. Never blocks the response."""
    t = threading.Thread(
        target=_verify_and_notify,
        args=(user_id, wallet_address),
        daemon=True,
    )
    t.start()


def _verify_and_notify(user_id, wallet_address):
    from django.contrib.auth import get_user_model
    user = get_user_model().all_objects.filter(user_id=user_id).first()
    if not user or not needs_onchain_check(user):
        return

    try:
        mint = check_sgt_onchain(wallet_address)
    except SgtCheckError as e:
        logger.warning("seeker.verify user=%s wallet=%s check failed: %s", user_id, wallet_address, e)
        return

    if not mint:
        logger.info("seeker.verify user=%s wallet=%s result=none", user_id, wallet_address)
        return

    had_badge = user.seeker_verified  # skr -> onchain upgrade: no second push
    granted, error = grant_seeker_verified(user, mint, "onchain")
    logger.info(
        "seeker.verify user=%s wallet=%s result=%s",
        user_id, wallet_address, mint if granted else (error or "none"),
    )
    if granted and not had_badge:
        _push_badge_granted(user)


def _push_badge_granted(user):
    push_token = getattr(user, "expo_push_token", None)
    if not push_token:
        return
    try:
        send(
            token=push_token,
            title="You're Seeker Verified",
            body="Your Seeker Genesis Token was detected. The badge now shows on your profile.",
            extra_data={"type": "seeker_verified"},
        )
    except Exception as e:
        logger.warning("seeker.verify push failed for user=%s: %s", user.user_id, e)
