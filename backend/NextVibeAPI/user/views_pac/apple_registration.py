from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from ..serializers_pac import GoogleRegister
from rest_framework.throttling import ScopedRateThrottle
from user.src.validate_apple_token import validate
from django.contrib.auth import get_user_model
from user.src.notify_admin_new_user import notify_admin_new_user


class AppleRegisterView(APIView):
    """
    Apple Sign-In endpoint.
    
    Reuses GoogleRegister serializer since the user creation flow is identical —
    the only difference is how the identity token is validated.
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
        apple_user_id = apple_data.get("sub")  # Apple's unique user identifier

        if not apple_email and not apple_user_id:
            return Response({"error": "Cannot extract user info from token"}, status=400)

        User = get_user_model()
        
        # Try to find existing user by email or by apple user id stored somewhere
        user = None
        if apple_email:
            user = User.objects.filter(email=apple_email).first()

        if user:
            serializer = GoogleRegister(user)
            return Response(serializer.data, status=200)

        # New user — require invite code
        if "from_invite_code" not in request.data:
            return Response({"error": "invite_code_required"}, status=status.HTTP_400_BAD_REQUEST)

        # Build username from email or Apple sub
        username = request.data.get("username")
        if not username:
            if apple_email:
                username = apple_email.split("@")[0].lower().replace("-", "_").replace("+", "_")
            else:
                username = f"apple_{apple_user_id[:8]}"

        # Apple may provide name on first sign-in only
        email_to_use = apple_email or f"{apple_user_id}@privaterelay.appleid.com"

        serializer = GoogleRegister(data={
            "email": email_to_use,
            "username": username,
            "avatar_url": None,
            "from_invite_code": request.data.get("from_invite_code")
        })
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Update auth_provider to apple
        user.auth_provider = "apple"
        user.save(update_fields=["auth_provider"])
        
        notify_admin_new_user(user)
        return Response(GoogleRegister(user).data, status=status.HTTP_201_CREATED)
