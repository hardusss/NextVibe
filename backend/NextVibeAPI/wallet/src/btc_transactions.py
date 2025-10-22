import httpx
from typing import List, Dict

async def get_btc_transactions(address: str) -> Dict:
    url = f"https://api.blockcypher.com/v1/btc/test3/addrs/{address}?limit=10"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url)

        if response.status_code != 200:
            return {"status": "error", "message": "Failed to fetch BTC transactions"}

        data = response.json()
        txs: List = data.get("txrefs", [])

        transactions: List[Dict] = []
        for tx in txs:
            transactions.append({
                "blockchain": "BTC",
                "icon": "https://cdn-icons-png.flaticon.com/512/5968/5968260.png",
                "tx_id": tx.get("tx_hash"),
                "amount": f"{(tx.get('value', 0) / 1e8):.8f}".rstrip('0').rstrip('.'),
                "to_address": address,
                "timestamp": tx.get("confirmed"),
                "direction": "incoming" if tx['tx_input_n'] == -1 else "outgoing",
            })

        return {
            "status": "success",
            "blockchain": "BTC",
            "address": address,
            "total_transactions": len(transactions),
            "transactions": transactions
        }
