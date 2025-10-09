import httpx
from typing import List, Dict

async def get_tokens_prices(tokens: List[str] = ["bitcoin", "solana", "tron"], vs_currencies: str = "usd") -> Dict[str, float] | None:
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(tokens),
        "vs_currencies": vs_currencies
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params)
        if response.status_code == 200:
            prices = response.json()
            data: Dict[str, float] = {}
            for token in tokens:
                data[token] = prices[token][vs_currencies]
            return data
        else:
            return None
