import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from django.db import transaction

logger = logging.getLogger(__name__)
User = get_user_model()

EXPO_TOKEN_PREFIXES = ("ExponentPushToken[", "ExpoPushToken[")
MAX_TOKEN_LENGTH = User._meta.get_field("expo_push_token").max_length


def is_expo_push_token(token) -> bool:
    """
    Only Expo push tokens can be delivered. Older app builds also sent the raw
    APNs/FCM device token here, which overwrote a working Expo token.
    """
    return (
        isinstance(token, str)
        and len(token) <= MAX_TOKEN_LENGTH
        and token.startswith(EXPO_TOKEN_PREFIXES)
        and token.endswith("]")
    )


class SavePushTokenView(APIView):
    """
    The Expo push token of the signed-in account (one per account).

    GET   -> {"token": "<token>" | null}. The app compares it with its own
             token on every launch.
    POST  {"pushToken": "<token>"} binds the token to this account. A token
          reaches one account only: any other account holding it (a shared or
          handed-down phone) loses it. Sending the current token again is a
          no-op.
    POST  {"pushToken": null, "releaseToken": "<token>"} is sign-out. It clears
          the token if it is still releaseToken, so signing out on one phone
          doesn't unhook the account's newer phone. Without releaseToken it
          clears whatever is stored.
    """
    permission_classes = [IsAuthenticated]
    throttle_scope = "save_push_token"

    def get_throttles(self):
        # Every launch reads; only writes are rate limited.
        if self.request.method == "GET":
            return []
        return [ScopedRateThrottle()]

    def get(self, request) -> Response:
        return Response({"token": request.user.expo_push_token or None}, status=status.HTTP_200_OK)

    def post(self, request) -> Response:
        user = request.user

        if "pushToken" not in request.data:
            return Response({
                "error": "pushToken is required."
            }, status=status.HTTP_400_BAD_REQUEST)

        token = request.data.get("pushToken")
        if token is None:
            return self._release(user, request.data.get("releaseToken"))

        if not isinstance(token, str) or not token.strip():
            return Response({
                "error": "Valid pushToken string is required."
            }, status=status.HTTP_400_BAD_REQUEST)

        token = token.strip()
        if not is_expo_push_token(token):
            return Response({
                "error": "pushToken must be an Expo push token."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Banned accounts authenticate (to see the ban screen) but get no pushes.
        if user.is_baned:
            return Response({
                "error": "User not found."
            }, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            taken_from = (
                User.all_objects.filter(expo_push_token=token)
                .exclude(user_id=user.user_id)
                .update(expo_push_token=None)
            )
            if user.expo_push_token == token:
                saved = False
            else:
                user.expo_push_token = token
                user.save(update_fields=["expo_push_token"])
                saved = True

        if taken_from:
            logger.info("SavePushTokenView: token moved to user %s from %s other account(s)", user.user_id, taken_from)
        if not saved:
            return Response({"data": "Token already saved"}, status=status.HTTP_200_OK)
        logger.info("SavePushTokenView: Saved push token for user %s", user.user_id)
        return Response({"data": "Token saved"}, status=status.HTTP_200_OK)

    def _release(self, user, release_token) -> Response:
        if not user.expo_push_token:
            return Response({"data": "No token saved"}, status=status.HTTP_200_OK)
        if isinstance(release_token, str) and release_token.strip() and release_token.strip() != user.expo_push_token:
            # Another phone registered since; it keeps receiving pushes.
            return Response({"data": "Token belongs to another device"}, status=status.HTTP_200_OK)

        user.expo_push_token = None
        user.save(update_fields=["expo_push_token"])
        logger.info("SavePushTokenView: Cleared push token for user %s", user.user_id)
        return Response({"data": "Token cleared"}, status=status.HTTP_200_OK)
