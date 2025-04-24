import requests
from tronpy.keys import to_hex_address, is_base58check_address

def get_trx_transactions(user_address):
    url = f"https://nile.trongrid.io/v1/accounts/{user_address}/transactions?limit=10"
    headers = {
        "accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    }

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return {"status": "error", "message": "Failed to fetch TRX transactions"}

    data = response.json()
    transactions = []

    user_address_hex = to_hex_address(user_address) if is_base58check_address(user_address) else user_address.lower()

    for tx in data.get("data", []):
        contract = tx.get("raw_data", {}).get("contract", [{}])[0]
        value = contract.get("parameter", {}).get("value", {})
        from_address = value.get("owner_address", "").lower()
        to_address = value.get("to_address", "").lower()
        amount = value.get("amount", 0)

        direction = from_address == user_address_hex

        transactions.append({
            "blockchain": "TRX",
            "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208490.png",
            "tx_id": tx.get("txID"),
            "amount": amount / 1_000_000,
            "to_address": to_address,
            "timestamp": tx.get("block_timestamp"),
            "direction":  "outgoing" if direction else "incoming"
        })

    return {
        "status": "success",
        "blockchain": "TRX",
        "address": user_address,
        "total_transactions": len(transactions),
        "transactions": transactions
    }
