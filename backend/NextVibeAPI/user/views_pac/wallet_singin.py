import base58
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from user.serializers_pac import UserWalletSignInSerializer

class WalletSignInView(APIView):
    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        signature_list = request.data.get('signature') 
        message = request.data.get('message')
        username = request.data.get('username')

        try:
            pubkey_bytes = base58.b58decode(wallet_address)
            verify_key = VerifyKey(pubkey_bytes)

            signature_bytes = bytes(signature_list)

            verify_key.verify(message.encode('utf-8'), signature_bytes)
            
        except (BadSignatureError, ValueError, TypeError):
            return Response(
                {"error": "Invalid cryptographic signature. Nice try, hacker!"}, 
                status=status.HTTP_401_UNAUTHORIZED
            )


        User = get_user_model()
        user = User.objects.filter(wallet_address=wallet_address).first()

        if user:
            refresh = RefreshToken.for_user(user)
            return Response({
                'token': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
                'user_id': user.user_id,
                'username': user.username
            })
        else:
            serializer = UserWalletSignInSerializer(data={
                "wallet_address": wallet_address,
                "username": username
            })
            if serializer.is_valid():
                user = serializer.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)