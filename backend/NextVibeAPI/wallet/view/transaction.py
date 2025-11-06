from testnet.wallets.btc.transaction import BtcTransaction
from testnet.wallets.sol.transaction import SolanaTransaction
from testnet.wallets.trx.transaction import TrxTransaction
from testnet.wallets.eth.transaction import EthTransaction

from ..models import UserWallet
from ..src.sorted_transactions import get_all_transactions_sorted
from ..src.wallet_encryption import DecryptAEAD
from ..src.get_tokens_price import get_tokens_prices
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache

from dotenv import load_dotenv
import os
import asyncio, httpx
from .utils import async_clear_cache_later

load_dotenv()

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
        # Clear all related caches
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

        decryptor = DecryptAEAD(key=os.getenv("KEY"))
        try:
            private_key = decryptor.decrypt(
                encrypted_data=sol_wallet.private_key,
                user_id=request.user.user_id,
                token="SOL"
            )
        except: 
            private_key=sol_wallet.private_key
        sol_model = SolanaTransaction()
        
        transaction = sol_model.send_transaction(private_key, to_address, amount)
        async_clear_cache_later(user_id=user.user_id)
        return Response(transaction, status=status.HTTP_200_OK)
    
class EthTrasactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        
        # Get data from the request
        to_address = request.query_params.get("to_address")
        amount = float(request.query_params.get("amount"))
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)
        eth_wallet = wallet.eth_wallet

        decryptor = DecryptAEAD(key=os.getenv("KEY"))
        private_key = decryptor.decrypt(
            encrypted_data=eth_wallet.private_key,
            user_id=request.user.user_id,
            token="ETH"
        )

        eth_transaction = EthTransaction(private_key=f"0x{private_key}", to_address=to_address, value=amount)
        transaction = eth_transaction.send_transaction()
        async_clear_cache_later(user_id=user.user_id)
        return Response(f"https://sepolia.etherscan.io/tx/0x{transaction.get('tx')}", status=status.HTTP_200_OK)
    
class TrxTrasactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        
        # Get data from the request
        to_address = request.query_params.get("to_address")
        amount = float(request.query_params.get("amount"))
        
        user = get_user_model().objects.get(user_id=request.user.user_id)
        wallet = UserWallet.objects.get(user=user)
        trx_wallet = wallet.trx_wallet

        decryptor = DecryptAEAD(key=os.getenv("KEY"))
        try:
            private_key = decryptor.decrypt(
                encrypted_data=trx_wallet.private_key,
                user_id=request.user.user_id,
                token="TRX"
            )
        except: 
            private_key=trx_wallet.private_key

        trx_transaction = TrxTransaction(sender_private_key=private_key, recipient_address=to_address, amount=amount)
        transaction = trx_transaction.send()
        async_clear_cache_later(user_id=user.user_id)
        return Response(transaction, status=status.HTTP_200_OK)
    
class AllTransactionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        user = get_user_model().objects.get(user_id=request.user.user_id)
        sorted_transactions = cache.get(f"transactions_{user.user_id}", None)
        if sorted_transactions:
            return Response(sorted_transactions, status=status.HTTP_200_OK)
        
        wallet = UserWallet.objects.get(user=user)
        eth_wallet = wallet.eth_wallet
        sol_wallet = wallet.sol_wallet
        trx_wallet = wallet.trx_wallet
        
        try:
            sorted_transactions = asyncio.run(
                get_all_transactions_sorted(
                    eth_wallet.address, 
                    sol_wallet.address, 
                    trx_wallet.address
                )
            )
        except httpx.ReadTimeout:
            return Response(
                {"error": "Blockchain RPC timeout"},
                status=status.HTTP_504_GATEWAY_TIMEOUT
            )

        prices = asyncio.run(get_tokens_prices())
        
        data = {
            "transactions": sorted_transactions,
            "prices": {
                "ETH": prices["ethereum"],
                "TRX": prices["tron"],
                "SOL": prices["solana"]
            }
        }
        cache.set(f"transactions_{user.user_id}", data, timeout=45)
        return Response(data, status=status.HTTP_200_OK)