from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from user.models import InviteUser
from django.db import transaction


class UserRegistrationSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True)
    token = serializers.SerializerMethodField()
    from_invite_code = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )

    class Meta:
        fields = ("user_id", "email", "username", "password", "token", "avatar_url", "from_invite_code")
        model = get_user_model()
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': True},
            'username': {'required': True},
        }

    @transaction.atomic
    def create(self, validated_data):
        invite_code = validated_data.pop('from_invite_code', None)

        invite_obj = None
        if invite_code:
            invite_obj = InviteUser.objects.filter(invite_code=invite_code).first()

        user = get_user_model()(
            email=validated_data['email'],
            username=validated_data['username'],
            from_invite_code=invite_obj,
        )
        user.set_password(validated_data['password'])
        user.save()

        if invite_obj:
            invite_obj.invited_count += 1
            invite_obj.save(update_fields=['invited_count'])

        return user

    def get_token(self, obj):
        refresh = RefreshToken.for_user(obj)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if request and obj.avatar:
            return request.build_absolute_uri(obj.avatar.url)
        return None