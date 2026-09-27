"""
Sign-in with a Mobile Wallet Adapter wallet: the wallet signs
"Sign in to NextVibe.\\nNonce: <ms>" (components/SignInViaWallet/ButtonWalletSignIn.android.tsx).
Only that message is accepted, only while it's fresh, and each signature once.
"""
import time

import base58
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from nacl.signing import SigningKey
from rest_framework.test import APIRequestFactory

from user.views_pac.wallet_singin import WalletSignInView

User = get_user_model()
PATH = "/users/wallet-sign-in/"


class MwaWalletSignInTest(TestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()
        self._throttles = WalletSignInView.throttle_classes
        WalletSignInView.throttle_classes = []
        self.key = SigningKey.generate()
        self.address = base58.b58encode(bytes(self.key.verify_key)).decode()

    def tearDown(self):
        WalletSignInView.throttle_classes = self._throttles

    def message(self, offset_seconds=0):
        return f"Sign in to NextVibe.\nNonce: {int((time.time() + offset_seconds) * 1000)}"

    def body(self, message, **extra):
        signature = list(self.key.sign(message.encode()).signature)
        return {"wallet_address": self.address, "signature": signature, "message": message,
                "username": "vibe_tester", **extra}

    def post(self, body):
        return WalletSignInView.as_view()(self.factory.post(PATH, body, format="json"))

    def existing_user(self):
        return User.objects.create_user(email="w@example.com", username="walletuser", password="Password123!",
                                        wallet_address=self.address)

    def test_a_fresh_sign_in_message_works(self):
        self.existing_user()
        response = self.post(self.body(self.message()))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data["token"])

    def test_each_signature_works_once(self):
        self.existing_user()
        body = self.body(self.message())
        self.assertEqual(self.post(body).status_code, 200)
        again = self.post(body)
        self.assertEqual(again.status_code, 401)
        self.assertNotIn("token", again.data)

    def test_old_and_future_messages_are_refused(self):
        self.existing_user()
        for offset in (-20 * 60, 20 * 60):
            response = self.post(self.body(self.message(offset)))
            self.assertEqual(response.status_code, 401, offset)
            self.assertNotIn("token", response.data)

    def test_a_signature_of_any_other_text_is_refused(self):
        self.existing_user()
        for text in ("Welcome to another app", "Sign in to NextVibe.\nNonce: abc", ""):
            response = self.post(self.body(text or " "))
            self.assertEqual(response.status_code, 401, text)

    def test_a_wrong_signature_is_refused(self):
        self.existing_user()
        body = self.body(self.message())
        body["signature"] = list(SigningKey.generate().sign(body["message"].encode()).signature)
        self.assertEqual(self.post(body).status_code, 401)

    def test_the_invite_retry_can_reuse_the_signature_once(self):
        body = self.body(self.message())
        first = self.post(body)
        self.assertEqual(first.status_code, 400)
        self.assertEqual(first.data["error"], "invite_code_required")
        second = self.post({**body, "from_invite_code": ""})
        self.assertEqual(second.status_code, 201, second.data)
        self.assertTrue(User.objects.filter(wallet_address=self.address).exists())
        third = self.post({**body, "from_invite_code": ""})
        self.assertEqual(third.status_code, 401)
