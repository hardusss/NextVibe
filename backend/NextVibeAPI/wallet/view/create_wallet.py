from testnet.wallets.btc.create import BtcWalletAddressCreate
from testnet.wallets.sol.create import SolWalletAddressCreate
from testnet.wallets.trx.create import TrxWalletAddressCreate
from testnet.wallets.eth.create import EthWalletAddressCreate
from bitcoinlib.wallets import Wallet
from ..src.wallet_encryption import EncryptAEAD

from dotenv import load_dotenv
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
import os

from ..models import (
    BtcWallet, SolWallet,
    TrxWallet, EthWallet,
    UserWallet
)

User = get_user_model()
load_dotenv()


class CreateWallet(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        if UserWallet.objects.filter(user=request.user).exists():
            return Response(
                {"error": "User already has a wallet"},
                status=status.HTTP_400_BAD_REQUEST
            )

        encrypt = EncryptAEAD(key=os.getenv("KEY"))

        # === BTC ===
        try:
            btc = Wallet(f"NextVibeWalletBtc{request.user.user_id}")
            address = btc.get_key().address
            btc_wallet = {"address": address, "wallet": f"NextVibeWalletBtc{request.user.user_id}"}
        except Exception:
            btc = BtcWalletAddressCreate()
            btc_wallet = btc.create(request.user.user_id)

        btc_wallet_model = BtcWallet(
            address=btc_wallet["address"],
            wallet_name=btc_wallet["wallet"]
        )
        btc_wallet_model.save()

        # === SOL ===
        try:
            sol_wallet = SolWalletAddressCreate().create()
        except Exception:
            return Response({"error": "Error creating Solana wallet"}, status=status.HTTP_400_BAD_REQUEST)

        encrypted_sol_private_key = encrypt.encrypt(
            private_key=sol_wallet["private_key"],
            user_id=int(request.user.user_id),
            token="SOL"
        )
        sol_wallet_model = SolWallet(
            address=sol_wallet["address"],
            private_key=encrypted_sol_private_key
        )
        sol_wallet_model.save()

        # === TRX ===
        try:
            trx = TrxWalletAddressCreate()
            trx_wallet = trx.create()
        except Exception:
            return Response({"error": "Error creating TRX wallet"}, status=status.HTTP_400_BAD_REQUEST)

        encrypted_trx_private_key = encrypt.encrypt(
            private_key=trx_wallet["private_key"],
            user_id=int(request.user.user_id),
            token="TRX"
        )
        trx_wallet_model = TrxWallet(
            address=trx_wallet["address"],
            public_key=trx_wallet["public_key"],
            private_key=encrypted_trx_private_key
        )
        trx_wallet_model.save()

        # === ETH ===
        try:
            eth_wallet = EthWalletAddressCreate.create()
        except Exception:
            return Response({"error": "Error creating Ethereum wallet"}, status=status.HTTP_400_BAD_REQUEST)

        encrypted_eth_private_key = encrypt.encrypt(
            private_key=eth_wallet["private_key"],
            user_id=int(request.user.user_id),
            token="ETH"
        )
        eth_wallet_model = EthWallet(
            address=eth_wallet["address"],
            private_key=encrypted_eth_private_key
        )
        eth_wallet_model.save()

        # === USERWALLET ===
        user = User.objects.get(user_id=request.user.user_id)

        UserWallet.objects.create(
            user=user,
            btc_wallet=btc_wallet_model,
            sol_wallet=sol_wallet_model,
            trx_wallet=trx_wallet_model,
            eth_wallet=eth_wallet_model
        )

        return Response({"success": "Wallets created successfully"}, status=status.HTTP_201_CREATED)
