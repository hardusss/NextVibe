from django.urls import path
from .view import (
    CreateWallet, GetBalanceWallet,
    BtcTransactionView, SolTransactionView,
    TrxTrasactionView, AllTransactionsView
    )


urlpatterns = [
    path("create/", CreateWallet.as_view(), name="create_wallet"),
    path("get-balance/", GetBalanceWallet.as_view(), name="balance_wallet"),
    path("transactions/", AllTransactionsView.as_view(), name="all_transactions"),
    path("transaction/btc/", BtcTransactionView.as_view(), name="transaction_btc"),
    path("transaction/sol/", SolTransactionView.as_view(), name="transaction_sol"),
    path("transaction/trx/", TrxTrasactionView.as_view(), name="transaction_trx"),
]
