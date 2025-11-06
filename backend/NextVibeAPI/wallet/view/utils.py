from django.core.cache import cache
import asyncio

async def async_clear_cache_later(user_id: int, delay: int = 10):
    await asyncio.sleep(delay)
    cache_keys = [
        f"balance_wallet_testnet_{user_id}",
        f"transactions_{user_id}",
        f"transactions_last_{user_id}",
        f"price_last_BTC",
        "prices",
    ]
    for key in cache_keys:
        cache.delete(key)