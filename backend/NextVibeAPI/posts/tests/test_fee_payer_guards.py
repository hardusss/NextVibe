"""
Guards on the paths where the backend pays for a mint.

Covers:
- posts can only be changed or deleted by their owner, and the fields the
  server manages (owner, approval, supply, mint counts) can't be written
- collect prepares are capped per day even when the client never submits
- owner publishes (cnft-mint) are capped per day
- every endpoint that can trigger a mint has a per-user throttle
"""
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from posts.models import Post, UserCollection
from posts.view_pac.collect import CollectPrepareView, CollectSubmitView
from posts.view_pac.event_checkin import ClaimEventNftView, EventCheckinView
from posts.view_pac.event_connections import EventNFCConnectView, IRLTapView
from posts.view_pac.mint_nft import MintNftView
from posts.view_pac.proximity_token import VerifyProximityTokenView
from user.models import User
from user.views_pac.save_wallet_address import SaveWalletAddressView

POSTS_URL = "/api/v1/posts/posts/"
PREPARE_URL = "/api/v1/posts/collect/prepare/"
PUBLISH_URL = "/api/v1/posts/cnft-mint/"
IRL_TAP_URL = "/api/v1/posts/irl-tap/"

PREPARE_OK = {
    "success": True,
    "transaction": "dGVzdC10eA==",
    "messageHash": "a" * 64,
    "blockhash": "9zQ",
    "expiresAt": "2026-01-01T00:00:00Z",
}
MINT_OK = {"success": True, "assetId": "AssetIdPublish", "signature": "c2ln"}


def service_response(payload):
    res = MagicMock()
    res.json.return_value = payload
    res.status_code = 200
    return res


class GuardTestCase(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.author = User.objects.create_user(
            username="author", email="author@test.com", password="pass12345",
        )
        self.author.wallet_address = "AuthorWallet1111111111111111111111111111111"
        self.author.save(update_fields=["wallet_address"])
        self.other = User.objects.create_user(
            username="other", email="other@test.com", password="pass12345",
        )
        self.other.wallet_address = "OtherWallet11111111111111111111111111111111"
        self.other.save(update_fields=["wallet_address"])
        self.post = Post.objects.create(
            owner=self.author, about="original", is_approved=True,
            moderation_status="approved", total_supply=50, minted_count=1, is_nft=True,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class PostWritesTests(GuardTestCase):
    def test_someone_else_cannot_edit_or_delete_a_post(self):
        client = self.client_for(self.other)
        res = client.patch(f"{POSTS_URL}{self.post.id}/", {"about": "hijacked"}, format="json")
        self.assertEqual(res.status_code, 404)
        res = client.put(f"{POSTS_URL}{self.post.id}/", {"about": "hijacked"}, format="json")
        self.assertEqual(res.status_code, 404)
        res = client.delete(f"{POSTS_URL}{self.post.id}/")
        self.assertEqual(res.status_code, 404)
        self.post.refresh_from_db()
        self.assertEqual(self.post.about, "original")

    def test_the_owner_edits_text_but_not_server_fields(self):
        client = self.client_for(self.author)
        res = client.patch(f"{POSTS_URL}{self.post.id}/", {
            "about": "edited",
            "owner": self.other.user_id,
            "is_approved": False,
            "moderation_status": "pending",
            "minted_count": 0,
            "total_supply": 100000,
            "is_nft": False,
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.post.refresh_from_db()
        self.assertEqual(self.post.about, "edited")
        self.assertEqual(self.post.owner, self.author)
        self.assertTrue(self.post.is_approved)
        self.assertEqual(self.post.moderation_status, "approved")
        self.assertEqual(self.post.minted_count, 1)
        self.assertEqual(self.post.total_supply, 50)
        self.assertTrue(self.post.is_nft)

    def test_a_new_post_starts_unapproved_whatever_the_client_sends(self):
        client = self.client_for(self.other)
        res = client.post(POSTS_URL, {
            "about": "new post",
            "owner": self.author.user_id,
            "is_approved": True,
            "moderation_status": "approved",
            "total_supply": 100000,
            "minted_count": 0,
            "is_nft": True,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        post = Post.all_objects.get(id=res.data["id"])
        self.assertEqual(post.owner, self.other)
        self.assertFalse(post.is_approved)
        self.assertEqual(post.moderation_status, "pending")
        self.assertEqual(post.total_supply, 50)
        self.assertFalse(post.is_nft)


class CollectPrepareCapTests(GuardTestCase):
    def setUp(self):
        super().setUp()
        # Out of the 24 h IRL reservation window
        Post.all_objects.filter(id=self.post.id).update(create_at=timezone.now() - timedelta(hours=25))

    @patch("posts.view_pac.collect.COLLECT_DAILY_PREPARE_LIMIT", 2)
    @patch("posts.view_pac.collect.requests.post")
    def test_prepares_without_submit_run_out(self, mock_post):
        mock_post.return_value = service_response(PREPARE_OK)
        client = self.client_for(self.other)
        for _ in range(2):
            res = client.post(PREPARE_URL, {"postId": self.post.id, "signer": "mwa"}, format="json")
            self.assertEqual(res.status_code, 200, res.data)
        res = client.post(PREPARE_URL, {"postId": self.post.id, "signer": "mwa"}, format="json")
        self.assertEqual(res.status_code, 429, res.data)
        self.assertEqual(res.data["code"], "DAILY_LIMIT")
        self.assertIn("resetsAt", res.data)
        # Nothing was ever submitted, and the service wasn't asked a third time
        self.assertFalse(UserCollection.objects.filter(user=self.other).exists())
        self.assertEqual(mock_post.call_count, 2)


class PublishCapTests(GuardTestCase):
    @patch("posts.view_pac.mint_nft.PUBLISH_DAILY_LIMIT", 1)
    @patch("posts.view_pac.mint_nft.requests.post")
    def test_one_person_publishes_a_capped_number_per_day(self, mock_post):
        mock_post.return_value = service_response(MINT_OK)
        first = Post.objects.create(owner=self.other, about="one", is_approved=True,
                                    moderation_status="approved", total_supply=50)
        second = Post.objects.create(owner=self.other, about="two", is_approved=True,
                                     moderation_status="approved", total_supply=50)
        client = self.client_for(self.other)
        res = client.post(PUBLISH_URL, {"postId": first.id}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        res = client.post(PUBLISH_URL, {"postId": second.id}, format="json")
        self.assertEqual(res.status_code, 429, res.data)
        self.assertEqual(res.data["code"], "DAILY_LIMIT")
        self.assertEqual(mock_post.call_count, 1)

    @patch("posts.view_pac.mint_nft.PUBLISH_DAILY_LIMIT", 1)
    @patch("posts.view_pac.mint_nft.requests.post")
    def test_polling_before_approval_is_not_counted(self, mock_post):
        pending = Post.objects.create(owner=self.other, about="waiting", total_supply=50)
        client = self.client_for(self.other)
        for _ in range(3):
            res = client.post(PUBLISH_URL, {"postId": pending.id}, format="json")
            self.assertEqual(res.status_code, 400)
            self.assertEqual(res.data["error"], "Post is not approved.")
        mock_post.assert_not_called()


class ThrottleTests(GuardTestCase):
    def test_every_mint_path_has_a_per_user_throttle(self):
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        expected = {
            CollectPrepareView: "collect",
            CollectSubmitView: "collect",
            MintNftView: "publish",
            EventCheckinView: "checkin",
            ClaimEventNftView: "checkin",
            IRLTapView: "tap",
            EventNFCConnectView: "tap",
            VerifyProximityTokenView: "tap",
            SaveWalletAddressView: "profile_edit",
        }
        for view, scope in expected.items():
            self.assertIn(ScopedRateThrottle, view.throttle_classes, view.__name__)
            self.assertEqual(view.throttle_scope, scope, view.__name__)
            self.assertIn(scope, rates, scope)

    def test_the_tap_throttle_answers_429(self):
        with patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"tap": "2/min"}):
            client = self.client_for(self.author)
            statuses = [
                client.post(IRL_TAP_URL, {"scanned_user_id": self.other.user_id}, format="json").status_code
                for _ in range(3)
            ]
        self.assertNotEqual(statuses[0], 429)
        self.assertNotEqual(statuses[1], 429)
        self.assertEqual(statuses[2], 429)
