from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from ..src import TwoFA

User = get_user_model()



class TwoFAView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, *args, **kwargs) -> Response:
        try:
            user = User.objects.get(user_id=request.user.user_id)
            if user.secret_2fa:
                return Response({"data": {"code": user.secret_2fa, "qrcode": f"/media/qrcodes/{user.email}_qrcode.png"}})
            else:
                twoFa = TwoFA()
                secret = twoFa.create_2fa(user.email)
                user.secret_2fa = secret[0]
                user.save()
                return Response({
                                "data": {
                                    "code": secret[0],
                                    "qrcode": secret[1]
                                }
                            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"data": "User doesn't exist"}, status=status.HTTP_404_NOT_FOUND)
        
    def post(self, request, *args, **kwargs) -> Response:
        verify_code: int = int(request.query_params.get("verifyCode"))
        
        try:
            user = User.objects.get(user_id=request.user.user_id)
            twoFa = TwoFA(secret_key=user.secret_2fa)
            if twoFa.auth(verify_code):
                return Response({"data": "Success"}, status=status.HTTP_200_OK)
            else:
                return Response({"data": "Code not correct, try again"})
        except User.DoesNotExist:
            return Response({"data": "User doesn't exist"}, status=status.HTTP_404_NOT_FOUND)
    
    def put(self, request, *args, **kwargs) -> Response:
        user_id = request.user.user_id
        is2FA = True if request.query_params.get("enable").lower() == "true" else False 
        try:
            user = User.objects.get(user_id=user_id)
            user.is2FA = is2FA
            user.save()
            return Response({"data": "Update success"}, status=status.HTTP_200_OK)
        
        except User.DoesNotExist:
            return Response({"data": "User not found"}, status=status.HTTP_400_BAD_REQUEST)