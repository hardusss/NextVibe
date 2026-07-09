import logging
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from ..serializers_pac import GoogleRegister
from rest_framework.throttling import ScopedRateThrottle
from user.src.validate_apple_token import validate
from django.contrib.auth import get_user_model
from user.src.notify_admin_new_user import notify_admin_new_user

logger = logging.getLogger(__name__)


class AppleRegisterView(APIView):
    """
    Apple Sign-In endpoint.

    Lookup priority:
      1. By apple_user_id (Apple's stable `sub` claim) — works even with Private Relay emails.
      2. By email — fallback for users registered before apple_user_id was stored.

    On the very first sign-in the apple_user_id is persisted so all subsequent
    logins use the stable identifier regardless of email visibility.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        identity_token = request.data.get("identityToken")
        if not identity_token:
            logger.error("[Apple] Request missing identityToken")
            return Response({"error": "Not found identity token"}, status=400)

        apple_data = validate(identity_token)
        if not apple_data:
            logger.error("[Apple] Token validation failed (see validate_apple_token logs above)")
            return Response({"error": "Token not valid"}, status=400)

        apple_email = apple_data.get("email")
        apple_user_id = apple_data.get("sub")  # Apple's stable unique user identifier

        if not apple_user_id:
            logger.error(f"[Apple] Token valid but missing 'sub'. Payload keys: {list(apple_data.keys())}")
            return Response({"error": "Cannot extract user info from token"}, status=400)

        User = get_user_model()

        # 1. Try to find existing user by stable Apple user ID (covers Private Relay)
        user = User.all_objects.filter(apple_user_id=apple_user_id).first()

        # 2. Fallback: find by email for users who registered before apple_user_id was stored
        if not user and apple_email:
            user = User.all_objects.filter(email=apple_email).first()
            if user and not user.apple_user_id:
                # Back-fill the apple_user_id so future logins use the stable ID
                user.apple_user_id = apple_user_id
                user.save(update_fields=["apple_user_id"])

        if user:
            serializer = GoogleRegister(user)
            return Response(serializer.data, status=200)

        # ── New user — require invite code ────────────────────────────────────
        if "from_invite_code" not in request.data:
            return Response({"error": "invite_code_required"}, status=status.HTTP_400_BAD_REQUEST)

        # Build username from email or Apple sub
        username = request.data.get("username")
        if not username:
            if apple_email:
                username = apple_email.split("@")[0].lower().replace("-", "_").replace("+", "_")
            else:
                username = f"apple_{apple_user_id[:8]}"

        # Apple may relay a private email; fall back to deterministic placeholder
        email_to_use = apple_email or f"{apple_user_id}@privaterelay.appleid.com"

        from ..serializers_pac.google_registration import GoogleRegister as GoogleRegisterSerializer
        serializer = GoogleRegisterSerializer(data={
            "email": email_to_use,
            "username": username,
            "avatar_url": None,
            "from_invite_code": request.data.get("from_invite_code"),
        })
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Store the stable Apple user ID and correct auth_provider
        user.apple_user_id = apple_user_id
        user.auth_provider = "apple"
        user.save(update_fields=["apple_user_id", "auth_provider"])

        notify_admin_new_user(user)
        return Response(GoogleRegister(user).data, status=status.HTTP_201_CREATED)
