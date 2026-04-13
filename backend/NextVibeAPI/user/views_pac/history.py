from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from ..models import HistorySearch
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle
from user.models import InviteUser

User = get_user_model()


def build_avatar(user):
    if not user.avatar:
        return None
    raw = str(user.avatar)
    return raw if raw.startswith("https://") else f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{raw}"


class HistorySearchView(APIView):
    """
    A class for create and delete user history search
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "search"

    def get(self, request: Request, *args, **kwargs) -> Response:
        user_id = int(request.query_params.get("user"))

        history = (
            HistorySearch.objects
            .filter(user__user_id=user_id)
            .select_related("searched_user", "searched_user__og_avatar")
            .order_by("-id")[:5]
        )

        searched_users = [entry.searched_user for entry in history]

        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(
                owner_id__in=[u.user_id for u in searched_users]
            )
        }

        data = []
        for u in searched_users:
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

    def post(self, request: Request, *args, **kwargs) -> Response:
        user_param = request.query_params.get("user")
        searched_user_param = request.query_params.get("searchedUser")

        if not user_param or not searched_user_param:
            return Response({"error": "Missing required parameters"}, status=400)

        user = get_object_or_404(User, user_id=int(user_param))
        searched_user = get_object_or_404(User, user_id=int(searched_user_param))

        HistorySearch.objects.filter(user=user, searched_user=searched_user).delete()
        HistorySearch.objects.create(user=user, searched_user=searched_user)

        return Response({"data": "Success"}, status=201)

    def delete(self, request: Request, *args, **kwargs) -> Response:
        user_param = request.query_params.get("user")
        searched_user_param = request.query_params.get("searchedUser")

        user = get_object_or_404(User, user_id=int(user_param))
        searched_user = get_object_or_404(User, user_id=int(searched_user_param))

        try:
            HistorySearch.objects.filter(user=user, searched_user=searched_user).delete()
            return Response({"data": "Success"}, status=200)
        except Exception as err:
            return Response({"data": f"Error: {err}"}, status=404)