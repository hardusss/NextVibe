from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
from ..models import User
from django.db.models import Case, When, CharField, Value, F
from django.db.models.functions import Concat
from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle


class GetReaders(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "readers"
    
    def get(self, request: Request) -> Response:
        # Get data request
        user_id = request.query_params.get("user_id") or request.user.user_id
        index = int(request.query_params.get("index") or 0)
        
        start = index
        end = index + 12
        
        try:
            # Fetch the user instance by user_id
            user = User.objects.get(user_id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        if not user.readers:
            return Response({"data": [], "end": True}, status=200)
            
        readers_ids = user.readers[::-1]
        
        if not readers_ids:
            return Response({"data": [], "end": True}, status=200)
            
        if start >= len(readers_ids):
            return Response({"data": [], "end": True}, status=200)

        is_end = end >= len(readers_ids)
        
        cache_key = f"readers_{user_id}_page_{index}_end_{is_end}"
        cached_data = cache.get(cache_key)
        
        if cached_data:
            return Response(cached_data, status=200)
        
        # Slice users
        slice_ids = readers_ids[start:end]
        
        if not slice_ids:
            response_data = {"data": [], "end": True}
            cache.set(cache_key, response_data, timeout=35)
            return Response(response_data, status=200)
        
        preserved_order = Case(
            *[When(user_id=pk, then=pos) for pos, pk in enumerate(slice_ids)]
        )
        
        readers_qs = list(
            User.objects.filter(user_id__in=slice_ids)
            .annotate(
                ordering=preserved_order,
                avatar_url=Concat(
                            Value(f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/"),
                            F('avatar'),
                            output_field=CharField()
                    )
                )
            .order_by("ordering")
            .values("avatar_url", "username", "user_id")
        )
        for reader in readers_qs:
            reader['avatar'] = reader.pop('avatar_url')

        response_data = {"data": readers_qs, "end": is_end}
        
        cache.set(cache_key, response_data, timeout=35)
        return Response(response_data, status=200)