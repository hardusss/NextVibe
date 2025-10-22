from .btc_transactions import get_btc_transactions
from .sol_transactions import get_sol_transactions
from .trx_transactions import get_trx_transactions
from datetime import datetime
import asyncio

def parse_timestamp(timestamp):
    if timestamp is None:
        return 0
    try:
        return int(timestamp)
    except (ValueError, TypeError):
        try:
            dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ")
            return int(dt.timestamp())
        except Exception:
            return 0

async def get_all_transactions_sorted(user_btc_address, user_sol_address, user_trx_address):
    btc_transactions, sol_transactions, trx_transactions = await asyncio.gather(
        get_btc_transactions(user_btc_address),
        get_sol_transactions(user_sol_address),
        get_trx_transactions(user_trx_address)
    )

    all_transactions = (
        btc_transactions.get("transactions", [])
        + sol_transactions.get("transactions", [])
        + trx_transactions.get("transactions", [])
    )

    sorted_transactions = sorted(
        all_transactions, key=lambda tx: parse_timestamp(tx.get("timestamp")), reverse=True
    )

    return sorted_transactions
