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
CHERRY_ROOM_ID = "68a27a2f-f26b-4a84-b8d6-55be5cb86122"
CHERRY_PROJECT_KEY = "cherry_sk_db17307ee465_0e9daca21af1fe0b54a82e688cefcfac8f3dff286f501d44"

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
        now = datetime.now(timezone.utc)

        # Update last activity timestamp for active chat session
        try:
            user.last_activity = now
            user.save(update_fields=["last_activity"])
        except Exception:
            pass

        wallet_address = getattr(user, "wallet_address", None)
        if not wallet_address:
            wallet_address = getattr(user, "username", None) or f"user_{getattr(user, 'user_id', 'anon')}"

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
            now = datetime.now(timezone.utc)

            # Query real-time group information from Cherry API using Project key (cherry_sk_)
            cherry_count = None
            try:
                import requests
                project_key = os.environ.get("CHERRY_PROJECT_KEY", CHERRY_PROJECT_KEY)
                resp = requests.get(
                    f"https://api.cherry.fun/api/v1/apps/groups/{CHERRY_ROOM_ID}",
                    headers={"Authorization": f"Bearer {project_key}"},
                    timeout=3
                )
                if resp.status_code == 200:
                    room_data = resp.json().get("room", {})
                    cherry_count = room_data.get("memberCount")
            except Exception as cherry_err:
                logger.warning(f"Failed to fetch member count from Cherry API: {cherry_err}")

            target_limit = cherry_count if (cherry_count and cherry_count > 0) else 6

            # Filter active community members (active in last 7 days or online)
            active_cutoff = now - timedelta(days=7)

            query = User.objects.filter(is_active=True, is_baned=False)\
                        .filter(last_activity__gte=active_cutoff)\
                        .exclude(username__in=['_', 'test', 'admin'])\
                        .exclude(username__icontains='test_wallet')

            users = list(query.order_by('-is_online', '-last_activity', 'username')[:target_limit])

            # Fallback to last 30 days if fewer than target_limit active users
            if len(users) < target_limit:
                active_cutoff_30 = now - timedelta(days=30)
                query = User.objects.filter(is_active=True, is_baned=False)\
                            .filter(last_activity__gte=active_cutoff_30)\
                            .exclude(username__in=['_', 'test', 'admin'])\
                            .exclude(username__icontains='test_wallet')
                users = list(query.order_by('-is_online', '-last_activity', 'username')[:target_limit])

            if current_user not in users:
                if len(users) >= target_limit and len(users) > 0:
                    users.pop()
                users.insert(0, current_user)
            else:
                users.remove(current_user)
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

            return Response({"members": members, "count": target_limit})
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
            import hashlib
            from django.core.cache import cache

            data = request.data or {}
            logger.info(f"Cherry Webhook payload received: {data}")

            event_type = str(data.get("event") or data.get("type") or data.get("action") or "").lower()
            payload = data.get("payload") or data.get("data") or data

            is_msg_event = (
                not event_type or
                any(kw in event_type for kw in ["message", "msg", "chat", "create", "send"])
            )

            if is_msg_event:
                msg_dict = payload.get("message") if isinstance(payload.get("message"), dict) else payload

                message_text = (
                    msg_dict.get("text") or
                    msg_dict.get("content") or
                    msg_dict.get("body") or
                    msg_dict.get("message") or
                    data.get("text") or
                    data.get("content") or
                    "New message in NextVibe Group"
                )
                if isinstance(message_text, dict):
                    message_text = message_text.get("text") or message_text.get("content") or "New message in NextVibe Group"

                message_text = str(message_text).strip()

                sender_raw = (
                    msg_dict.get("sender_wallet") or
                    msg_dict.get("sender") or
                    msg_dict.get("user") or
                    msg_dict.get("author") or
                    payload.get("sender_wallet") or
                    payload.get("sender") or
                    data.get("sender")
                )

                sender_wallet = None
                sender_username = None

                if isinstance(sender_raw, dict):
                    sender_wallet = sender_raw.get("wallet_address") or sender_raw.get("wallet") or sender_raw.get("address") or sender_raw.get("sub")
                    sender_username = sender_raw.get("username") or sender_raw.get("name")
                elif isinstance(sender_raw, str):
                    sender_wallet = sender_raw

                # Set sender_username from authenticated user if available
                if not sender_username and request.user and request.user.is_authenticated:
                    sender_username = request.user.username

                # Deduplicate identical message notifications within 15 seconds window
                user_id_key = request.user.user_id if (request.user and request.user.is_authenticated) else 0
                msg_fingerprint = f"{message_text}:{sender_wallet}:{user_id_key}"
                cache_key = f"cherry_push_dedup:{hashlib.md5(msg_fingerprint.encode()).hexdigest()}"

                if cache.get(cache_key):
                    logger.info(f"Skipping duplicate push notification for key: {cache_key}")
                    return Response({"status": "duplicate_skipped"})

                cache.set(cache_key, True, timeout=15)

                # Query all active community users who haven't muted Cherry chat
                query = User.objects.filter(
                    is_active=True,
                    is_baned=False,
                    muted_cherry_chat=False,
                    expo_push_token__isnull=False
                ).exclude(expo_push_token="")

                # Strictly exclude the sender user
                if request.user and request.user.is_authenticated:
                    query = query.exclude(user_id=request.user.user_id)
                    if getattr(request.user, "wallet_address", None):
                        query = query.exclude(wallet_address=request.user.wallet_address)
                    if getattr(request.user, "username", None):
                        query = query.exclude(username=request.user.username)

                if sender_wallet and isinstance(sender_wallet, str):
                    query = query.exclude(wallet_address=sender_wallet).exclude(username=sender_wallet)

                raw_tokens = list(query.values_list("expo_push_token", flat=True))

                if raw_tokens:
                    from exponent_server_sdk import PushClient, PushMessage

                    title = f"NextVibe Group ({sender_username})" if sender_username else "NextVibe Group"
                    body = message_text

                    valid_tokens = []
                    for t in raw_tokens:
                        if not t:
                            continue
                        if PushClient.is_exponent_push_token(t):
                            valid_tokens.append(t)
                        else:
                            wrapped = f"ExponentPushToken[{t}]"
                            if PushClient.is_exponent_push_token(wrapped):
                                valid_tokens.append(wrapped)

                    chunk_size = 100
                    for i in range(0, len(valid_tokens), chunk_size):
                        chunk = valid_tokens[i:i + chunk_size]
                        messages = [
                            PushMessage(
                                to=token,
                                title=title,
                                body=body,
                                data={
                                    "type": "cherry_chat",
                                    "roomId": "68a27a2f-f26b-4a84-b8d6-55be5cb86122"
                                },
                                sound="default",
                                priority="high",
                                display_in_foreground=True
                            )
                            for token in chunk
                        ]
                        try:
                            PushClient().publish_multiple(messages)
                        except Exception as push_err:
                            logger.error(f"Error sending Expo push chunk: {push_err}")

            return Response({"status": "ok"})
        except Exception as e:
            logger.error(f"Error in CherryWebhookView: {e}", exc_info=True)
            return Response({"error": str(e)}, status=400)

