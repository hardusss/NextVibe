import os
from uuid import uuid4

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}


class UpdateUserAvatar(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "profile_edit"

    def put(self, request) -> Response:
        avatar = request.FILES.get('avatar')
        if not avatar:
            return Response({'error': 'No avatar file provided'}, status=400)

        user = request.user
        # The app always sends "avatar_<id>.jpg". A unique name per upload
        # means a new avatar always gets a new file name, and the Seeker
        # share card's version is keyed on that name (user/src/seeker_card.py).
        ext = os.path.splitext(avatar.name)[1].lower()
        if ext not in IMAGE_EXTENSIONS:
            ext = ".jpg"
        avatar.name = f"avatar_{user.user_id}_{uuid4().hex[:12]}{ext}"
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
        