from rest_framework import serializers
from ..models import PostsMedia

class PostsMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostsMedia
        fields = ['post', 'file']
