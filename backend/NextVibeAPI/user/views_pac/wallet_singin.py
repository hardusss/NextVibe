import hashlib
import logging
import re
import time

import base58
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from user.serializers_pac import UserWalletSignInSerializer
from user.src.seeker_verification import needs_onchain_check, verify_seeker_in_background
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

# What the app's Mobile Wallet Adapter sign-in asks the wallet to sign
# (components/SignInViaWallet/ButtonWalletSignIn.android.tsx): the nonce is
# Date.now() in milliseconds.
SIGN_IN_MESSAGE_RE = re.compile(r"^Sign in to NextVibe\.\nNonce: (\d{10,16})$")
# How old a signed message may be; covers the invite-code sheet between the
# first call and the retry that registers.
SIGN_IN_MAX_AGE_SECONDS = 15 * 60
USED_SIGNATURE_PREFIX = "wallet_sign_in:used:"


def _used_signature_key(signature_bytes: bytes) -> str:
    return USED_SIGNATURE_PREFIX + hashlib.sha256(signature_bytes).hexdigest()


def _check_sign_in_message(message) -> str | None:
    """None when the signed message is a fresh NextVibe sign-in message, else the error."""
    if isinstance(message, (bytes, bytearray)):
        message = bytes(message).decode("utf-8", "replace")
    if not isinstance(message, str):
        return "Sign-in message is not valid."
    match = SIGN_IN_MESSAGE_RE.match(message)
    if not match:
        return "Sign-in message is not valid."
    issued_ms = int(match.group(1))
    if abs(time.time() * 1000 - issued_ms) > SIGN_IN_MAX_AGE_SECONDS * 1000:
        return "This sign-in request expired. Please try again."
    return None


class WalletSignInView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "wallet_auth"

    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        signature_list = request.data.get('signature')
        message = request.data.get('message')
        username = request.data.get('username')
        is_lazorkit = request.data.get('is_lazorkit', False)

        logger.info(
            "Wallet sign-in request received: address=%s, is_lazorkit=%s, username=%s",
            wallet_address,
            is_lazorkit,
            username,
        )

        if not wallet_address or not isinstance(wallet_address, str):
            return Response(
                {"error": "wallet_address is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        wallet_address = wallet_address.strip()

        if not is_lazorkit:
            if not signature_list or message is None:
                return Response(
                    {"error": "signature and message are required for non-LazorKit wallets."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                pubkey_bytes = base58.b58decode(wallet_address)
                verify_key = VerifyKey(pubkey_bytes)
                signature_bytes = bytes(signature_list)
                message_bytes = message.encode('utf-8') if isinstance(message, str) else bytes(message)

                verify_key.verify(message_bytes, signature_bytes)

            except (BadSignatureError, ValueError, TypeError, AttributeError) as e:
                logger.warning(
                    "Invalid cryptographic signature for address=%s, error=%s",
                    wallet_address,
                    e,
                )
                return Response(
                    {"error": "Invalid cryptographic signature. Nice try, hacker!"},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            except Exception as e:
                logger.error(
                    "Unexpected error verifying signature for address=%s: %s",
                    wallet_address,
                    e,
                    exc_info=True
                )
                return Response(
                    {"error": "Failed to verify wallet signature."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        used_key = None
        if not is_lazorkit:
            message_error = _check_sign_in_message(message)
            if message_error:
                logger.warning("Rejected wallet sign-in message for address=%s: %s", wallet_address, message_error)
                return Response({"error": message_error}, status=status.HTTP_401_UNAUTHORIZED)
            # A signed message works once: it's marked used when tokens are issued
            used_key = _used_signature_key(bytes(signature_list))
            if cache.get(used_key):
                logger.warning("Rejected reused wallet sign-in signature for address=%s", wallet_address)
                return Response({"error": "This sign-in request was already used. Please try again."},
                                status=status.HTTP_401_UNAUTHORIZED)

        try:
            User = get_user_model()
            user = User.objects.filter(wallet_address=wallet_address).first()

            if user:
                if used_key and not cache.add(used_key, 1, timeout=SIGN_IN_MAX_AGE_SECONDS * 2):
                    return Response({"error": "This sign-in request was already used. Please try again."},
                                    status=status.HTTP_401_UNAUTHORIZED)
                refresh = RefreshToken.for_user(user)
                logger.info(
                    "Wallet sign-in successful for existing user: user_id=%s, address=%s",
                    user.user_id,
                    wallet_address,
                )
                if needs_onchain_check(user):
                    user_id = user.user_id
                    transaction.on_commit(
                        lambda: verify_seeker_in_background(user_id, wallet_address)
                    )
                return Response({
                    'token': {
                        'refresh': str(refresh),
                        'access': str(refresh.access_token),
                    },
                    'user_id': user.user_id,
                    'username': user.username
                })
            else:
                if "from_invite_code" not in request.data:
                    logger.info(
                        "New wallet address %s requires invite code to register",
                        wallet_address,
                    )
                    return Response({"error": "invite_code_required"}, status=status.HTTP_400_BAD_REQUEST)

                invite_code = request.data.get("from_invite_code")
                logger.info(
                    "Attempting registration with invite code for address=%s, code=%s",
                    wallet_address,
                    invite_code,
                )
                serializer = UserWalletSignInSerializer(data={
                    "wallet_address": wallet_address,
                    "username": username,
                    "from_invite_code": invite_code
                })
                if serializer.is_valid():
                    if used_key and not cache.add(used_key, 1, timeout=SIGN_IN_MAX_AGE_SECONDS * 2):
                        return Response({"error": "This sign-in request was already used. Please try again."},
                                        status=status.HTTP_401_UNAUTHORIZED)
                    user = serializer.save()
                    logger.info(
                        "Successfully registered new user via wallet: user_id=%s, address=%s",
                        user.user_id,
                        wallet_address,
                    )
                    new_user_id = user.user_id
                    transaction.on_commit(
                        lambda: verify_seeker_in_background(new_user_id, wallet_address)
                    )
                    return Response(serializer.data, status=status.HTTP_201_CREATED)

                logger.warning(
                    "Failed to register user via wallet for address=%s: %s",
                    wallet_address,
                    serializer.errors,
                )
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error("Unexpected error in WalletSignInView for %s: %s", wallet_address, e, exc_info=True)
            return Response(
                {
                    "detail": "Server error. Please try again later.",
                    "error": "Server error. Please try again later."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )