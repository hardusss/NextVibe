from ..src.get_tokens_price import get_tokens_prices
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated

import asyncio, os
from dotenv import load_dotenv
from web3 import Web3, HTTPProvider

load_dotenv()

class GetTransactionFee(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        prices = asyncio.run(get_tokens_prices())  

        token = request.query_params.get("token", "").lower()
        fee_usd = 0
        fee = 0

        match token:
            case "eth":
                w3 = Web3(HTTPProvider(os.getenv("ETH_RPC_LINK")))
                gas_limit = 21000
                gas_price = w3.eth.gas_price  
                fee = gas_price * gas_limit / 10**18  

                fee_usd = fee * prices.get("ethereum", 0)

            case "sol":
                fee = 0.000005
                fee_usd = fee * prices.get("solana", 0)

            case "trx":
                fee = 0.8  
                fee_usd = fee * prices.get("tron", 0)


            case _:
                return Response({"error": "Unsupported token"}, status=400)

        return Response({
                        "fee": f"{fee:.8f}".rstrip("0").rstrip("."),
                        "fee_usd": f"{fee_usd:.6f}".rstrip("0").rstrip(".")
                    })

