from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.core.cache import cache
from ..models import User

class GetReaders(APIView):
    def get(self, request: Request) -> Response:
        # Get data request
        user_id = request.query_params.get("user_id") or request.user.user_id
        index = request.query_params.get("index") 
        # Get cache by key
        cache_key = F"readers_{user_id}_page_{index or 0}"
        
        readers = cache.get(cache_key)
        if not readers:
            print("without cache")
            index = int(index) if index else 0
            start = index
            end = index + 12
            
            try:
                # Fetch the user instance by user_id
                user = User.objects.get(user_id=user_id)
            except User.DoesNotExist:
                # Return 404 if user does not exist
                return Response({"error": "User not found"}, status=404)
            
            readers_qs = list(
                User.objects.filter(user_id__in=user.readers)
                .values("avatar", "username", "user_id")
                [start : end]
            )
            cache.set(cache_key, readers_qs, timeout=35)
            # Response
            return Response({"data": readers_qs}, status=200)
        
        else: 
            print("with cache")
            return Response({"data": cache.get(cache_key)}, status=200)