from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle


class UpdateUserAvatar(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile_edit"

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
        
            return Response({'message': 'Avatar updated successfully'})
        else:
            return Response({'error': 'No avatar file provided'}, status=400)
        