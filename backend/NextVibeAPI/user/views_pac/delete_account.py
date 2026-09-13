import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.core.cache import cache

logger = logging.getLogger(__name__)

DEFAULT_AVATAR = "images/default.png"


class DeleteAccountView(APIView):
    """
    Anonymizing soft delete of the requesting account.

    A hard delete would cascade through Reputation rows given to other users,
    orphan chats mirrored by the Node socket service, and desync the
    tx-indexer — so instead PII is scrubbed in place and the account is
    flipped to the banned/inactive state that every default manager
    (user/posts/chat) already filters out.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def delete(self, request):
        user = request.user

        try:
            if user.avatar and user.avatar.name and user.avatar.name != DEFAULT_AVATAR:
                user.avatar.delete(save=False)
        except Exception:
            # Storage hiccups must not block the deletion itself
            logger.warning("[Account] Could not delete avatar file for user_id=%s", user.user_id)

        user.username = f"deleted_user_{user.user_id}"
        user.email = None
        user.password = None
        user.about = ""
        user.avatar = DEFAULT_AVATAR
        user.wallet_address = None
        user.secret_2fa = None
        user.is2FA = False
        user.expo_push_token = None
        user.apple_user_id = None
        user.auth_provider = "deleted"
        user.is_baned = True    # existing banned-user filters hide profile + content
        user.is_active = False  # CustomJWTAuthentication rejects inactive accounts
        user.save()

        # check_status caches ban state for 5 min — overwrite it immediately
        cache.set(f"user_ban_status_{user.user_id}", True, 300)

        logger.info("[Account] Soft-deleted user_id=%s", user.user_id)
        return Response({"success": True}, status=status.HTTP_200_OK)
