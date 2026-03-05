from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle


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
        
        # Set token
        token = request.data.get("pushToken")
        if not token:
            return Response({
                "error": "Token not found."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.expo_push_token = token
        user.save()
        return Response({
            "data": "Token saved"
        }, status=status.HTTP_200_OK)