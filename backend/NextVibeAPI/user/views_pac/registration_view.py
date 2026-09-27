from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from ..serializers_pac import UserRegistrationSerializer
from rest_framework.throttling import ScopedRateThrottle
from user.src.notify_admin_new_user import notify_admin_new_user
from verification.accounts import needs_email_verification
from verification.views import verification_required


class RegisterUserView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        serializer = UserRegistrationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = serializer.save()
            notify_admin_new_user(user)
            if needs_email_verification(user):
                # No tokens until the code from the email comes back (email/verify/)
                return verification_required(
                    user, status.HTTP_201_CREATED,
                    message="Check your email for the code.", user_id=user.user_id,
                )
            user_data = UserRegistrationSerializer(user, context={'request': request}).data
            return Response(
                {
                    "message": "User registered successfully.",
                    "user_id": user.user_id,  
                    "data": user_data,
                },
                status=status.HTTP_201_CREATED
            ) 
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
