from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from user.models import InviteUser
import random

User = get_user_model()


class RecommendedUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            user = User.objects.only("user_id", "follow_for").get(user_id=id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        follow_for = user.follow_for or []

        qs = list(
            User.objects
            .exclude(user_id=user.user_id)
            .exclude(user_id__in=follow_for)
            .select_related("og_avatar")
            .only("user_id", "username", "avatar", "official", "about")
            [:200]  
        )

        random.shuffle(qs)
        recommended_users = qs[:5]

        if len(recommended_users) < 3:
            fallback = list(
                User.objects
                .exclude(user_id=user.user_id)
                .exclude(user_id__in=[u.user_id for u in recommended_users])
                .select_related("og_avatar")
                .only("user_id", "username", "avatar", "official", "about")
                [:50]
            )
            random.shuffle(fallback)
            for u in fallback:
                recommended_users.append(u)
                if len(recommended_users) >= 3:
                    break

        # Bulk InviteUser
        owner_ids = [u.user_id for u in recommended_users]
        invite_counts = {
            inv.owner_id: inv.invited_count
            for inv in InviteUser.objects.filter(owner_id__in=owner_ids)
        }

        data = []
        for u in recommended_users:
            og = getattr(u, 'og_avatar', None)
            data.append({
                "id": u.user_id,
                "username": u.username,
                "avatar": u.avatar.url if u.avatar else None,
                "official": u.official,
                "about": u.about,
                "is_og": og is not None,
                "og_edition": og.edition if og is not None else None,
                "invited_count": invite_counts.get(u.user_id, 0),
            })

        return Response({"recommended_users": data, "follow_for": follow_for}, status=200)