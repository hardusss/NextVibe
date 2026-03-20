import httpx
from collections.abc import Sequence
from django.core.cache import cache
from typing import Dict, TypedDict

DEFAULT_TOKENS = ["solana", "tron", "ethereum"]

class TokenPrice(TypedDict):
    price: float
    change_24h: float
    direction: str  # "up" | "down" | "flat"

def get_tokens_prices(
    tokens: Sequence[str] | None = None,
    vs_currencies: str = "usd",
    last: bool = False,
) -> Dict[str, TokenPrice]:
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
        "include_24hr_change": "true",
    }

    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(url, params=params)
            if response.status_code == 200:
                prices = response.json()
                print(f"[coingecko raw] {prices}")
                data: Dict[str, TokenPrice] = {}

                for token in requested_tokens:
                    token_info = prices.get(token)
                    if token_info:
                        change = float(token_info.get(f"{vs_currencies}_24h_change", 0))
                        data[token] = {
                            "price": float(token_info.get(vs_currencies, 0)),
                            "change_24h": round(change, 2),
                            "direction": "up" if change > 0 else "down" if change < 0 else "flat",
                        }

                if data:
                    cache.set(cache_key, data, timeout=60)
                    return data

    except Exception:
        pass

    return cached_data or {}