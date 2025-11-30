from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db.models import Q
import random

User = get_user_model()

class RecommendedUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            user = User.objects.get(user_id=id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        qs = User.objects.exclude(user_id=user.user_id).only("user_id", "username", "avatar", "official", "about")
        not_followed = [u for u in qs if u.user_id not in user.follow_for]

        random.shuffle(not_followed)
        recommended_users = not_followed[:5]

        if len(recommended_users) < 3:
            all_users = [u for u in qs if u.user_id != user.user_id]
            random.shuffle(all_users)
            for u in all_users:
                if u not in recommended_users:
                    recommended_users.append(u)
                if len(recommended_users) >= 3:
                    break

        data = [
            {
                "id": u.user_id,
                "username": u.username,
                "avatar": u.avatar.url if u.avatar else None,
                "official": u.official,
                "about": u.about
            }
            for u in recommended_users
        ]

        return Response({"recommended_users": data, "follow_for": user.follow_for}, status=200)
