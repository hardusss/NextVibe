from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist

User = get_user_model()

class FollowView(APIView):
    permission_classes = [IsAuthenticated]
    
    def put(self, request, id: int, follow_id: int):
        try:
            user = User.objects.get(user_id=id)
            user2 = User.objects.get(user_id=follow_id)
        except ObjectDoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        # If user subscribed for this user 
        if follow_id in user.follow_for :
            user2.readers_count -= 1
            user2.save()
            user.follows_count -= 1
            user.follow_for.remove(follow_id)
            user.save()
            return Response({"data": "Success"}, status=200)
        
        user.follows_count += 1
        user.follow_for.append(follow_id)
        user2.readers_count += 1
        user2.save()
        if len(user.follow_for) != user.follows_count: 
            user.follows_count = len(user.follow_for)
        user.save()

        return Response({"message": "Successfully followed"}, status=200)
