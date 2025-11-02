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


class WalletInitializer(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        try:
            user_wallet = UserWallet.objects.get(user=request.user)
        except UserWallet.DoesNotExist:
            return Response({"error": "User wallet not found"}, status=status.HTTP_404_NOT_FOUND)

        key = os.getenv("KEY")
        encrypt = EncryptAEAD(key=key)

        created_wallets = []

        # === BTC ===
        if not user_wallet.btc_wallet:
            try:
                try:
                    btc = Wallet(f"NextVibeWalletBtc{request.user.user_id}")
                    address = btc.get_key().address
                    btc_wallet = {"address": address, "wallet": f"NextVibeWalletBtc{request.user.user_id}"}
                except Exception:
                    btc = BtcWalletAddressCreate()
                    btc_wallet = btc.create(request.user.user_id)

                btc_wallet_model = BtcWallet.objects.create(
                    address=btc_wallet["address"],
                    wallet_name=btc_wallet["wallet"]
                )
                user_wallet.btc_wallet = btc_wallet_model
                created_wallets.append("BTC")
            except Exception as e:
                print(f"BTC error: {e}")

        # === SOL ===
        if not user_wallet.sol_wallet:
            try:
                sol_wallet = SolWalletAddressCreate().create()
                encrypted_sol_private_key = encrypt.encrypt(
                    private_key=sol_wallet["private_key"],
                    user_id=int(request.user.user_id),
                    token="SOL"
                )
                sol_wallet_model = SolWallet.objects.create(
                    address=sol_wallet["address"],
                    private_key=encrypted_sol_private_key
                )
                user_wallet.sol_wallet = sol_wallet_model
                created_wallets.append("SOL")
            except Exception as e:
                print(f"SOL error: {e}")

        # === TRX ===
        if not user_wallet.trx_wallet:
            try:
                trx_wallet = TrxWalletAddressCreate().create()
                encrypted_trx_private_key = encrypt.encrypt(
                    private_key=trx_wallet["private_key"],
                    user_id=int(request.user.user_id),
                    token="TRX"
                )
                trx_wallet_model = TrxWallet.objects.create(
                    address=trx_wallet["address"],
                    public_key=trx_wallet["public_key"],
                    private_key=encrypted_trx_private_key
                )
                user_wallet.trx_wallet = trx_wallet_model
                created_wallets.append("TRX")
            except Exception as e:
                print(f"TRX error: {e}")

        # === ETH ===
        if not user_wallet.eth_wallet:
            try:
                eth_wallet = EthWalletAddressCreate.create()
                encrypted_eth_private_key = encrypt.encrypt(
                    private_key=eth_wallet["private_key"],
                    user_id=int(request.user.user_id),
                    token="ETH"
                )
                eth_wallet_model = EthWallet.objects.create(
                    address=eth_wallet["address"],
                    private_key=encrypted_eth_private_key
                )
                user_wallet.eth_wallet = eth_wallet_model
                created_wallets.append("ETH")
            except Exception as e:
                print(f"ETH error: {e}")

        user_wallet.save()

        if created_wallets:
            return Response(
                {"created": created_wallets, "message": "Missing wallets created"},
                status=status.HTTP_201_CREATED
            )

        return Response(
            {"message": "All wallets already exist"},
            status=status.HTTP_200_OK
        )
