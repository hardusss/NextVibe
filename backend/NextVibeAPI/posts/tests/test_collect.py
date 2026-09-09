"""
Tests for the free collect flow (two-phase gasless user-signed claim).

Covers:
- daily claim limit boundary (10th ok, 11th rejected)
- concurrent prepares reserve distinct editions
- IRL reservation of early editions inside/after the 24h window
- expired claims rejected on submit
- signer:"none" (no MWA) still mints via the legacy backend path
"""
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from posts.constants import COLLECT_DAILY_LIMIT
from posts.models import PendingClaim, Post, Reputation, UserCollection
from user.models import User

PREPARE_URL = "/api/v1/posts/collect/prepare/"
SUBMIT_URL = "/api/v1/posts/collect/submit/"


def service_response(payload, status_code=200):
    res = MagicMock()
    res.json.return_value = payload
    res.status_code = status_code
    return res


PREPARE_OK = {
    "success": True,
    "transaction": "dGVzdC10eA==",
    "messageHash": "a" * 64,
    "blockhash": "9zQ",
    "expiresAt": "2026-01-01T00:00:00Z",
}

SUBMIT_OK = {
    "success": True,
    "assetId": "AssetIdXyz",
    "signature": "c2ln",
}

MINT_OK = {
    "success": True,
    "assetId": "AssetIdLegacy",
    "signature": "c2lnLWxlZ2FjeQ==",
}


class CollectTestCase(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", email="author@test.com", password="pass12345",
        )
        self.author.wallet_address = "AuthorWallet1111111111111111111111111111111"
        self.author.save(update_fields=["wallet_address"])

        self.collector = User.objects.create_user(
            username="collector", email="collector@test.com", password="pass12345",
        )
        self.collector.wallet_address = "CollectorWallet111111111111111111111111111"
        self.collector.save(update_fields=["wallet_address"])

        self.post = Post.objects.create(
            owner=self.author,
            about="Post to collect",
            is_approved=True,
            moderation_status="approved",
            total_supply=50,
            minted_count=1,  # owner already published edition 1
            is_nft=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.collector)

    # ── helpers ────────────────────────────────────────────────────────────

    def age_post(self, hours):
        """Push the post's creation time into the past (bypasses auto_now_add)."""
        Post.all_objects.filter(id=self.post.id).update(
            create_at=timezone.now() - timedelta(hours=hours)
        )
        self.post.refresh_from_db()

    def make_irl_tap(self, user):
        """Record a networking tap between user and the author."""
        Reputation.objects.create(
            user=user, given_by=self.author, points=2, is_checkin=False,
        )

    def other_claims_today(self, user, count):
        """Give the user `count` finished claims on other posts today."""
        for i in range(count):
            other = Post.objects.create(
                owner=self.author, about=f"other {i}", is_approved=True,
                moderation_status="approved", total_supply=50, minted_count=1,
            )
            UserCollection.objects.create(
                user=user, post=other, asset_id=f"asset-{user.pk}-{i}", edition=2,
            )

    def prepare(self, signer="mwa", client=None):
        return (client or self.client).post(
            PREPARE_URL, {"postId": self.post.id, "signer": signer}, format="json",
        )

    # ── daily limit ────────────────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_daily_limit_boundary(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        self.age_post(hours=25)  # reservation window closed

        self.other_claims_today(self.collector, COLLECT_DAILY_LIMIT - 1)
        response = self.prepare()
        self.assertEqual(response.status_code, 200, response.data)

        # One more finished claim reaches the limit; the next prepare is rejected.
        PendingClaim.objects.all().delete()
        extra = Post.objects.create(
            owner=self.author, about="extra", is_approved=True,
            moderation_status="approved", total_supply=50, minted_count=1,
        )
        UserCollection.objects.create(
            user=self.collector, post=extra, asset_id="asset-extra", edition=2,
        )
        response = self.prepare()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["code"], "DAILY_LIMIT")
        self.assertIn("resetsAt", response.data)

    # ── edition reservation ────────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_concurrent_prepares_get_distinct_editions(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        self.age_post(hours=25)

        first = self.prepare()
        self.assertEqual(first.status_code, 200, first.data)

        second_user = User.objects.create_user(
            username="second", email="second@test.com", password="pass12345",
        )
        second_user.wallet_address = "SecondWallet2222222222222222222222222222222"
        second_user.save(update_fields=["wallet_address"])
        second_client = APIClient()
        second_client.force_authenticate(user=second_user)

        # First user's claim is still pending — the second user must get the
        # next edition, not the same one.
        second = self.prepare(client=second_client)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertNotEqual(first.data["edition"], second.data["edition"])
        self.assertEqual(second.data["edition"], first.data["edition"] + 1)

    # ── IRL reservation ────────────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_irl_reserve_blocks_non_irl_users_inside_window(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)

        response = self.prepare()  # fresh post, no tap, edition 2 is reserved
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "RESERVED_FOR_IRL")
        self.assertEqual(PendingClaim.objects.count(), 0)

    @patch("posts.view_pac.collect.requests.post")
    def test_irl_connected_user_gets_early_edition(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)

        self.make_irl_tap(self.collector)
        response = self.prepare()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["edition"], 2)

    @patch("posts.view_pac.collect.requests.post")
    def test_irl_reserve_lifted_after_window(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)

        self.age_post(hours=25)
        response = self.prepare()  # still no tap, but the window closed
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["edition"], 2)

    def test_collect_rep_bonus_does_not_grant_irl_eligibility(self):
        # A previous collect bonus row must not count as a networking tap.
        Reputation.objects.create(
            user=self.collector, given_by=self.author, points=2,
            is_checkin=False, post_type="collect",
        )
        from posts.src.collect_eligibility import is_irl_connected
        self.assertFalse(is_irl_connected(self.collector, self.post))

    # ── claim expiry ───────────────────────────────────────────────────────

    def test_expired_claim_returns_410(self):
        claim = PendingClaim.objects.create(
            user=self.collector,
            post=self.post,
            edition=2,
            message_hash="a" * 64,
            tx_base64="dGVzdA==",
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        response = self.client.post(SUBMIT_URL, {
            "claimId": str(claim.claim_id),
            "signedTransaction": "c2lnbmVk",
        }, format="json")
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.data["code"], "CLAIM_EXPIRED")
        self.assertFalse(PendingClaim.objects.filter(id=claim.id).exists())

    # ── submit success ─────────────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_submit_finalizes_claim(self, mock_post):
        claim = PendingClaim.objects.create(
            user=self.collector,
            post=self.post,
            edition=2,
            message_hash="a" * 64,
            tx_base64="dGVzdA==",
            expires_at=timezone.now() + timedelta(seconds=60),
        )
        mock_post.return_value = service_response(SUBMIT_OK)

        response = self.client.post(SUBMIT_URL, {
            "claimId": str(claim.claim_id),
            "signedTransaction": "c2lnbmVk",
        }, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["edition"], 2)
        self.post.refresh_from_db()
        self.assertEqual(self.post.minted_count, 2)
        collection = UserCollection.objects.get(user=self.collector, post=self.post)
        self.assertEqual(collection.edition, 2)
        self.assertEqual(collection.price, 0)
        self.assertFalse(PendingClaim.objects.filter(id=claim.id).exists())

    # ── signer: none (no MWA) ──────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_signer_none_mints_directly(self, mock_post):
        mock_post.return_value = service_response(MINT_OK)
        self.age_post(hours=25)

        response = self.prepare(signer="none")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["edition"], 2)

        self.post.refresh_from_db()
        self.assertEqual(self.post.minted_count, 2)
        self.assertTrue(
            UserCollection.objects.filter(user=self.collector, post=self.post).exists()
        )
        # The legacy /mint endpoint was used
        self.assertIn("/mint", mock_post.call_args.kwargs["url"])

    @patch("posts.view_pac.collect.requests.post")
    def test_ios_client_requesting_mwa_is_downgraded_to_none(self, mock_post):
        # MWA does not exist on iOS — the backend must fall back to the
        # finalized backend-signed mint instead of returning a transaction
        # the client can never sign.
        mock_post.return_value = service_response(MINT_OK)
        self.age_post(hours=25)

        response = self.client.post(
            PREPARE_URL, {"postId": self.post.id, "signer": "mwa"},
            format="json", HTTP_X_CLIENT_PLATFORM="ios",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["success"])
        self.assertIn("/mint", mock_post.call_args.kwargs["url"])
        self.assertTrue(
            UserCollection.objects.filter(user=self.collector, post=self.post).exists()
        )

    # ── misc guards ────────────────────────────────────────────────────────

    @patch("posts.view_pac.collect.requests.post")
    def test_already_claimed_conflict(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        self.age_post(hours=25)
        UserCollection.objects.create(
            user=self.collector, post=self.post, asset_id="asset-dup", edition=2,
        )
        response = self.prepare()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "ALREADY_CLAIMED")

    @patch("posts.view_pac.collect.requests.post")
    def test_sold_out(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        self.age_post(hours=25)
        Post.all_objects.filter(id=self.post.id).update(minted_count=50)
        response = self.prepare()
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.data["code"], "SOLD_OUT")

    @patch("posts.view_pac.collect.requests.post")
    def test_owner_cannot_collect_own_post(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        owner_client = APIClient()
        owner_client.force_authenticate(user=self.author)
        response = self.prepare(client=owner_client)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "OWNER_USE_PUBLISH")
