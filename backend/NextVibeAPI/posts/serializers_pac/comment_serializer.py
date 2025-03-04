from rest_framework import serializers
from django.contrib.auth import get_user_model
from ..models import Comment, CommentReply

User = get_user_model()

class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ("id", "owner", "post", "content", "create_at", "count_likes")
        model = Comment
    
    def get_owner(self, obj):
        return {
            "user_id": obj.owner.id,
            "username": obj.owner.username,
            "avatar_url": obj.owner.avatar.url if obj.owner.avatar else None
        }
    
    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['owner'] = request.user
        return Comment.objects.create(**validated_data)
    
    def delete(self, instance):
        instance.delete()
        return instance

class CommentReplySerializer(serializers.ModelSerializer):
    
    class Meta:
        fields = ("id", "owner", "comment", "content", "create_at", "count_likes")
        model = CommentReply
    
    def get_owner(self, obj):
        return {
            "user_id": obj.owner.id,
            "username": obj.owner.username,
            "avatar_url": obj.owner.avatar.url if obj.owner.avatar else None
        }
    
    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['owner'] = request.user
        return CommentReply.objects.create(**validated_data)
    
    def delete(self, instance):
        instance.delete()
        return instance