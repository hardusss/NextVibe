from rest_framework import viewsets
from ..models import Post
from ..serializers_pac import PostSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from rest_framework.throttling import ScopedRateThrottle
from ..tasks import send_post_for_moderation
import h3

User = get_user_model()

class PostViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "post" 
    queryset = Post.objects.all()
    serializer_class = PostSerializer

    def perform_create(self, serializer):
        is_v2 = self.request.query_params.get("v2") == "true"

        extra_data = {
            "owner": self.request.user
        }

        if is_v2:
            coords = self.request.data.get("coords")
            resolution = self.request.data.get("resolution")

            if coords and resolution:
                try:
                    lat, lng = coords
                    h3_index = h3.latlng_to_cell(
                        lat=float(lat),
                        lng=float(lng),
                        res=int(resolution)
                    )
                    extra_data["h3_geo"] = h3_index
                except Exception as ex:
                    print("H3 error:", ex)

        serializer.save(**extra_data)

    @action(detail=True, methods=['post'], url_path='finalize')
    def finalize_creation(self, request, pk=None):
        """
        Client call. when post and all medias uploaded.
        Once start moderation.
        """
        post = self.get_object()
        
        # Check rules
        if post.owner != request.user:
            return Response(
                {"error": "Not your post"}, 
                status=status.HTTP_403_FORBIDDEN
            )

        # Update status
        post.moderation_status = "pending"
        post.save(update_fields=['moderation_status'])
        
        # Start Celery task
        print(f"🚀 Finalize called for post {post.id}. Triggering moderation task.")
        send_post_for_moderation.delay(post.id)
        
        return Response({
            "status": "moderation_started",
            "message": "Post submitted for review"
        })