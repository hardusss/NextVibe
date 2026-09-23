from rest_framework import serializers
from ..models import Post

class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = '__all__'
        # Proof of Meet posts are made by the server only (posts/src/meet_photos.py)
        read_only_fields = ('co_author', 'meet_slug')