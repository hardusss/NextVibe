import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from django.db import DataError

logger = logging.getLogger(__name__)
User = get_user_model()

class SavePushTokenView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "save_push_token"

    def post(self, request) -> Response:
        user = User.objects.filter(user_id=request.user.user_id).first()

        if not user:
            return Response({
                "error": "User not found."
            }, status=status.HTTP_404_NOT_FOUND)
        
        token = request.data.get("pushToken")
        if not token or not isinstance(token, str):
            return Response({
                "error": "Valid pushToken string is required."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        token = token.strip()
        if not token:
            return Response({
                "error": "pushToken cannot be empty."
            }, status=status.HTTP_400_BAD_REQUEST)

        if user.expo_push_token == token:
            return Response({"data": "Token already saved"}, status=status.HTTP_200_OK)

        user.expo_push_token = token[:512]
        try:
            user.save(update_fields=["expo_push_token"])
            logger.info("SavePushTokenView: Saved push token for user %s (len=%s)", user.user_id, len(token))
            return Response({"data": "Token saved"}, status=status.HTTP_200_OK)
        except DataError as de:
            # Fallback if DB column has not been migrated from varchar(100) yet
            logger.warning(
                "SavePushTokenView: DataError saving token for user %s (column may be varchar(100)). Retrying with truncated token: %s",
                user.user_id,
                de,
            )
            try:
                user.expo_push_token = token[:100]
                user.save(update_fields=["expo_push_token"])
                return Response({"data": "Token saved (truncated)"}, status=status.HTTP_200_OK)
            except Exception as inner_e:
                logger.error("SavePushTokenView: Failed to save truncated token for user %s: %s", user.user_id, inner_e)
                return Response(
                    {"error": "Push token could not be stored due to database limits."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.error("SavePushTokenView: Unexpected error saving push token for user %s: %s", user.user_id, e, exc_info=True)
            return Response(
                {"error": "Failed to save push token."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )