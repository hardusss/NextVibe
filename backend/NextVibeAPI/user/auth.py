# auth.py
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from user.models import User

class CustomJWTAuthentication(JWTAuthentication):
    """Custom JWT which using all_objects for banned users"""
    
    def authenticate(self, request):
        try:
            # Get raw token from Authorization header
            raw_token = request.META.get('HTTP_AUTHORIZATION', '').split(' ')[-1] if 'HTTP_AUTHORIZATION' in request.META else None
            
            if not raw_token:
                return None
            
            # Decode and validate token
            validated_token = self.get_validated_token(raw_token)
            
            try:
                user = User.all_objects.get(user_id=validated_token['user_id'])
            except User.DoesNotExist:
                raise AuthenticationFailed('User not found')
            
            return (user, validated_token)
        
        except InvalidToken:
            raise AuthenticationFailed('Invalid token')
        except AuthenticationFailed as e:
            raise e
        except Exception as exc:
            raise AuthenticationFailed(f'Authentication failed: {str(exc)}')