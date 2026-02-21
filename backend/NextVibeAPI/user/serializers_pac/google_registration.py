from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from django.core.files.base import ContentFile
import uuid

User = get_user_model()


class GoogleRegister(serializers.ModelSerializer):
    token = serializers.SerializerMethodField()
    avatar_url = serializers.URLField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("user_id", "email", "username", "token", "avatar", "avatar_url")

    def get_token(self, obj):
        refresh = RefreshToken.for_user(obj)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    def create(self, validated_data):
        avatar_url = validated_data.pop("avatar_url", None)  
        user, created = User.objects.get_or_create(email=validated_data["email"], defaults={"username": validated_data["username"]})

        if created and avatar_url:
            try:
                response = requests.get(avatar_url, timeout=5)
                response.raise_for_status()
                file_name = f"user_{user.user_id}_{uuid.uuid4().hex}.jpg"
                user.avatar.save(file_name, ContentFile(response.content), save=True)
            except requests.RequestException:
                pass

        return user
    