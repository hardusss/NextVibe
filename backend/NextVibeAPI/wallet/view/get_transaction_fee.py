from django.core.cache import cache
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from web3 import Web3
import os
from dotenv import load_dotenv

load_dotenv()

class GetTransactionFee(APIView):
    permission_classes = [IsAuthenticated]

    _w3 = None
    
    @classmethod
    def get_web3(cls):
        if cls._w3 is None:
            cls._w3 = Web3(Web3.HTTPProvider(
                os.getenv("ETH_RPC_LINK"),
                request_kwargs={'timeout': 5}
            ))
        return cls._w3
    
    def get_cached_prices(self):
        cache_key = 'token_prices'
        prices = cache.get(cache_key)
        
        if prices is None:
            from ..src.get_tokens_price import get_tokens_prices
            import asyncio
            
            prices = asyncio.run(get_tokens_prices())
            cache.set(cache_key, prices, 30) 
        
        return prices
    
    def get_cached_gas_price(self, w3):
        cache_key = 'eth_gas_price'
        gas_price = cache.get(cache_key)
        
        if gas_price is None:
            gas_price = w3.eth.gas_price
            cache.set(cache_key, gas_price, 10) 
        
        return gas_price
    
    def get(self, request: Request) -> Response:
        token = request.query_params.get("token", "").lower()
        
        FEE_CONFIG = {
            "sol": {"fee": 0.000005, "price_key": "solana"},
            "trx": {"fee": 0.8, "price_key": "tron"}
        }
        
        if token == "eth":
            try:
                w3 = self.get_web3()
                prices = self.get_cached_prices()
                
                gas_limit = 21000
                gas_price = self.get_cached_gas_price(w3)
                
                fee = gas_price * gas_limit / 10**18
                fee_usd = fee * prices.get("ethereum", 0)
                
            except Exception as e:
                return Response(
                    {"error": f"Failed to fetch ETH fee: {str(e)}"}, 
                    status=500
                )
                
        elif token in FEE_CONFIG:
            config = FEE_CONFIG[token]
            prices = self.get_cached_prices()
            
            fee = config["fee"]
            fee_usd = fee * prices.get(config["price_key"], 0)
            
        else:
            return Response({"error": "Unsupported token"}, status=400)
        
        return Response({
            "fee": f"{fee:.8f}".rstrip("0").rstrip("."),
            "fee_usd": f"{fee_usd:.6f}".rstrip("0").rstrip(".")
        })