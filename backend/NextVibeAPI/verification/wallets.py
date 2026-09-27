"""
Proving an account controls a Solana wallet: the wallet signs
"Verify wallet for NextVibe.\nNonce: <ms>" (Mobile Wallet Adapter signMessage
in the app). A signature is accepted once, and only while it's fresh. A wallet
sign-in (user/views_pac/wallet_singin.py) proves the wallet too.
"""
import hashlib
import re
import time

import base58
from django.core.cache import cache
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

from .models import WalletProof

PROOF_MESSAGE_RE = re.compile(r"^Verify wallet for NextVibe\.\nNonce: (\d{10,16})$")
MAX_AGE_SECONDS = 15 * 60
# Shared with the wallet sign-in view: a signature is accepted once anywhere
USED_PREFIX = "wallet_sign_in:used:"


def _signature_bytes(signature) -> bytes | None:
    """The app sends the signature as a list of 64 byte values."""
    if not isinstance(signature, list) or len(signature) != 64:
        return None
    try:
        return bytes(signature)
    except (TypeError, ValueError):
        return None


def check_proof(wallet_address: str, proof) -> str | None:
    """None when `proof` ({message, signature}) is the wallet's fresh, unused signature, else the reason."""
    if not isinstance(proof, dict):
        return "Wallet signature is missing."
    message, signature = proof.get("message"), _signature_bytes(proof.get("signature"))
    if not isinstance(message, str) or signature is None:
        return "Wallet signature is not valid."
    match = PROOF_MESSAGE_RE.match(message)
    if not match:
        return "Wallet signature is not valid."
    if abs(time.time() * 1000 - int(match.group(1))) > MAX_AGE_SECONDS * 1000:
        return "The wallet signature expired. Please try again."
    try:
        VerifyKey(base58.b58decode(wallet_address)).verify(message.encode(), signature)
    except (BadSignatureError, ValueError, TypeError):
        return "Wallet signature is not valid."
    if not cache.add(USED_PREFIX + hashlib.sha256(signature).hexdigest(), 1, timeout=MAX_AGE_SECONDS * 2):
        return "This wallet signature was already used. Please try again."
    return None


def record_proof(user, wallet_address: str) -> None:
    WalletProof.objects.update_or_create(user=user, wallet_address=wallet_address)


def is_proven(user, wallet_address: str | None) -> bool:
    return bool(wallet_address) and WalletProof.objects.filter(user=user, wallet_address=wallet_address).exists()
