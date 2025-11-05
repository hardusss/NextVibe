import asyncio
import httpx
from typing import List, Dict

async def get_sol_transactions(address: str, last: bool = False) -> Dict:
    url = "https://api.devnet.solana.com"
    headers = {"Content-Type": "application/json"}

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address]
    }
    if last:
        payload["params"].append({"limit": 1})

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            return {"status": "error", "message": "Failed to fetch SOL transactions"}

        data = response.json()
        signatures: List = data.get("result", [])
        if not signatures:
            return {"status": "success", "message": "No transactions found", "transactions": []}

        async def fetch_tx(signature: str):
            tx_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTransaction",
                "params": [signature, "json"]
            }
            tx_response = await client.post(url, json=tx_payload, headers=headers)
            if tx_response.status_code != 200:
                return None
            tx_data = tx_response.json().get("result")
            if not tx_data:
                return None

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

            return {
                "blockchain": "SOL",
                "icon": "https://cdn-icons-png.flaticon.com/512/15208/15208206.png",
                "tx_id": signature,
                "amount": amount,
                "to_address": account_keys[1] if len(account_keys) > 1 else None,
                "timestamp": tx_data.get("blockTime"),
                "direction": direction
            }

        transactions = await asyncio.gather(
            *[fetch_tx(sig["signature"]) for sig in signatures]
        )

        transactions = [tx for tx in transactions if tx]

        return {
            "status": "success",
            "blockchain": "SOL",
            "address": address,
            "total_transactions": len(transactions),
            "transactions": transactions
        }
