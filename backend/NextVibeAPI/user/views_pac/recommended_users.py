from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

User = get_user_model()

class RecommendedUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            user = User.objects.get(user_id=id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        recommended_users = User.objects.exclude(user_id=user.user_id).order_by("?")[:5]

        data = [
            {"id": u.user_id, "username": u.username, "avatar": str(u.avatar), "official": u.official, "about": u.about}
            for u in recommended_users if u.user_id not in user.follow_for
        ]

        return Response({"recommended_users": data}, status=200)
