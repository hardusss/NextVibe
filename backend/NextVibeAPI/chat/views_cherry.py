import os
import uuid
import jwt
import logging
from datetime import datetime, timezone, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()

CHERRY_APP_ID = "16e14376-0fce-4536-8891-754fd8fb5748"

def get_avatar_url(user, request=None):
    try:
        if user and user.avatar and hasattr(user.avatar, 'url'):
            url = user.avatar.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception:
        pass
    return None

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


class CherryMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            current_user = request.user

            query = User.objects.filter(is_active=True, is_baned=False)\
                        .exclude(username__in=['_', 'test', 'admin'])\
                        .exclude(username__icontains='test_wallet')

            users = list(query.order_by('-is_online', '-last_activity', 'username')[:100])

            if current_user in users:
                users.remove(current_user)
                users.insert(0, current_user)
            else:
                users.insert(0, current_user)

            members = []
            for u in users:
                is_you = (u.user_id == current_user.user_id)
                members.append({
                    "user_id": u.user_id,
                    "username": u.username,
                    "avatar": get_avatar_url(u, request),
                    "is_online": True if is_you else getattr(u, 'is_online', False),
                    "wallet_address": u.wallet_address,
                    "is_you": is_you,
                })

            return Response({"members": members, "count": len(members)})
        except Exception as e:
            logger.error(f"Error in CherryMembersView: {e}")
            return Response({"error": str(e)}, status=500)


class CherryMuteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"is_muted": getattr(request.user, "muted_cherry_chat", False)})

    def post(self, request):
        user = request.user
        is_muted = request.data.get("is_muted")
        if is_muted is None:
            user.muted_cherry_chat = not user.muted_cherry_chat
        else:
            user.muted_cherry_chat = bool(is_muted)
        user.save(update_fields=["muted_cherry_chat"])
        return Response({"is_muted": user.muted_cherry_chat})


class CherryWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            data = request.data
            event = data.get("event") or data.get("type")
            payload = data.get("payload") or data.get("data") or {}

            if event in ["message.created", "message", "chat_message"]:
                sender_wallet = payload.get("sender_wallet") or payload.get("sender")
                message_text = payload.get("text") or payload.get("content") or payload.get("message") or "New message in NextVibe Group"

                query = User.objects.filter(is_active=True, muted_cherry_chat=False, expo_push_token__isnull=False).exclude(expo_push_token="")
                if sender_wallet:
                    query = query.exclude(wallet_address=sender_wallet)

                push_tokens = list(query.values_list("expo_push_token", flat=True))

                if push_tokens:
                    try:
                        from exponent_server_sdk import PushClient, PushMessage
                        messages = [
                            PushMessage(
                                to=token,
                                title="NextVibe Group",
                                body=str(message_text),
                                data={"type": "cherry_chat", "roomId": "68a27a2f-f26b-4a84-b8d6-55be5cb86122"}
                            )
                            for token in push_tokens if PushClient.is_exponent_push_token(token)
                        ]
                        if messages:
                            PushClient().publish_multiple(messages)
                    except Exception as push_err:
                        logger.error(f"Error sending Expo push notifications: {push_err}")

            return Response({"status": "ok"})
        except Exception as e:
            logger.error(f"Error in CherryWebhookView: {e}")
            return Response({"error": str(e)}, status=400)
