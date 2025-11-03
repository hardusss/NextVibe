import httpx
from typing import List, Dict
from django.core.cache import cache

DEFAULT_TOKENS = ["solana", "tron", "ethereum"]

async def get_tokens_prices(tokens: List[str] = DEFAULT_TOKENS, vs_currencies: str = "usd") -> Dict[str, float] | None:
    
    data = cache.get("prices")
    data_last = cache.get("price_last")
    if data and tokens == DEFAULT_TOKENS:
        return data
    if data_last:
        return data_last

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

            if len(data) == 1:
                cache.set("price_last", data, timeout=60)
            else:
                cache.set("prices", data, timeout=60)

            return data
        if response.status_code != 200:
            return cache.get("prices") or None
        else:
            return None
