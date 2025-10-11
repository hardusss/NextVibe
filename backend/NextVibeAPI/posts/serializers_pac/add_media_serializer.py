from rest_framework import serializers
from ..models import PostsMedia
from cloudinary.uploader import upload

class PostsMediaSerializer(serializers.ModelSerializer):
    media_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PostsMedia
        fields = ['post', 'file', 'media_url']

    def create(self, validated_data):
        file_obj = validated_data.pop('file')
        res = upload(file_obj, resource_type="auto")
        validated_data['file'] = res['secure_url']
        return super().create(validated_data)

    def get_media_url(self, obj):
        return obj.file 
