import httpx
from collections.abc import Sequence
from django.core.cache import cache

DEFAULT_TOKENS = ["solana", "tron", "ethereum"]

async def get_tokens_prices(tokens: Sequence[str] | None = None, vs_currencies: str = "usd", last: bool = False) -> dict[str, float] | None:
    if tokens is None:
        tokens = DEFAULT_TOKENS

    if last and len(tokens) != 1:
        raise ValueError("Parameter 'last=True' is only supported for a single token.")

    if not last and tokens == DEFAULT_TOKENS:
        data = cache.get("prices")
        if data:
            return data

    if last:
        data_last = cache.get(f"price_last_{tokens[0]}")
        if data_last:
            return data_last

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(tokens),
        "vs_currencies": vs_currencies,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params)
        if response.status_code == 200:
            prices = response.json()
            data = {token: prices[token][vs_currencies] for token in tokens}

            if last and len(data) == 1:
                cache.set(f"price_last_{tokens[0]}", data, timeout=60)
            else:
                cache.set("prices", data, timeout=60)

            return data
        else:
            return cache.get("prices")
