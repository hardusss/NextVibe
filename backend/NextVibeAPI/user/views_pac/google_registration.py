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

        if not user:
            serializer = GoogleRegister(data={
                "email": google_data["email"],
                "username": google_data.get("name"),
                "avatar_url": google_data.get("avatar_url")
            })
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
        else:
            serializer = GoogleRegister(user)

        return Response(serializer.data, status=200)
