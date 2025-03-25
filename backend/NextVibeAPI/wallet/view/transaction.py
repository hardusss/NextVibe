from testnet.wallets.btc.transaction import BtcTransaction
from testnet.wallets.sol.transaction import SolanaTransaction
from testnet.wallets.trx.transaction import TrxTransaction


from ..models import UserWallet
from ..src.sorted_transactions import get_all_transactions_sorted

from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated


class BtcTransactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        
        # Get data from the request
        to_address = request.query_params.get("to_address")
        amount = float(request.query_params.get("amount"))
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)
        btc_wallet = wallet.btc_wallet
        btc_transaction = BtcTransaction(sender_wallet_name=btc_wallet.wallet_name, recipient_address=to_address, amount=amount)
        transaction = btc_transaction.send()
        
        return Response(transaction, status=status.HTTP_200_OK)
    
class SolTransactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        
        # Get data from the request
        to_address = request.query_params.get("to_address")
        amount = float(request.query_params.get("amount"))
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)

        sol_wallet = wallet.sol_wallet
        
        keypair = SolanaTransaction.load_keypair_from_hex(sol_wallet.private_key)
        transaction = SolanaTransaction.send_transaction(
            keypair=keypair, recipient_address=to_address, amount_sol=amount
        )

        return Response(transaction, status=status.HTTP_200_OK)
    
class TrxTrasactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        
        # Get data from the request
        to_address = request.query_params.get("to_address")
        amount = float(request.query_params.get("amount"))
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)

        trx_wallet = wallet.trx_wallet
        trx_transaction = TrxTransaction(sender_private_key=trx_wallet.private_key, recipient_address=to_address, amount=amount)
        transaction = trx_transaction.send()

        return Response(transaction, status=status.HTTP_200_OK)
    
class AllTransactionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)
        btc_wallet = wallet.btc_wallet
        sol_wallet = wallet.sol_wallet
        trx_wallet = wallet.trx_wallet
        
        sorted_transactions = get_all_transactions_sorted(btc_wallet.address, sol_wallet.address, trx_wallet.address)
        
        return Response(sorted_transactions, status=status.HTTP_200_OK)