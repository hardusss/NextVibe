"""This file work with DRF API View. 
Created api point for get crypto tokens price for Coin Gecko api"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from typing import Any, Dict

from wallet.src.tokens_price import get_tokens_prices
from wallet.serializers.tokens_price_serializer import TokensPriceSerializer

class GetTokensPriceView(APIView):
    permission_classes = [AllowAny]

    def post(self, request) -> Response:
        """
        Endpoint to fetch cryptocurrency prices.
        
        Input:
        - tokens (list): IDs of tokens (e.g., ["solana", "bitcoin"])
        - currency (str): Target currency (default: "usd")
        
        Output:
        - prices (dict): Mapping of tokens to {price, change_24h, direction}
        - message (str): Status message
        """
        serializer = TokensPriceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated_data: Dict[str, Any]  = serializer.validated_data # type: ignore

        tokens = validated_data.get("tokens", [])
        currency = validated_data.get("currency", "usd")

        try:
            prices = get_tokens_prices(tokens=tokens, vs_currencies=currency, last=False)
            return Response({
                "prices": prices,
                "message": f"Success get prices for tokens: {tokens}"
            }, status=status.HTTP_200_OK)
        
        except Exception as e:
            print(e)
            return Response({
                "message": f"Service temporarily unavailable"
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

