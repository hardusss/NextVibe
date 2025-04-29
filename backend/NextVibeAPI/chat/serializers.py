from rest_framework import serializers
from .models import Chat, Message, MediaAttachment
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['user_id', 'username', 'avatar', 'is_online']

class MediaAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAttachment
        fields = ['id', 'file_url', 'caption', 'media_type']

class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    media = MediaAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'sender', 'text', 'created_at', 'is_read', 'media']

class ChatSerializer(serializers.ModelSerializer):
    participants = UserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 'participants', 'last_message', 'unread_count']

    def get_last_message(self, obj):
        last_message = obj.messages.order_by('-created_at').first()
        if last_message:
            return MessageSerializer(last_message).data
        return None
