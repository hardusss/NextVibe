import requests

def get_sol_transactions(address):
    url = "https://api.devnet.solana.com"
    headers = {"Content-Type": "application/json"}

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address, {"limit": 5}]
    }
    response = requests.post(url, json=payload, headers=headers)

    if response.status_code != 200:
        return {"status": "error", "message": "Failed to fetch SOL transactions"}

    data = response.json()
    signatures = data.get("result", [])

    if not signatures:
        return {"status": "success", "message": "No transactions found", "transactions": []}

    transactions = []

    for sig_data in signatures:
        signature = sig_data.get("signature")

        tx_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [signature, "json"]
        }
        tx_response = requests.post(url, json=tx_payload, headers=headers)
        if tx_response.status_code != 200:
            continue

        tx_data = tx_response.json().get("result")
        if not tx_data:
            continue

        meta = tx_data.get("meta", {})
        transaction = tx_data.get("transaction", {})
        message = transaction.get("message", {})
        account_keys = message.get("accountKeys", [])
        pre_balances = meta.get("preBalances", [])
        post_balances = meta.get("postBalances", [])

        try:
            index = account_keys.index(address)
            amount_change = (post_balances[index] - pre_balances[index]) / 1e9 
            direction = "incoming" if amount_change > 0 else "outgoing"
            amount = abs(amount_change)
        except ValueError:
            amount = None
            direction = "unknown"

        transactions.append({
            "blockchain": "SOL",
            "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208206.png",
            "tx_id": signature,
            "amount": amount,
            "to_address": account_keys[1] if len(account_keys) > 1 else None,
            "timestamp": tx_data.get("blockTime"),
            "direction": direction
        })

    return {
        "status": "success",
        "blockchain": "SOL",
        "address": address,
        "total_transactions": len(transactions),
        "transactions": transactions
    }
