from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from posts.models import Reputation

User = get_user_model()


class LinkEmailView(APIView):
    """
    Allows users who signed up via wallet (no email) to link an email address
    and receive 20 reputation points.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile_edit"

    def post(self, request) -> Response:
        user = request.user
        email = request.data.get("email")

        if user.email:
            return Response(
                {"error": "An email address is already linked to this account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not email:
            return Response(
                {"error": "Email address is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        email = email.strip().lower()

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"error": "Invalid email address format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(email=email).exclude(user_id=user.user_id).exists():
            return Response(
                {"error": "This email is already associated with another account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.email = email
        user.save(update_fields=["email"])

        # Grant 20 reputation points for linking email
        rep_granted = False
        if not Reputation.objects.filter(user=user, post_type="link_email_reward").exists():
            Reputation.objects.create(
                user=user,
                given_by=user,
                points=20,
                post_type="link_email_reward"
            )
            rep_granted = True

        return Response({
            "message": "Email linked successfully!",
            "email": user.email,
            "reputation_earned": 20 if rep_granted else 0
        }, status=status.HTTP_200_OK)
