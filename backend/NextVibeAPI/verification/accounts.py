"""
Whether an email + password account has confirmed its email, and the token
payload the sign-in endpoints answer with. Google, Apple and wallet accounts
never need a code.
"""
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken

from .models import EmailVerification


def is_email_verified(user) -> bool:
    return bool(user.email) and EmailVerification.objects.filter(user=user, email__iexact=user.email).exists()


def mark_email_verified(user) -> None:
    EmailVerification.objects.update_or_create(user=user, defaults={"email": user.email})


def needs_email_verification(user) -> bool:
    """True while EMAIL_VERIFICATION_REQUIRED is on and this email account hasn't confirmed its email."""
    if not settings.EMAIL_VERIFICATION_REQUIRED or not user.email:
        return False
    if (user.auth_provider or "email") != "email":
        return False
    return not is_email_verified(user)


def session_payload(user) -> dict:
    """Same shape as the login answer."""
    refresh = RefreshToken.for_user(user)
    return {
        "user_id": user.user_id,
        "email": user.email,
        "username": user.username,
        "token": {"refresh": str(refresh), "access": str(refresh.access_token)},
    }
