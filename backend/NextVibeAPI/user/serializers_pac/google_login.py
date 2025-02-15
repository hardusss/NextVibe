from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken


class GoogleUserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    token = serializers.SerializerMethodField()

    User = get_user_model()

    def validate(self, attrs):
        email = attrs.get('email')

        user = self.User.objects.filter(email=email).first()

        if not user:
            raise serializers.ValidationError("User with this email does not exist")

        attrs['user'] = user
        return attrs

    def get_token(self, obj):
        user = obj['user']
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    def to_representation(self, instance):
        user = instance['user']
        return {
            "user_id": user.user_id,
            "email": user.email,
            "username": user.username,
            "token": self.get_token(instance)
        }
        

