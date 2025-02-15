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
        except ObjectDoesNotExist:
            return Response({"error": "User not found"}, status=404)
        
        if follow_id in user.follow_for :
            return Response({"error": "You are already subscribed"}, status=400)
        
        user.follow_for.append(follow_id)
        user.save()

        return Response({"message": "Successfully followed"}, status=200)
