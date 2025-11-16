from rest_framework import serializers
from ..models import PostsMedia
from ..tasks import process_media_file  

class PostsMediaSerializer(serializers.ModelSerializer):
    media_url = serializers.SerializerMethodField(read_only=True)
    preview_url = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = PostsMedia
        fields = ['id', 'post', 'file', 'preview', 'media_url', 'preview_url']
        read_only_fields = ['preview']
    
    def create(self, validated_data):
        media = PostsMedia.objects.create(**validated_data)
        
        process_media_file.delay(media.id)
        
        return media
    
    def get_media_url(self, obj):
        if obj.file:
            return obj.file.url
        return None
    
    def get_preview_url(self, obj):
        if obj.preview:
            return obj.preview.url
        return None