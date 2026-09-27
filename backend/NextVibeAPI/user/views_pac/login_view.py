from ..serializers_pac import UserLoginSerializer
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView
from verification.accounts import needs_email_verification
from verification.views import verification_required


class LoginUserView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        if needs_email_verification(user):
            # The password is right; a code sent to the email finishes the sign-in (email/verify/)
            return verification_required(user, status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "message": "User logged in successfully.",
                **serializer.data
            }, 
            status=status.HTTP_200_OK
        )


class TokenObtainView(TokenObtainPairView):
    """/users/token/: simplejwt's email + password pair, rate limited like login and closed to unconfirmed emails."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])
        if needs_email_verification(serializer.user):
            return verification_required(serializer.user, status.HTTP_403_FORBIDDEN)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
