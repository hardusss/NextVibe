from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken



class UserRegistrationSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True)
    token = serializers.SerializerMethodField()
    class Meta:
        fields = ("user_id", "email", "username", "password", "token", "avatar_url")
        model = get_user_model()
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': True},
            'username': {'required': True},
        }
        
    def create(self, validated_data):
        user = get_user_model()(
            email=validated_data['email'],
            username=validated_data['username'],
        )
        user.set_password(validated_data['password'])  # Hash password
        user.save()
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
    