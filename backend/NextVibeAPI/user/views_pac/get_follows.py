from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
from ..models import User
from django.db.models import Case, When

class GetFollows(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        # Get data request
        user_id = request.query_params.get("user_id") or request.user.user_id
        index = int(request.query_params.get("index") or 0)

        # Get cache by key
        cache_key = f"follows{user_id}_page_{index or 0}"

        follows = cache.get(cache_key)
        if follows:
            return Response({"data": follows, "end": False}, status=200)

        start = index
        end = index + 12

        try:
            # Fetch the user instance by user_id
            user = User.objects.get(user_id=user_id)
        except User.DoesNotExist:
            # Return 404 if user does not exist
            return Response({"error": "User not found"}, status=404)

        follows_ids = user.follow_for[::-1]

        if not follows_ids:
            return Response({"data": [], "end": True}, status=200)

        if start >= len(follows_ids):
            return Response({"data": [], "end": True}, status=200)

        # Slice users
        slice_ids = follows_ids[start:end]

        preserved_order = Case(
            *[When(user_id=pk, then=pos) for pos, pk in enumerate(slice_ids)]
        )

        readers_qs = list(
            User.objects.filter(user_id__in=slice_ids)
            .annotate(ordering=preserved_order)
            .order_by("ordering")
            .values("avatar", "username", "user_id")
        )

        is_end = end >= len(follows_ids)

        # Caching
        cache.set(cache_key, readers_qs, timeout=35)

        return Response({"data": readers_qs, "end": is_end}, status=200)
