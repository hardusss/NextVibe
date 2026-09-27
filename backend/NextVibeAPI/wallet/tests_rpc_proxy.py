"""The Solana JSON-RPC proxy (POST /api/v1/wallets/rpc/) forwards wallet calls, not chain scans."""
import json
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

URL = "/api/v1/wallets/rpc/"
LAZORKIT = "LazorjRFNavitUaBu5m3WaNPjU1maipvSW2rZfAFAKi"


def upstream(payload):
    res = MagicMock()
    res.content = json.dumps(payload).encode()
    res.status_code = 200
    res.headers = {"Content-Type": "application/json"}
    res.json.return_value = payload
    return res


class RpcProxyTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def call(self, body):
        return self.client.post(URL, json.dumps(body), content_type="application/json")

    @patch("wallet.view.rpc_proxy._session.post")
    def test_wallet_calls_are_forwarded(self, post):
        post.return_value = upstream({"jsonrpc": "2.0", "id": 1, "result": {"value": 5}})
        response = self.call({"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": ["x"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(post.call_count, 1)
        batch = [{"jsonrpc": "2.0", "id": i, "method": "getLatestBlockhash"} for i in range(3)]
        self.assertEqual(self.call(batch).status_code, 200)

    @patch("wallet.view.rpc_proxy._session.post")
    def test_chain_scans_are_refused_before_helius(self, post):
        for body in (
            {"jsonrpc": "2.0", "id": 1, "method": "getBlock", "params": [1]},
            {"jsonrpc": "2.0", "id": 1, "method": "getProgramAccounts", "params": ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]},
            [{"jsonrpc": "2.0", "id": i, "method": "getBalance", "params": ["x"]} for i in range(21)],
            [],
            "nope",
        ):
            response = self.call(body)
            self.assertEqual(response.status_code, 403, body if not isinstance(body, list) else len(body))
        self.assertEqual(self.client.post(URL, "not json", content_type="application/json").status_code, 400)
        post.assert_not_called()

    @patch("wallet.view.rpc_proxy._session.post")
    def test_lazorkit_program_accounts_are_allowed(self, post):
        post.return_value = upstream({"jsonrpc": "2.0", "id": 1, "result": []})
        response = self.call({"jsonrpc": "2.0", "id": 1, "method": "getProgramAccounts", "params": [LAZORKIT, {}]})
        self.assertEqual(response.status_code, 200)
