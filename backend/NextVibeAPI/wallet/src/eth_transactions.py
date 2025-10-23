import httpx
from typing import List, Dict
from dotenv import load_dotenv
from os import getenv
import asyncio
load_dotenv()

ETHERSCAN_API_KEY = getenv("ETHERSCAN_API_TOKEN")

# Ми більше не визначаємо ETHERSCAN_API_URL тут,
# оскільки він буде динамічно створюватися всередині функції.

async def get_eth_transactions(address: str, start_block: int = 0, end_block: int = 99999999) -> Dict:
    
    if not ETHERSCAN_API_KEY:
        return {"status": "error", "message": "ETHERSCAN_API_TOKEN not found in .env"}

    # 1. ВИПРАВЛЕНО: URL тепер будується динамічно з адресою в шляху.
    # Зверни увагу на 'accounts' (у множині)
    api_url = f"https://api-sepolia.etherscan.io/api/v2/accounts/txlist/{address}"

    # 2. ВИПРАВЛЕНО: 'address' видалено з параметрів (бо він у URL).
    # 'tag' також видалено, оскільки він не використовується в цьому V2 ендпоінті.
    params = {
        "chainid": 11155111,
        "startblock": start_block,
        "endblock": end_block,
        "apikey": ETHERSCAN_API_KEY
        # "sort": "asc" # Можна додати для сортування (необов'язково)
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # 3. ВИПРАВЛЕНО: Використовуємо 'api_url' замість 'ETHERSCAN_API_URL'
            response = await client.get(api_url, params=params)

            if response.status_code != 200:
                return {
                    "status": "error", 
                    "message": f"HTTP Error: {response.status_code}", 
                    "response": response.text
                }

            data = response.json()
            
            if data.get("status") == "error":
                return {"status": "error", "message": data.get("message", "Unknown API error")}
            
            if data.get("message") == "No transactions found":
                 return {
                    "status": "success",
                    "blockchain": "ETH",
                    "address": address,
                    "total_transactions": 0,
                    "transactions": []
                }

            transactions: List[Dict] = []
            # V2 повертає транзакції під ключем 'transactions'
            for tx in data.get("transactions", []):
                direction = "outgoing" if tx["from"].lower() == address.lower() else "incoming"
                transactions.append({
                    "blockchain": "ETH",
                    "tx_id": tx["hash"],
                    "from_address": tx["from"],
                    "to_address": tx["to"],
                    "amount": int(tx["value"]) / 10**18,  # wei → ETH
                    "timestamp": int(tx["timeStamp"]),
                    "direction": direction
                })

            return {
                "status": "success",
                "blockchain": "ETH",
                "address": address,
                "total_transactions": len(transactions),
                "transactions": transactions
            }
            
    except httpx.RequestError as e:
        return {"status": "error", "message": f"Network request failed: {e}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {e}"}


if __name__ == "__main__":
    print(asyncio.run(get_eth_transactions("0x35E075EfCc7dCC5399C62df88123Bb515B7b0266")))