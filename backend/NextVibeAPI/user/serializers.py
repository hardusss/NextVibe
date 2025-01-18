from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken


class UserRegistrationSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True)

    class Meta:
        fields = "__all__"
        model = get_user_model()
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': True},
            'username': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': False},
        }
        
    def create(self, validated_data):
        user = get_user_model()(
            email=validated_data['email'],
            username=validated_data['username'],
            first_name=validated_data['first_name'],
            last_name=validated_data.get('last_name', ""),
        )
        user.set_password(validated_data['password'])  # Hash password
        user.save()
        return user
    
    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if request and obj.avatar:  
            return request.build_absolute_uri(obj.avatar.url)
        return None
    
class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    password = serializers.CharField(write_only=True)
    User = get_user_model()
        
    def validate(self, attrs):
        username = attrs.get('username')
        email = attrs.get('email')
        password = attrs.get('password')

        if not (username or email):
            raise serializers.ValidationError("Need username or email")

        user = None
        if email:
            user = self.User.objects.filter(email=email).first()
        elif username:
            user = self.User.objects.filter(username=username).first()

        if not user:
            raise serializers.ValidationError("User with this username or email does not exist")

        # Check password
        if not user.check_password(password):
            raise serializers.ValidationError("Password is incorrect")

        # Save user in attrs
        attrs['user'] = user
        return attrs

class UserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = "__all__"

