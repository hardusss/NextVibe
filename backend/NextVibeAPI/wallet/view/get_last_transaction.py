from ..models import UserWallet
from ..src.sorted_transactions import get_all_transactions_sorted
from ..src.get_tokens_price import get_tokens_prices
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
import asyncio

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
        del sorted_transactions
        
        wallet = UserWallet.objects.get(user=user)
        eth_wallet = wallet.eth_wallet
        sol_wallet = wallet.sol_wallet
        trx_wallet = wallet.trx_wallet
        
        sorted_transactions = asyncio.run(
            get_all_transactions_sorted(
                eth_wallet.address, 
                sol_wallet.address, 
                trx_wallet.address,
                last=True
            )
        )
        if not sorted_transactions:
            return Response(
                {"status": "error", "message": "No transactions found"}, 
                status=status.HTTP_404_NOT_FOUND
            )


        last_transaction = sorted_transactions[0]
        price = asyncio.run(get_tokens_prices(tokens=[TOKENS[last_transaction.get("blockchain", None)]]))
        
        data = {
            "transaction": last_transaction,
            "prices": price
        }
        cache.set(f"transactions_last_{user.user_id}", data, timeout=45)
        return Response(data, status=status.HTTP_200_OK)