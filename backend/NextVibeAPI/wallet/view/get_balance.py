from testnet.wallets.btc.balance import BtcAddressBalance
from testnet.wallets.sol.balance import SolAddressBalance
from testnet.wallets.trx.balance import TrxAddressBalance

from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import UserWallet

from ..src.get_tokens_price import get_tokens_prices


User = get_user_model()

def convert_scientific_to_decimal(scientific_number):
    try:
        if scientific_number == 0.0:
            return "0.0"
        decimal_number = float(scientific_number) 
        return f"{decimal_number:.10f}".rstrip('0').rstrip('.')
    except ValueError:
        return scientific_number
    
class GetBalanceWallet(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        user = User.objects.get(user_id=request.user.user_id) 
        wallet = UserWallet.objects.get(user=user)

        btc_wallet = wallet.btc_wallet
        sol_wallet = wallet.sol_wallet
        trx_wallet = wallet.trx_wallet

        btc_balance = BtcAddressBalance.get_balance(btc_wallet.wallet_name)
        sol_balance = SolAddressBalance.get_balance(address=sol_wallet.address)
        trx_balance = TrxAddressBalance.get_balance(address=trx_wallet.address)

        prices = get_tokens_prices()
        btc_usdt = btc_balance * prices["bitcoin"]
        sol_usdt = sol_balance * prices["solana"]
        trx_usdt = trx_balance * prices["tron"]
        
        total = round(btc_usdt + sol_usdt + trx_usdt, 2)
        data = [
                total,
                {
                    "btc": {
                        "address": btc_wallet.address,
                        "icon": "https://cdn-icons-png.flaticon.com/512/5968/5968260.png",
                        "amount": convert_scientific_to_decimal(btc_balance),
                        "usdt": btc_usdt,
                        "name": "Bitcoin",
                        "symbol": "BTC",
                        "price": prices["bitcoin"]
                    },
                    "sol": {
                        "address": sol_wallet.address,
                        "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208206.png",
                        "amount": convert_scientific_to_decimal(sol_balance),
                        "usdt": sol_usdt,
                        "name": "Solana",
                        "symbol": "SOL",
                        "price": prices["solana"]
                    },
                    "trx": {
                        "address": trx_wallet.address,
                        "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208490.png",
                        "amount": convert_scientific_to_decimal(trx_balance),
                        "usdt": trx_usdt,
                        "name": "Tron",
                        "symbol": "TRX",
                        "price": prices["tron"]
                    },
                }
            ]
        return Response(data, status=status.HTTP_200_OK)
        
        
