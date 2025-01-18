from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import UserRegistrationSerializer, UserLoginSerializer, UserDetailSerializer


class RegisterUserView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = UserRegistrationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = serializer.save()
            user_data = UserRegistrationSerializer(user, context={'request': request}).data
            return Response(
                {
                    "message": "User registered successfully.",
                    "user_id": user.user_id,  
                    "data": user_data,
                },
                status=status.HTTP_201_CREATED
            ) 
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class LoginUserView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user_data = UserDetailSerializer(user).data
        return Response(
            {
                "message": "User logged in successfully.",
                "user_id": user.user_id, 
                "data": user_data
            }, 
            status=status.HTTP_200_OK
        )

class LogoutUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        ...

class UserProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]  

    def get(self, request, *args, **kwargs):
        ...
        
class UserUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, *args, **kwargs):
        ...

class UserDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, *args, **kwargs):
        ...