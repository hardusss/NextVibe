from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from user.models import InviteUser


User = get_user_model()

class GetInviteInfoView(APIView):
    """
    This api class
    have a get method which
    returned info about inivte(referral code, and count invited users)
    Args:
        APIView (_type_): A parent class that allows 
        you to make an API method from a class
    """
    
    permission_classes=[IsAuthenticated] # Checking whether the user who sent the request is authorized
    throttle_classes = [ScopedRateThrottle]

    def get(self, request, *args, **kwargs) -> Response:
        user = User.objects.filter(request.user)
        if not user:
            return Response({
                "error": "User not found"
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        invite_data = InviteUser.objects.filter(owner=user).values("invite_code", "invited_count")
        if not invite_data:
            return Response({
                "error": "Something went wrong, please try again"
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            "data": invite_data
        }, status=status.HTTP_200_OK)