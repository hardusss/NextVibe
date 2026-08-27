import logging
import base58
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from user.serializers_pac import UserWalletSignInSerializer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

class WalletSignInView(APIView):
    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        signature_list = request.data.get('signature')
        message = request.data.get('message')
        username = request.data.get('username')
        is_lazorkit = request.data.get('is_lazorkit', False)

        logger.info(
            "Wallet sign-in request received: address=%s, is_lazorkit=%s, username=%s",
            wallet_address,
            is_lazorkit,
            username,
        )

        if not is_lazorkit:
            try:
                pubkey_bytes = base58.b58decode(wallet_address)
                verify_key = VerifyKey(pubkey_bytes)

                signature_bytes = bytes(signature_list)

                verify_key.verify(message.encode('utf-8'), signature_bytes)

            except (BadSignatureError, ValueError, TypeError) as e:
                logger.warning(
                    "Invalid cryptographic signature for address=%s, error=%s",
                    wallet_address,
                    e,
                )
                return Response(
                    {"error": "Invalid cryptographic signature. Nice try, hacker!"},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        User = get_user_model()
        user = User.objects.filter(wallet_address=wallet_address).first()

        if user:
            refresh = RefreshToken.for_user(user)
            logger.info(
                "Wallet sign-in successful for existing user: user_id=%s, address=%s",
                user.user_id,
                wallet_address,
            )
            return Response({
                'token': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
                'user_id': user.user_id,
                'username': user.username
            })
        else:
            if "from_invite_code" not in request.data:
                logger.info(
                    "New wallet address %s requires invite code to register",
                    wallet_address,
                )
                return Response({"error": "invite_code_required"}, status=status.HTTP_400_BAD_REQUEST)

            invite_code = request.data.get("from_invite_code")
            logger.info(
                "Attempting registration with invite code for address=%s, code=%s",
                wallet_address,
                invite_code,
            )
            serializer = UserWalletSignInSerializer(data={
                "wallet_address": wallet_address,
                "username": username,
                "from_invite_code": invite_code
            })
            if serializer.is_valid():
                user = serializer.save()
                logger.info(
                    "Successfully registered new user via wallet: user_id=%s, address=%s",
                    user.user_id,
                    wallet_address,
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)

            logger.warning(
                "Failed to register user via wallet for address=%s: %s",
                wallet_address,
                serializer.errors,
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)