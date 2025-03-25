import requests
from typing import List, Dict


def get_tokens_prices(tokens: List[str] = ["bitcoin", "solana", "tron"], vs_currencies: str = "usd"):
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        'ids': ",".join(tokens),
        'vs_currencies': vs_currencies
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        prices = response.json()
        data: Dict[str, str] = {}
        
        for token in tokens:
            data[token] = prices[token][vs_currencies]
        return data
    else:
        return None
