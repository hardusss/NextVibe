from ..serializers_pac import GoogleUserLoginSerializer
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

class GoogleLoginUserView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = GoogleUserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        return Response(                                 
            {
                "message": "User logged in successfully.",
                **serializer.data
            }, 
            status=status.HTTP_200_OK
        )
