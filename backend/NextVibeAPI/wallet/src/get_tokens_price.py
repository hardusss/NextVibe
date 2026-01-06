import httpx
from collections.abc import Sequence
from django.core.cache import cache
from typing import Dict

DEFAULT_TOKENS = ["solana", "tron", "ethereum"]

def get_tokens_prices(tokens: Sequence[str] | None = None, vs_currencies: str = "usd", last: bool = False) -> Dict[str, float]:
    requested_tokens = sorted(tokens) if tokens else DEFAULT_TOKENS
    
    tokens_string = "_".join(requested_tokens)
    cache_key = f"prices_{vs_currencies}_{tokens_string}"
    
    if last:
        if len(requested_tokens) != 1:
            raise ValueError("Parameter 'last=True' is only supported for a single token.")
        cache_key = f"price_last_{requested_tokens[0]}_{vs_currencies}"

    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(requested_tokens),
        "vs_currencies": vs_currencies,
    }

    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(url, params=params)
            if response.status_code == 200:
                prices = response.json()
                
                data = {}
                for token in requested_tokens:
                    token_info = prices.get(token)
                    if token_info:
                        data[token] = float(token_info.get(vs_currencies, 0))

                if data:
                    cache.set(cache_key, data, timeout=60)
                
                return data
    except Exception:
        pass 

    return cached_data or {}