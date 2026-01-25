from django.urls import path
from .view import (
    CreateWallet, GetBalanceWallet,
    BtcTransactionView, SolTransactionView,
    TrxTrasactionView, EthTrasactionView,
    AllTransactionsView, WalletInitializer,
    GetTransactionFee, GetLastTransactionView,
    GetTokensPriceView
    )


urlpatterns = [
    path("wallet-init/", WalletInitializer.as_view(), name="wallet_init"),
    path("create/", CreateWallet.as_view(), name="create_wallet"),
    path("get-balance/", GetBalanceWallet.as_view(), name="balance_wallet"),
    path("transactions/", AllTransactionsView.as_view(), name="all_transactions"),
    path("transaction/last/", GetLastTransactionView.as_view(), name="last_transaction"),
    path("transaction/btc/", BtcTransactionView.as_view(), name="transaction_btc"),
    path("transaction/sol/", SolTransactionView.as_view(), name="transaction_sol"),
    path("transaction/trx/", TrxTrasactionView.as_view(), name="transaction_trx"),
    path("transaction/eth/", EthTrasactionView.as_view(), name="transaction_eth"),
    path("fee/", GetTransactionFee.as_view(), name="fee"),
    path("get-tokens-price/", GetTokensPriceView.as_view(), name="get_tokens_price")
]
