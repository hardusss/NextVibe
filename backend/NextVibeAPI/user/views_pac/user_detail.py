from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated

from ..serializers_pac import UserDetailSerializer

User = get_user_model()

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, id: int):
        try:
            user = User.objects.get(user_id=id)
            isProfile = request.query_params.get('isProfile')
            serializer = UserDetailSerializer(user)
            is_subscribed = False
            if isProfile == "true":
               owner = User.objects.get(user_id=request.user.user_id)
               if serializer.data["user_id"] in owner.follow_for:
                   is_subscribed = True
               else:
                   is_subscribed = False
            return Response({**serializer.data, "is_subscribed": is_subscribed}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        