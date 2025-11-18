from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
from django.core.exceptions import ObjectDoesNotExist
from user.models import User

class CheckStatusView(APIView):
    """Method for checking if the user is banned"""
    permission_classes = [IsAuthenticated]
    CACHE_TIMEOUT = 300
    
    def get(self, request: Request) -> Response:
        user_id = request.user.user_id

        cache_key = f"user_ban_status_{user_id}"
        is_banned = cache.get(cache_key)
        
        if is_banned is None:
            try:
                user = User.all_objects.values_list('is_baned', flat=True).get(user_id=user_id)
                is_banned = user
                cache.set(cache_key, is_banned, self.CACHE_TIMEOUT)
            except ObjectDoesNotExist:
                return Response(
                    {"error": "User not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        
        return Response({"ban": is_banned, "user": user_id}, status=status.HTTP_200_OK)