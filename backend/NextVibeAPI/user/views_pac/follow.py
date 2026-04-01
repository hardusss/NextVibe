from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.core.cache import cache
from ..models import Notification
from datetime import timedelta
from django.utils import timezone
from user.src.clear_notify_cache import clear_notification_cache

from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

class FollowView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "follow"
    
    def put(self, request, follow_id: int):
        id: int = request.user.user_id
        try:
            user = User.objects.get(user_id=id)
            user2 = User.objects.get(user_id=follow_id)
        except ObjectDoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        if follow_id in user.follow_for:
            # Unfollow
            if id in user2.readers:
                user2.readers.remove(id)
            user2.readers_count = len(user2.readers)
            
            user.follow_for.remove(follow_id)
            user.follows_count = len(user.follow_for)

            user.save()
            user2.save()
        else:
            # Follow
            user.follow_for.append(follow_id)
            user.follows_count = len(user.follow_for)

            user2.readers.append(id)
            user2.readers_count = len(user2.readers)
            
            # Notification logic
            recent = Notification.objects.filter(
                sender=user,
                recipient=user2,
                notification_type='follow',
                created_at__gte=timezone.now() - timedelta(days=1)
            ).first()

            if not recent:
                Notification.objects.create(
                    sender=user,
                    recipient=user2,
                    notification_type='follow',
                    text_preview=f"{user.username} followed you!"
                )

            user.save()
            user2.save()
        
        # Clear cache
        for page in range(5):
            for end in ['True', 'False']:
                cache.delete(f"readers_{follow_id}_page_{page}_end_{end}")
                cache.delete(f"follows_{id}_page_{page}_end_{end}")
        
        return Response({"message": "Success"}, status=200)
