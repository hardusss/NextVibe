from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from ..serializers_pac import UserDetailSerializer
from posts.models import UserCollection
from user.models import InviteUser, OgAvatarMint

User = get_user_model()

BANED_FIELDS = [
    "email",
    "last_login",
    "secret_2fa",
    "is2FA",
    "count_generations_ai",
    "is_staff",
    "is_superuser",
    "is_active",
    "last_activity"
]

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile"
    
    def get(self, request, id: int):
        try:
            user = User.objects.get(user_id=id)
            isProfile = request.query_params.get('isProfile')

            # Count cNFTs posts and og
            cnft_count = UserCollection.objects.filter(user=user, post__is_ai_generated=False).count() + OgAvatarMint.objects.filter(user=user).count()

            # Get count invited
            try:
                invite_data = InviteUser.objects.get(owner=user)
                invited_count = invite_data.invited_count
            except InviteUser.DoesNotExist:
                invited_count = 0

            serializer = UserDetailSerializer(user)
            data = serializer.data.copy()

            is_subscribed = False
            if isProfile == "true":
                owner = User.objects.get(user_id=request.user.user_id)
                if data["user_id"] in owner.follow_for:
                   is_subscribed = True

            if id != request.user.user_id:
                for banned_field in BANED_FIELDS:
                    data.pop(banned_field, None)

            og_mint = getattr(user, "og_avatar", None)
            additonal = {}
            if og_mint is not None:
                additonal = {
                    "isOg": True,
                    "edition": og_mint.edition,
                }
            return Response(
                {
                    **data, 
                    "is_subscribed": is_subscribed, 
                    "cnft_count": cnft_count,
                    "invited_count": invited_count,
                    **additonal
                    
                    
                }, 
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)