import os
import uuid
import jwt
from datetime import datetime, timezone, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

CHERRY_APP_ID = "16e14376-0fce-4536-8891-754fd8fb5748"

class CherryEmbedTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        app_secret = os.environ.get("CHERRY_APP_SECRET", "")
        app_id = os.environ.get("CHERRY_APP_ID", CHERRY_APP_ID)

        user = request.user
        wallet_address = getattr(user, "wallet_address", None)
        if not wallet_address:
            wallet_address = getattr(user, "username", None) or f"user_{getattr(user, 'user_id', 'anon')}"

        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(wallet_address),
            "app_id": str(app_id),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
            "jti": str(uuid.uuid4()),
        }

        token = jwt.encode(payload, app_secret, algorithm="HS256")
        if isinstance(token, bytes):
            token = token.decode("utf-8")

        return Response({"token": token})
