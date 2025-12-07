from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from ..src import TwoFA
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()


class TwoFAView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "2fa"

    def get(self, request, *args, **kwargs) -> Response:
        try:
            user = User.objects.get(user_id=request.user.user_id)
            
            if user.secret_2fa:
                qr_url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/qrcodes/{user.email}_qr_code.png"
                return Response({"data": {"code": user.secret_2fa, "qrcode": qr_url}})
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