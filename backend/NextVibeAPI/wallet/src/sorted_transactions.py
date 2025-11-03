from .sol_transactions import get_sol_transactions
from .trx_transactions import get_trx_transactions
from .eth_transactions import get_eth_transactions
from datetime import datetime
import asyncio

def parse_timestamp(timestamp):
    if timestamp is None:
        return 0
    try:
        ts = int(timestamp)
        if ts > 10**12:
            ts = ts / 1000
        return ts
    except (ValueError, TypeError):
        try:
            dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ")
            return int(dt.timestamp())
        except Exception:
            return 0

async def get_all_transactions_sorted(user_eth_address, user_sol_address, user_trx_address, last: bool = False):
    eth_transactions, sol_transactions, trx_transactions = await asyncio.gather(
        get_eth_transactions(user_eth_address, last=last),
        get_sol_transactions(user_sol_address, last=last),
        get_trx_transactions(user_trx_address, last=last)
    )
    all_transactions = (
        eth_transactions.get("transactions", [])
        + sol_transactions.get("transactions", [])
        + trx_transactions.get("transactions", [])
    )

    sorted_transactions = sorted(
        all_transactions, key=lambda tx: parse_timestamp(tx.get("timestamp")), reverse=True
    )
    return sorted_transactions
