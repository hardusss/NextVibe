"""
Email codes over the API (all under /api/v1/users/):

- email/send-code/  {email, password}               a new code to confirm the email
- email/verify/     {email, password, code}          confirms it; answers like login
- password/forgot/  {email}                          a password reset code, if an account has the email
- password/reset/   {email, code, newPassword}       sets the password; answers like login

Login and registration answer `verification_required` instead of tokens while
EMAIL_VERIFICATION_REQUIRED is on and the email isn't confirmed.
"""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from user.src.sessions import revoke_refresh_tokens

from .accounts import is_email_verified, mark_email_verified, session_payload
from .email_codes import (
    INVALID_CODE, MESSAGES, RESET, SEND_FAILED, VERIFY, check_code, send_code,
)

User = get_user_model()

WRONG_CREDENTIALS = "Invalid email or password."
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def _text(request, field) -> str:
    value = request.data.get(field) if hasattr(request.data, "get") else None
    return value if isinstance(value, str) else ""


def _account_for_login(request):
    """The account for {email, password}, checked the way login checks it, or None."""
    email, password = _text(request, "email").strip(), _text(request, "password")
    if not email or not password:
        return None
    user = User.all_objects.filter(email=email).first()
    return user if user and user.check_password(password) else None


def _account_for_email(email: str):
    return User.objects.filter(email__iexact=email).exclude(auth_provider="deleted").first()


def send_result(error: str | None, retry_in: int) -> Response:
    if error == SEND_FAILED:
        return Response({"code": error, "error": MESSAGES[error]}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if error:
        return Response({"code": error, "error": MESSAGES[error], "retryIn": retry_in},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)
    return Response({"sent": True, "resendIn": retry_in})


def verification_required(user, status_code: int, **extra) -> Response:
    """Sends a confirmation code (unless one just went out) and says a code is needed."""
    error, retry_in = send_code(VERIFY, user.email, user.email)
    body = {
        "code": "EMAIL_NOT_VERIFIED",
        "verification_required": True,
        "email": user.email,
        "error": "Enter the code we sent to your email.",
        "resendIn": retry_in,
        **extra,
    }
    if error and error != "COOLDOWN":
        body["sendError"] = MESSAGES[error]
    return Response(body, status=status_code)


class SendEmailCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_code"

    def post(self, request):
        user = _account_for_login(request)
        if not user:
            return Response({"error": WRONG_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)
        if is_email_verified(user):
            return Response({"sent": False, "verified": True})
        return send_result(*send_code(VERIFY, user.email, user.email))


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_code_check"

    def post(self, request):
        user = _account_for_login(request)
        if not user:
            return Response({"error": WRONG_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)
        error = check_code(VERIFY, user.email, request.data.get("code"))
        if error:
            return Response({"code": error, "error": MESSAGES[error]}, status=status.HTTP_400_BAD_REQUEST)
        mark_email_verified(user)
        return Response({"message": "Email confirmed.", **session_payload(user)})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_code"

    def post(self, request):
        email = _text(request, "email").strip()
        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "Enter a valid email."}, status=status.HTTP_400_BAD_REQUEST)
        user = _account_for_email(email)
        # The same answer whether or not an account has this email
        return send_result(*send_code(RESET, email, user.email if user else None))


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_code_check"

    def post(self, request):
        email = _text(request, "email").strip()
        new_password = _text(request, "newPassword")
        if len(new_password) < MIN_PASSWORD_LENGTH:
            return Response({"code": "WEAK_PASSWORD", "error": f"Use at least {MIN_PASSWORD_LENGTH} characters."},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) > MAX_PASSWORD_LENGTH:
            return Response({"code": "WEAK_PASSWORD", "error": f"Use at most {MAX_PASSWORD_LENGTH} characters."},
                            status=status.HTTP_400_BAD_REQUEST)
        user = _account_for_email(email) if email else None
        error = check_code(RESET, email, request.data.get("code")) if email else INVALID_CODE
        if error or not user:
            error = error or INVALID_CODE
            return Response({"code": error, "error": MESSAGES[error]}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        # Every device signed in with the old password has to sign in again; this one gets new tokens
        revoke_refresh_tokens(user)
        # The code reached their inbox, so the email is confirmed too
        mark_email_verified(user)
        return Response({"message": "Password updated.", **session_payload(user)})
