from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle
from django.core.exceptions import ObjectDoesNotExist
from user.models import InviteUser


class GetInviteInfoView(APIView):
    """
    Returns invite info (referral code and invited users count)
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    def get(self, request, *args, **kwargs) -> Response:
        user = request.user

        try:
            invite_data = InviteUser.objects.get(owner=user)
        except ObjectDoesNotExist:
            return Response({
                "error": "Invite data not found"
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "invite_code": invite_data.invite_code,
            "invited_count": invite_data.invited_count,
            "og_avatar": True if user.og_avatar else False
        }, status=status.HTTP_200_OK)