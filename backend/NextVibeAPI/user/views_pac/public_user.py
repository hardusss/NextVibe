from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle

from ..serializers_pac import PublicUserDetailSerializer

User = get_user_model()

# List of sensitive fields that should only be visible to the profile owner
BANNED_FIELDS = [
    "email", "last_login", "secret_2fa", "is2FA",
    "count_generations_ai", "is_staff", "is_superuser",
    "is_active", "last_activity"
]

class PublicUserDetailView(APIView):
    """
    Retrieve user profile details. 
    Supports public access while protecting sensitive data.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile"
    
    def get(self, request, id: int):
        try:
            # Fetch target user by custom user_id field
            user = User.objects.get(user_id=id)
            serializer = PublicUserDetailSerializer(user)
            data = serializer.data.copy()

            current_user = request.user
            is_authenticated = current_user.is_authenticated

            # PRIVACY PROTECTION LOGIC:
            # If the visitor is not logged in OR is viewing someone else's profile,
            # strip away all sensitive (banned) fields.
            if not is_authenticated or current_user.user_id != id:
                for field in BANNED_FIELDS:
                    data.pop(field, None)

            return Response({
                **data, 
            }, status=status.HTTP_200_OK)
        
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )