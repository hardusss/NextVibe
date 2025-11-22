from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated

from ..serializers_pac import UserDetailSerializer
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

BANED_FIELDS = [
    "email",
    "last_login",
    "secret_2fa",
    "is2FA",
    "count_generations_ai",
    "is_staff",
    "is_superuser",
    "is_active",
    "last_activity"
]
class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile"
    
    def get(self, request, id: int):
        try:
            user = User.objects.get(user_id=id)
            isProfile = request.query_params.get('isProfile')
            serializer = UserDetailSerializer(user)

            data = serializer.data.copy()

            is_subscribed = False
            if isProfile == "true":
                owner = User.objects.get(user_id=request.user.user_id)
                if data["user_id"] in owner.follow_for:
                   is_subscribed = True

            if id != request.user.user_id:
                for banned_field in BANED_FIELDS:
                    data.pop(banned_field, None)

            return Response({**data, "is_subscribed": is_subscribed}, status=status.HTTP_200_OK)
        
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
