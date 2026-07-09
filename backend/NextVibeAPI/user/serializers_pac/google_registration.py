from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
import requests
from django.core.files.base import ContentFile
import uuid
from django.db import transaction


User = get_user_model()


class GoogleRegister(serializers.ModelSerializer):
    token = serializers.SerializerMethodField()
    avatar_url = serializers.URLField(write_only=True, required=False, allow_null=True)
    from_invite_code = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        write_only=True
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
        from user.models import InviteUser
        
        avatar_url = validated_data.pop("avatar_url", None)
        invite_code = validated_data.pop("from_invite_code", None)
        
        invite_obj = None
        if invite_code:
            invite_obj = InviteUser.objects.filter(invite_code=invite_code).first()

        user, created = User.objects.get_or_create(
            email=validated_data["email"],
            defaults={
                "username": validated_data["username"],
                "from_invite_code": invite_obj,
                "auth_provider": validated_data.get("auth_provider", "google"),
            },
        )

        if created and invite_obj:
            from django.db.models import F
            invite_obj.invited_count = F('invited_count') + 1
            invite_obj.save(update_fields=['invited_count'])

        if created and avatar_url:
            try:
                response = requests.get(avatar_url, timeout=5)
                response.raise_for_status()
                file_name = f"user_{user.user_id}_{uuid.uuid4().hex}.jpg"
                user.avatar.save(file_name, ContentFile(response.content), save=True)
            except requests.RequestException:
                pass

        return user