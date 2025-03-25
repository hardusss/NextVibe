from testnet.wallets.btc.create import BtcWalletAddressCreate
from testnet.wallets.sol.create import SolWalletAddressCreate
from testnet.wallets.trx.create import TrxWalletAddressCreate
from bitcoinlib.wallets import Wallet

from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import (
    BtcWallet, SolWallet,
    TrxWallet, UserWallet
    )

User = get_user_model()


class CreateWallet(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request) -> Response:
        # Check if user already has a wallet
        if UserWallet.objects.filter(user=request.user).exists():
            return Response(
                {"error": "User already has a wallet"}, 
            )
        
        try:
            btc = Wallet(f"NextVibeWalletBtc{request.user.user_id}")
            address = btc.get_key().address
            btc_wallet = {"address": address, "wallet": f"NextVibeWalletBtc{request.user.user_id}"}
        except:
            btc = BtcWalletAddressCreate()
            btc_wallet = btc.create(request.user.user_id)
        try:
            sol_wallet = SolWalletAddressCreate().create()
        except:
            return Response({"error": "Error create sol wallet, try again"}, status=status.HTTP_400_BAD_REQUEST) 
        
        try:
            trx = TrxWalletAddressCreate()
            trx_wallet = trx.create()
        except:
            return Response({"error": "Error create trx wallet, try again"}) 
        btc_wallet_model = BtcWallet(address=btc_wallet["address"], wallet_name=btc_wallet["wallet"])
        btc_wallet_model.save()
        
        sol_wallet_model = SolWallet(address=sol_wallet["address"], private_key=sol_wallet["private_key"])
        sol_wallet_model.save()
        
        trx_wallet_model = TrxWallet(address=trx_wallet["address"], public_key=trx_wallet["public_key"], private_key=trx_wallet["private_key"])
        trx_wallet_model.save()
        
        user = User.objects.get(user_id=request.user.user_id)
        
        UserWallet(user=user, btc_wallet=btc_wallet_model, sol_wallet=sol_wallet_model, trx_wallet=trx_wallet_model).save()
        
        return Response({"success": "Wallets created successfully"}, status=status.HTTP_201_CREATED)