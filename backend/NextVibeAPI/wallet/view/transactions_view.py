from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from wallet.models import Transaction

class TransactionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet_address = request.user.wallet_address
        if not wallet_address:
            return Response({"error": "User has no wallet"}, status=400)

        try:
            limit = int(request.query_params.get("limit", 20))
            if limit > 100:
                limit = 100
        except ValueError:
            limit = 20

        last_signature = request.query_params.get("lastSignature")

        qs = Transaction.objects.filter(address=wallet_address).order_by('-block_time', '-id')

        if last_signature:
            try:
                last_tx = Transaction.objects.get(address=wallet_address, signature=last_signature)
                # Ensure we only fetch older transactions. Since block_time is ordered descending,
                # we use block_time__lte (less than or equal). We also exclude the exact signature
                # to prevent duplicating the pagination cursor.
                qs = qs.filter(block_time__lte=last_tx.block_time).exclude(signature=last_signature)
            except Transaction.DoesNotExist:
                pass

        transactions = qs[:limit]
        
        data = []
        for tx in transactions:
            if tx.raw_data:
                data.append(tx.raw_data)
        
        return Response(data)
