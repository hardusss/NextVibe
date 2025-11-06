from ..models import UserWallet
from ..src.sorted_transactions import get_all_transactions_sorted
from ..src.get_tokens_price import get_tokens_prices
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
import asyncio, httpx

TOKENS = {
            "ETH": "ethereum",
            "TRX": "tron",
            "SOL": "solana"
        }

class GetLastTransactionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        user = get_user_model().objects.get(user_id=request.user.user_id)
        
        sorted_transactions = cache.get(f"transactions_last_{user.user_id}", None)
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
                    trx_wallet.address,
                    last=True
                )
            )
        except httpx.ReadTimeout:
            return Response(
                {"error": "Blockchain RPC timeout"},
                status=status.HTTP_504_GATEWAY_TIMEOUT
            )

        if not sorted_transactions:
            return Response(
                {"data": "null"}, 
                status=200
            )


        last_transaction = sorted_transactions[0]
        price = asyncio.run(get_tokens_prices(tokens=[TOKENS[last_transaction.get("blockchain", None)]], last=True))
        
        data = {
            "transaction": last_transaction,
            "prices": price
        }
        cache.set(f"transactions_last_{user.user_id}", data, timeout=10)
        return Response(data, status=status.HTTP_200_OK)