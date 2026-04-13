from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle
from user.models import InviteUser

User = get_user_model()


class SearchUsersView(APIView):
    """
    Search by username
    This class for search users
    which usernames includes some text
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "search"

    def get(self, request, *args, **kwargs) -> Response:
        search_name = request.query_params.get("searchName", "").strip()

        if not search_name:
            return Response({"data": []}, status=200)

        users = list(
            User.objects
            .filter(username__icontains=search_name)
            .select_related("og_avatar")
            .only("user_id", "username", "avatar", "official", "readers_count")
            [:50]
        )

        if not users:
            return Response({"data": f"Users doesn't exist with username {search_name}"})

        owner_ids = [u.user_id for u in users]
        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(owner_id__in=owner_ids)
        }

        def build_avatar(u):
            if not u.avatar:
                return None
            raw = str(u.avatar)
            if raw.startswith("https://"):
                return raw
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{raw}"

        data = []
        for u in users:
            og = getattr(u, "og_avatar", None)
            data.append({
                "user_id": u.user_id,
                "username": u.username,
                "avatar": build_avatar(u),
                "official": u.official,
                "readers_count": u.readers_count,
                "is_og": og is not None,
                "og_edition": og.edition if og is not None else None,
                "invited_count": invite_counts.get(u.user_id, 0),
            })

        return Response({"data": data}, status=200)