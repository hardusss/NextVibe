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
      1. By apple_user_id (Apple's stable `sub` claim) — works even when the
         user hides their email behind Private Relay.
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
            return Response({"error": "Not found identity token"}, status=400)

        apple_data = validate(identity_token)
        if not apple_data:
            return Response({"error": "Token not valid"}, status=400)

        apple_email = apple_data.get("email")
        apple_user_id = apple_data.get("sub")  # Apple's stable unique user identifier

        if not apple_user_id:
            return Response({"error": "Cannot extract user info from token"}, status=400)

        User = get_user_model()

        # all_objects: the default manager hides banned accounts, which would
        # send an existing (banned) user down the create path into a unique
        # constraint IntegrityError → 500
        user = User.all_objects.filter(apple_user_id=apple_user_id).first()

        if not user and apple_email:
            user = User.all_objects.filter(email=apple_email).first()
            if user and not user.apple_user_id:
                # Back-fill so future logins use the stable ID
                user.apple_user_id = apple_user_id
                user.save(update_fields=["apple_user_id"])

        if user:
            logger.info("[Apple] Existing user found, logging in. apple_user_id=%s", apple_user_id)
            serializer = GoogleRegister(user)
            return Response(serializer.data, status=200)

        # ── New user — require invite code ────────────────────────────────────
        if "from_invite_code" not in request.data:
            return Response({"error": "invite_code_required"}, status=status.HTTP_400_BAD_REQUEST)

        invite_code = request.data.get("from_invite_code")
        if invite_code:
            from user.models import InviteUser
            if not InviteUser.objects.filter(invite_code=invite_code).exists():
                return Response({"error": "invalid_invite_code"}, status=status.HTTP_400_BAD_REQUEST)

        # Build username from the client-provided name, email, or Apple sub —
        # then de-duplicate, since username is unique
        username = request.data.get("username")
        if not username:
            if apple_email:
                username = apple_email.split("@")[0].lower().replace("-", "_").replace("+", "_")
            else:
                username = f"apple_{apple_user_id[:8]}"
        username = username[:140]
        if User.all_objects.filter(username=username).exists():
            base = username
            suffix = 1
            while User.all_objects.filter(username=username).exists():
                username = f"{base}_{suffix}"
                suffix += 1

        # Apple may withhold the email (Private Relay, or any sign-in after the
        # first); fall back to a deterministic placeholder
        email_to_use = apple_email or f"{apple_user_id}@privaterelay.appleid.com"

        serializer = GoogleRegister(data={
            "email": email_to_use,
            "username": username,
            "from_invite_code": invite_code,
        })
        if not serializer.is_valid():
            logger.warning("[Apple] Registration payload invalid: %s", serializer.errors)
            return Response(
                {"error": "registration_failed", "detail": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = serializer.save()

        # Store the stable Apple user ID and correct auth_provider
        logger.info("[Apple] Creating new user account. apple_user_id=%s", apple_user_id)
        user.apple_user_id = apple_user_id
        user.auth_provider = "apple"
        user.save(update_fields=["apple_user_id", "auth_provider"])

        notify_admin_new_user(user)
        return Response(GoogleRegister(user).data, status=status.HTTP_201_CREATED)
