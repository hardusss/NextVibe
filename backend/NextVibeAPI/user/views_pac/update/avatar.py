from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist


class UpdateUserAvatar(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request) -> Response:
        avatar = request.FILES.get('avatar')
        if not avatar:
            return Response({'error': 'No avatar file provided'}, status=400)

        user = request.user
        user.avatar = avatar       
        user.save()
        
        return Response({'message': 'Avatar updated successfully'})
    
    def delete(self, request) -> Response:
        user = request.user
        if user.avatar:
            user.avatar.delete()
            user.avatar = "images/default.png"
            user.save()
        