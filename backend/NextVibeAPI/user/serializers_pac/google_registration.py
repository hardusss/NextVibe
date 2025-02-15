from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from django.core.files.base import ContentFile

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
        user = User.objects.create_user(username=validated_data["username"], email=validated_data["email"])

        if avatar_url:
            response = requests.get(avatar_url)
            if response.status_code == 200:
                file_name = f"user_{user.user_id}.jpg"
                user.avatar.save(file_name, ContentFile(response.content), save=True)

        return user
    