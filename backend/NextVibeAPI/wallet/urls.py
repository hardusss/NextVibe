from django.urls import path
from .view import (
    GetTransactionFee,
    GetTokensPriceView,
    SolanaRpcProxyView,
    )


urlpatterns = [
    path("fee/", GetTransactionFee.as_view(), name="fee"),
    path("get-tokens-price/", GetTokensPriceView.as_view(), name="get_tokens_price"),
    path("rpc/", SolanaRpcProxyView.as_view(), name="solana_rpc_proxy"),
]
