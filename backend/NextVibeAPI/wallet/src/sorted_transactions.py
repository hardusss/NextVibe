from .btc_transactions import get_btc_transactions
from .sol_transactions import get_sol_transactions
from .trx_transactions import get_trx_transactions
from datetime import datetime


def parse_timestamp(timestamp):
    try:
        return int(timestamp)
    except ValueError:
        dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ")
        return int(dt.timestamp())
    
def get_all_transactions_sorted(user_btc_address, user_sol_address, user_trx_address):
    btc_transactions = get_btc_transactions(user_btc_address)  
    sol_transactions = get_sol_transactions(user_sol_address)  
    trx_transactions = get_trx_transactions(user_trx_address)

    all_transactions = btc_transactions["transactions"] + sol_transactions["transactions"]  + trx_transactions["transactions"] 

    sorted_transactions = sorted(all_transactions, key=lambda tx: parse_timestamp(tx['timestamp']), reverse=True)

    return sorted_transactions
