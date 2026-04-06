from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from django.core.files.base import ContentFile
import uuid
from django.db import transaction
from django.db.models import F
from user.models import InviteUser 

User = get_user_model()

class GoogleRegister(serializers.ModelSerializer):
    token = serializers.SerializerMethodField()
    avatar_url = serializers.URLField(write_only=True, required=False)
    
    from_invite_code = serializers.SlugRelatedField(
        slug_field='invite_code', 
        queryset=InviteUser.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = User
        fields = ("user_id", "email", "username", "token", "avatar", "avatar_url", "from_invite_code")

    def get_token(self, obj):
        refresh = RefreshToken.for_user(obj)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    @transaction.atomic
    def create(self, validated_data):
        avatar_url = validated_data.pop("avatar_url", None)  
        invite_obj = validated_data.pop("from_invite_code", None)

        defaults = {"username": validated_data["username"]}
        if invite_obj:
            defaults["from_invite_code"] = invite_obj

        user, created = User.objects.get_or_create(
            email=validated_data["email"], 
            defaults=defaults
        )

        if created:
            if avatar_url:
                try:
                    response = requests.get(avatar_url, timeout=5)
                    response.raise_for_status()
                    file_name = f"user_{user.user_id}_{uuid.uuid4().hex}.jpg"
                    user.avatar.save(file_name, ContentFile(response.content), save=True)
                except requests.RequestException:
                    pass

            if invite_obj:
                invite_obj.invited_count = F('invited_count') + 1
                invite_obj.save(update_fields=['invited_count'])

        return user