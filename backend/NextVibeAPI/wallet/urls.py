from django.urls import path
from .view import (
    GetTransactionFee,
    GetTokensPriceView,
    SolanaRpcProxyView,
    TransactionsView,
    LoadMoreTransactionsView,
    WebhookNotifyView,
    RefreshTransactionsView,
)


urlpatterns = [
    path("fee/", GetTransactionFee.as_view(), name="fee"),
    path("get-tokens-price/", GetTokensPriceView.as_view(), name="get_tokens_price"),
    path("rpc/", SolanaRpcProxyView.as_view(), name="solana_rpc_proxy"),
    path("transactions/", TransactionsView.as_view(), name="transactions"),
    path("transactions/load-more/", LoadMoreTransactionsView.as_view(), name="transactions_load_more"),
    path("transactions/refresh/", RefreshTransactionsView.as_view(), name="transactions_refresh"),
    path("webhook-notify/", WebhookNotifyView.as_view(), name="webhook_notify"),
]
