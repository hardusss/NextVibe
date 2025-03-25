
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..serializers_pac import PostsMediaSerializer

class AddMediaToPostView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs) -> Response:
        post = request.data.get("post", None)
        
        if 'media' not in request.FILES:
            return Response({"error": "No media files provided."}, status=status.HTTP_400_BAD_REQUEST)
        
        media_files = request.FILES.getlist('media')
        for media_file in media_files:
            serializer = PostsMediaSerializer(data={"post": post, "file": media_file})
            if serializer.is_valid():
                serializer.save()
            else:
                
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": "Media files added successfully."}, status=status.HTTP_201_CREATED)
