"""
Proven wallets: the Seeker Verified badge goes only to an account that proved
it controls the linked wallet, with a wallet sign-in or a signed
"Verify wallet for NextVibe.\\nNonce: <ms>" message sent to save-wallet or to
seeker/verify.
"""
import time
from io import StringIO
from unittest.mock import patch

import base58
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from nacl.signing import SigningKey
from rest_framework.test import APIClient

from user.src import seeker_verification
from verification.models import WalletProof
from verification.wallets import check_proof, is_proven, record_proof

User = get_user_model()
SAVE_URL = "/api/v1/users/save-wallet/"
VERIFY_URL = "/api/v1/users/seeker/verify/"


class WalletKey:
    def __init__(self):
        self.key = SigningKey.generate()
        self.address = base58.b58encode(bytes(self.key.verify_key)).decode()

    def proof(self, offset_seconds=0, text=None):
        message = text or f"Verify wallet for NextVibe.\nNonce: {int((time.time() + offset_seconds) * 1000)}"
        return {"message": message, "signature": list(self.key.sign(message.encode()).signature)}


class ProofTestCase(TestCase):
    def setUp(self):
        cache.clear()  # used signatures and throttle counters live in the cache
        self.wallet = WalletKey()
        self.user = User.objects.create_user(email="p@example.com", username="prover", password="Password123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class CheckProofTests(ProofTestCase):
    def test_a_fresh_signature_of_the_verify_message_passes_once(self):
        proof = self.wallet.proof()
        self.assertIsNone(check_proof(self.wallet.address, proof))
        self.assertIn("already used", check_proof(self.wallet.address, proof))

    def test_other_wallets_texts_and_times_fail(self):
        self.assertIsNotNone(check_proof(WalletKey().address, self.wallet.proof()))
        self.assertIsNotNone(check_proof(self.wallet.address, self.wallet.proof(text="Sign in to NextVibe.\nNonce: 1")))
        self.assertIsNotNone(check_proof(self.wallet.address, self.wallet.proof(text="Hello")))
        for offset in (-20 * 60, 20 * 60):
            self.assertIn("expired", check_proof(self.wallet.address, self.wallet.proof(offset)))

    def test_malformed_proofs_fail_cleanly(self):
        good = self.wallet.proof()
        for bad in (None, "x", [], {"message": good["message"]},
                    {"message": good["message"], "signature": 64},
                    {"message": good["message"], "signature": "a" * 64},
                    {"message": good["message"], "signature": [300] * 64},
                    {"message": good["message"], "signature": good["signature"][:10]},
                    {"message": 5, "signature": good["signature"]}):
            self.assertIsNotNone(check_proof(self.wallet.address, bad), bad)
        self.assertIsNotNone(check_proof("not-base58-0OIl", good))


class SaveWalletProofTests(ProofTestCase):
    def save(self, **body):
        with patch("user.views_pac.save_wallet_address.verify_seeker_in_background") as verify:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(SAVE_URL, {"walletAddress": self.wallet.address, **body}, format="json")
        return response, verify

    def test_a_signed_proof_marks_the_wallet_proven(self):
        response, verify = self.save(proof=self.wallet.proof())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["walletProven"])
        self.assertTrue(is_proven(self.user, self.wallet.address))
        verify.assert_called_once_with(self.user.user_id, self.wallet.address)

    def test_linking_without_a_proof_still_works(self):
        response, _ = self.save()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["walletProven"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.wallet_address, self.wallet.address)
        self.assertFalse(WalletProof.objects.exists())

    def test_a_bad_proof_links_the_wallet_unproven(self):
        response, _ = self.save(proof=WalletKey().proof())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["walletProven"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.wallet_address, self.wallet.address)

    def test_proving_the_wallet_already_linked(self):
        self.save()
        response, verify = self.save(proof=self.wallet.proof())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["walletProven"])
        verify.assert_called_once_with(self.user.user_id, self.wallet.address)

    def test_a_proof_for_one_account_is_not_carried_to_another(self):
        record_proof(self.user, self.wallet.address)
        other = User.objects.create_user(email="o@example.com", username="other", password="Password123!")
        self.assertFalse(is_proven(other, self.wallet.address))
        self.assertFalse(is_proven(self.user, None))


class BackgroundCheckTests(ProofTestCase):
    def test_an_unproven_wallet_is_not_checked(self):
        with patch.object(seeker_verification, "check_sgt_onchain") as check:
            seeker_verification._verify_and_notify(self.user.user_id, self.wallet.address)
        check.assert_not_called()
        self.user.refresh_from_db()
        self.assertFalse(self.user.seeker_verified)

    def test_a_proven_wallet_with_a_genesis_token_gets_the_badge(self):
        record_proof(self.user, self.wallet.address)
        with patch.object(seeker_verification, "check_sgt_onchain", return_value="SgtMint111"), \
                patch.object(seeker_verification, "_push_badge_granted"):
            seeker_verification._verify_and_notify(self.user.user_id, self.wallet.address)
        self.user.refresh_from_db()
        self.assertTrue(self.user.seeker_verified)
        self.assertEqual(self.user.seeker_sgt_mint, "SgtMint111")


@patch("user.views_pac.seeker_verify.check_sgt_onchain", return_value="SgtMint222")
class SeekerVerifyViewTests(ProofTestCase):
    def setUp(self):
        super().setUp()
        self.user.wallet_address = self.wallet.address
        self.user.save(update_fields=["wallet_address"])

    def test_an_unproven_wallet_gets_wallet_not_proven(self, check):
        response = self.client.post(VERIFY_URL, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "WALLET_NOT_PROVEN")
        self.assertFalse(response.data["seekerVerified"])
        check.assert_not_called()

    def test_a_bad_proof_gets_wallet_not_proven(self, check):
        response = self.client.post(VERIFY_URL, {"proof": WalletKey().proof()}, format="json")
        self.assertEqual(response.data["error"], "WALLET_NOT_PROVEN")
        check.assert_not_called()

    def test_a_signed_proof_runs_the_check(self, check):
        response = self.client.post(VERIFY_URL, {"proof": self.wallet.proof()}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["seekerVerified"])
        self.assertTrue(is_proven(self.user, self.wallet.address))
        # Proven once: the next check needs no new signature
        response = self.client.post(VERIFY_URL, {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_a_badge_already_on_chain_needs_nothing(self, check):
        self.user.seeker_verified = True
        self.user.seeker_verified_source = "onchain"
        self.user.save(update_fields=["seeker_verified", "seeker_verified_source"])
        response = self.client.post(VERIFY_URL, {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["seekerVerified"])


class WalletSignInProvesTests(ProofTestCase):
    def test_a_wallet_sign_in_proves_the_wallet(self):
        from user.views_pac.wallet_singin import WalletSignInView
        self.user.wallet_address = self.wallet.address
        self.user.save(update_fields=["wallet_address"])
        message = f"Sign in to NextVibe.\nNonce: {int(time.time() * 1000)}"
        with patch.object(WalletSignInView, "throttle_classes", []), \
                patch("user.views_pac.wallet_singin.verify_seeker_in_background"):
            response = APIClient().post("/api/v1/users/wallet-sign-in/", {
                "wallet_address": self.wallet.address, "message": message,
                "signature": list(self.wallet.key.sign(message.encode()).signature),
            }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(is_proven(self.user, self.wallet.address))


class BootstrapCommandTests(ProofTestCase):
    def test_unproven_wallets_are_skipped(self):
        self.user.wallet_address = self.wallet.address
        self.user.save(update_fields=["wallet_address"])
        out = StringIO()
        with patch("user.management.commands.grant_seeker_badges.check_sgt_onchain", return_value="SgtMint333") as check:
            call_command("grant_seeker_badges", "--onchain-only", "--sleep", "0", stdout=out)
        check.assert_not_called()
        self.assertIn("unproven=1", out.getvalue())
        self.user.refresh_from_db()
        self.assertFalse(self.user.seeker_verified)

        record_proof(self.user, self.wallet.address)
        with patch("user.management.commands.grant_seeker_badges.check_sgt_onchain", return_value="SgtMint333"):
            call_command("grant_seeker_badges", "--onchain-only", "--sleep", "0", stdout=StringIO())
        self.user.refresh_from_db()
        self.assertTrue(self.user.seeker_verified)
