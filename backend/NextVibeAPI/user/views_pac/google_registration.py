from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from ..serializers_pac import GoogleRegister
from rest_framework.throttling import ScopedRateThrottle
from user.src.validate_google_token_id import validate
from django.contrib.auth import get_user_model

class GoogleRegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        idToken = request.data.get("idToken")
        if not idToken:
            return Response({"error": "Not found id token"}, status=400)

        google_data = validate(idToken)
        if not google_data or not google_data.get("email_verified"):
            return Response({"error": "Token not valid or email not verified"}, status=400)

        User = get_user_model()
        user = User.objects.filter(email=google_data["email"]).first()

        if user:
            serializer = GoogleRegister(user)
            return Response(serializer.data, status=200)

        # If account not created, gets invite code
        invite_code = request.data.get("from_invite_code")
        if not invite_code:
            return Response(
                {"error": "invite_code_required", "detail": "Account not found. Please provide an invite code to register."},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = request.data.get("username")
        avatar_url = request.data.get("avatar_url")
        if not username:
            username = google_data.get("name", "").replace(" ", "_").lower()

        serializer = GoogleRegister(data={
            "email": google_data["email"],
            "username": username,
            "avatar_url": avatar_url,
            "from_invite_code": invite_code,
        })
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(GoogleRegister(user).data, status=status.HTTP_201_CREATED)