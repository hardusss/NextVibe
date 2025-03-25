from rest_framework import viewsets
from ..models import Post
from ..serializers_pac import PostSerializer
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

User = get_user_model()

class PostViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Post.objects.all()
    serializer_class = PostSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
        user = User.objects.get(user_id=self.request.user.user_id)
        user.post_count += 1
        user.save()
