from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from ..serializers_pac import PostsMediaSerializer
from ..tasks import send_post_for_moderation
from ..models import Post, PostsMedia


class AddMediaToPostView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs) -> Response:
        post_id = request.data.get("post", None)
        
        if not post_id:
            return Response(
                {"error": "Post ID is required."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            post = Post.objects.get(id=post_id)
        except Post.DoesNotExist:
            return Response(
                {"error": "Post not found."}, 
                status=status.HTTP_404_NOT_FOUND
            )

        if post.owner != request.user:
            return Response(
                {"error": "You are not the owner of this post."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        if 'media' not in request.FILES:
            return Response(
                {"error": "No media files provided."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        media_files = request.FILES.getlist('media')
        created_media = []

        for media_file in media_files:
            serializer = PostsMediaSerializer(data={"post": post_id, "file": media_file})
            if serializer.is_valid():
                media_obj = serializer.save()
                created_media.append(serializer.data)
            else:
                for media in created_media:
                    PostsMedia.objects.filter(id=media['id']).delete()
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        post.moderation_status = "pending"
        post.save(update_fields=['moderation_status'])

        send_post_for_moderation.delay(post_id)
        
        return Response({
            "message": "Media files added successfully. Post sent for moderation.",
            "post_id": post_id,
            "moderation_status": "pending"
        }, status=status.HTTP_201_CREATED)