from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from ..serializers_pac import UserDetailSerializer
from posts.models import UserCollection, Reputation
from user.models import InviteUser, OgAvatarMint, Block
from django.db.models import Sum, Q

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

            viewer_id = request.user.user_id
            blocker_ids = set()
            if id != viewer_id:
                blocker_ids = set(
                    Block.objects.filter(
                        Q(blocker_id=viewer_id, blocked_id=id) | Q(blocker_id=id, blocked_id=viewer_id)
                    ).values_list("blocker_id", flat=True)
                )
            is_blocked = viewer_id in blocker_ids
            is_blocked_by = id in blocker_ids

            if is_blocked or is_blocked_by:
                # Only what the blocked-profile state needs: no bio, stats or lists
                return Response(
                    {
                        "user_id": user.user_id,
                        "username": user.username,
                        "avatar": user.avatar.url if user.avatar else None,
                        "is_subscribed": False,
                        "is_blocked": is_blocked,
                        "is_blocked_by": is_blocked_by,
                    },
                    status=status.HTTP_200_OK
                )

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
            # Count reputation
            reputation_count = Reputation.objects.filter(user=user).aggregate(
                total=Sum('points')
            )['total'] or 0

            return Response(
                {
                    **data, 
                    "is_subscribed": is_subscribed, 
                    "is_blocked": False,
                    "is_blocked_by": False,
                    "cnft_count": cnft_count,
                    "invited_count": invited_count,
                    "reputation": reputation_count,
                    **additonal
                }, 
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)