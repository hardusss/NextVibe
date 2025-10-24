import httpx
from typing import List, Dict
from dotenv import load_dotenv
from os import getenv
import asyncio
load_dotenv()

ETHERSCAN_API_KEY = getenv("ETHERSCAN_API_TOKEN")


async def get_eth_transactions(address: str, start_block: int = 0, end_block: int = 99999999) -> Dict:
    
    if not ETHERSCAN_API_KEY:
        return {"status": "error", "message": "ETHERSCAN_API_TOKEN not found in .env"}

    api_url = f"https://api.etherscan.io/v2/api"

    params = {
        "chainid": 11155111,
        "module": "account",
        "action": "txlist",
        "address": str(address),
        "start_block": 0,
        "end_block": 9999999999,
        "sort": "desc",
        "apikey": ETHERSCAN_API_KEY
        
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(api_url, params=params)
            if response.status_code != 200:
                return {
                    "status": "error", 
                    "message": f"HTTP Error: {response.status_code}", 
                    "response": response.text
                }

            data = response.json()
            
            if data.get("status") == "0":
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
            for tx in data.get("result", []):
                direction = "outgoing" if tx["from"].lower() == address.lower() else "incoming"
                transactions.append({
                    "blockchain": "ETH",
                    "icon": "https://cdn-icons-png.flaticon.com/512/14446/14446159.png",
                    "tx_id": tx["hash"],
                    "from_address": tx["from"],
                    "to_address": tx["to"],
                    "amount": int(tx["value"]) / 10**18,  
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

