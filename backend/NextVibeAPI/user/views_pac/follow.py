from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.core.cache import cache

User = get_user_model()

class FollowView(APIView):
    permission_classes = [IsAuthenticated]
    
    def put(self, request, id: int, follow_id: int):
        try:
            user = User.objects.get(user_id=id)
            user2 = User.objects.get(user_id=follow_id)
        except ObjectDoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        # If user already subscribed to this user (unfollow)
        if follow_id in user.follow_for:
            user2.readers_count -= 1
            user2.readers.remove(id)
            user2.save()
            
            user.follows_count -= 1
            user.follow_for.remove(follow_id)
            user.save()
        else:
            # Follow user
            user.follows_count += 1
            user.follow_for.append(follow_id)
            
            user2.readers_count += 1
            try:
                user2.readers.append(id)
            except:
                user2.readers = [id]
            
            user2.save()
            
            # Ensure consistency
            if len(user.follow_for) != user.follows_count: 
                user.follows_count = len(user.follow_for)
            user.save()
        
        # Clear cache - just delete first few pages, that's usually enough
        for page in range(5):  # Clear first 5 pages
            for end in ['True', 'False']:
                cache.delete(f"readers_{follow_id}_page_{page}_end_{end}")
                cache.delete(f"follows_{id}_page_{page}_end_{end}")
        
        return Response({"message": "Success"}, status=200)