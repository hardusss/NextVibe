from testnet.wallets.btc.balance import BtcAddressBalance
from testnet.wallets.sol.balance import SolAddressBalance
from testnet.wallets.trx.balance import TrxAddressBalance
from testnet.wallets.eth.balance import EthAddressBalance

from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache

from ..models import UserWallet
from ..src.get_tokens_price import get_tokens_prices

import asyncio
from functools import partial
from decimal import Decimal
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()

def convert_scientific_to_decimal(x: float) -> str:
    return f"{x:.10f}".rstrip('0').rstrip('.') if x else "0.0"

async def get_all_balances(add_and_tokens: dict):
    loop = asyncio.get_event_loop()
    tasks = []

    for key, Method in add_and_tokens.items():
        if Method == BtcAddressBalance:
            func = partial(Method.get_balance, wallet_name=key)
        else:
            func = partial(Method.get_balance, address=key)
        tasks.append(loop.run_in_executor(None, func))

    balances = await asyncio.gather(*tasks)
    return balances

async def get_balances_and_prices(for_balances):
    prices_task = asyncio.create_task(get_tokens_prices())
    balances_task = asyncio.create_task(get_all_balances(for_balances))
    prices, balances = await asyncio.gather(prices_task, balances_task)
    return prices, balances


class GetBalanceWallet(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "balance"

    def get(self, request) -> Response:
        user = User.objects.get(user_id=request.user.user_id)

        data = cache.get(f"balance_wallet_testnet_{user.user_id}")
        if data:
            return Response(data, status=status.HTTP_200_OK)
        
        wallet = UserWallet.objects.get(user=user)

        sol_wallet = wallet.sol_wallet
        trx_wallet = wallet.trx_wallet
        eth_wallet = wallet.eth_wallet

        for_balances = {
            sol_wallet.address: SolAddressBalance,
            trx_wallet.address: TrxAddressBalance,
            eth_wallet.address: EthAddressBalance
        }

        prices, balances = asyncio.run(get_balances_and_prices(for_balances))
        sol_balance, trx_balance, eth_balance = balances

        sol_usdt = Decimal(str(sol_balance)) * Decimal(str(prices["solana"]))
        trx_usdt = Decimal(str(trx_balance)) * Decimal(str(prices["tron"]))
        eth_usdt = Decimal(str(eth_balance)) * Decimal(str(prices["ethereum"]))

        total = round(eth_usdt + sol_usdt + trx_usdt, 2)
        data = [
            total,
            {
                "eth": {
                    "address": eth_wallet.address,
                    "icon": "https://cdn-icons-png.flaticon.com/512/14446/14446159.png",
                    "amount": convert_scientific_to_decimal(eth_balance),
                    "usdt": eth_usdt,
                    "name": "Ethereum",
                    "symbol": "ETH",
                    "price": prices["ethereum"]
                },
                "sol": {
                    "address": sol_wallet.address,
                    "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208206.png",
                    "amount": convert_scientific_to_decimal(sol_balance),
                    "usdt": sol_usdt,
                    "name": "Solana",
                    "symbol": "SOL",
                    "price": prices["solana"]
                },
                "trx": {
                    "address": trx_wallet.address,
                    "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208490.png",
                    "amount": convert_scientific_to_decimal(trx_balance),
                    "usdt": trx_usdt,
                    "name": "Tron",
                    "symbol": "TRX",
                    "price": prices["tron"]
                },
            }
        ]
        cache.set(f"balance_wallet_testnet_{user.user_id}", data, timeout=30)
        
        return Response(data, status=status.HTTP_200_OK)
