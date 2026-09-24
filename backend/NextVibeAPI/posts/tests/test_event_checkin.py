"""
Tests for event check-in and its POAP.

Check-in verification (both the direct endpoint and the proximity-token path)
atomically records EventCheckin(is_registered=True), Reputation(source='checkin')
and the POAP collectible: queued (minted right away) with a wallet, saved
off-chain without one. The claim endpoint mints a queued POAP in the request
and answers where it stands, so a mint failure never loses the check-in.
"""
from unittest.mock import patch, MagicMock

import requests as requests_lib
from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient

from posts.models import Collectible, EventCheckin, EventRequest, Post, Reputation, UserCollection
from posts.src import collectible_mint
from user.models import User

CHECKIN_URL = "/api/v1/posts/event-checkin/{}/"
CLAIM_URL = "/api/v1/posts/claim-event-cnft/{}/"
GENERATE_TOKEN_URL = "/api/v1/posts/proximity/generate-token/"
VERIFY_TOKEN_URL = "/api/v1/posts/proximity/verify-token/"


def service_response(payload, status_code=200):
    res = MagicMock()
    res.json.return_value = payload
    res.status_code = status_code
    return res


MINT_OK = {
    "success": True,
    "assetId": "PoapAssetId111",
    "signature": "c2ln",
}


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "event-checkin-test",
        }
    }
)
class EventCheckinTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            username="organizer", email="organizer@test.com", password="pass12345",
        )
        self.attendee = User.objects.create_user(
            username="attendee", email="attendee@test.com", password="pass12345",
        )
        self.attendee.wallet_address = "3x9az88Dkbxa6tkKByxqEn7jBTJCJCD4dVvou49L24ET"
        self.attendee.save(update_fields=["wallet_address"])

        # h3_geo stays None so the geofence is skipped.
        self.event = Post.objects.create(
            owner=self.owner,
            about="Test Event",
            is_luma_event=True,
            is_approved=True,
            moderation_status="approved",
            total_supply=50,
            minted_count=0,
        )
        EventRequest.objects.create(
            user=self.attendee, post=self.event, status=EventRequest.Status.APPROVED,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.attendee)

        # The queue's worker isn't running: the claim endpoint mints in the request
        self.enqueued = []
        for target, value in (("posts.src.collectibles.enqueue", self.enqueued.extend),
                              ("posts.src.collectible_mint.tree_status", None),
                              ("posts.src.realtime.publish", None)):
            patcher = patch(target, side_effect=value) if callable(value) else patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)
        on_commit = patch("django.db.transaction.on_commit", side_effect=lambda func, using=None, robust=False: func())
        on_commit.start()
        self.addCleanup(on_commit.stop)

    def tearDown(self):
        cache.clear()

    def checkin(self):
        return self.client.post(CHECKIN_URL.format(self.event.id), {}, format="json")

    def claim(self):
        return self.client.post(CLAIM_URL.format(self.event.id), {}, format="json")

    def assert_checked_in(self, mint_status="pending"):
        checkin = EventCheckin.objects.get(user=self.attendee, post=self.event)
        self.assertTrue(checkin.is_registered)
        self.assertEqual(checkin.mint_status, mint_status)
        rep = Reputation.objects.get(
            user=self.attendee, event=self.event, is_checkin=True
        )
        self.assertEqual(rep.source, "checkin")
        self.assertEqual(rep.given_by, self.owner)
        self.assertTrue(5 <= rep.points <= 20)
        return checkin, rep

    def poap(self):
        return Collectible.objects.get(user=self.attendee, kind="poap", source_id=str(self.event.id))

    # --- Check-in verification grants everything, the POAP included ---

    def test_verify_creates_checkin_reputation_and_the_poap(self):
        res = self.checkin()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["verified"])

        checkin, rep = self.assert_checked_in(mint_status="pending")
        self.assertEqual(res.data["earned_points"], rep.points)
        # Queued for the attendee's wallet (the worker mints it), edition 1 taken
        poap = self.poap()
        self.assertEqual((poap.status, poap.edition, poap.wallet), ("queued", 1, self.attendee.wallet_address))
        self.assertEqual(self.enqueued, [poap.pk])
        self.assertEqual(poap.metadata_uri, f"https://api.nextvibe.io/api/v1/posts/{self.event.id}/metadata/1/")
        self.assertEqual(poap.name, "Test Event #1")
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 1)
        self.assertFalse(UserCollection.objects.filter(user=self.attendee, post=self.event).exists())

    def test_verify_is_idempotent(self):
        self.assertEqual(self.checkin().status_code, 200)
        self.assertEqual(self.checkin().status_code, 200)
        self.assertEqual(EventCheckin.objects.filter(user=self.attendee, post=self.event).count(), 1)
        self.assertEqual(
            Reputation.objects.filter(user=self.attendee, event=self.event, is_checkin=True).count(), 1
        )
        self.assertEqual(Collectible.objects.filter(user=self.attendee).count(), 1)
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 1)

    def test_token_checkin_creates_records(self):
        organizer_client = APIClient()
        organizer_client.force_authenticate(user=self.owner)
        gen = organizer_client.post(
            GENERATE_TOKEN_URL,
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(gen.status_code, 200)

        res = self.client.post(VERIFY_TOKEN_URL, {"token": gen.data["token"]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["verified"])
        self.assertEqual(res.data["post_id"], self.event.id)
        self.assert_checked_in(mint_status="pending")
        self.assertEqual(self.poap().status, "queued")

    def test_unregistered_verify_creates_nothing(self):
        EventRequest.objects.filter(user=self.attendee, post=self.event).delete()
        res = self.checkin()
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["verified"])
        self.assertFalse(EventCheckin.objects.filter(user=self.attendee, post=self.event).exists())
        self.assertEqual(Reputation.objects.count(), 0)
        self.assertEqual(Collectible.objects.count(), 0)

    def test_sold_out_event_still_checks_in(self):
        Post.objects.filter(pk=self.event.pk).update(total_supply=1, minted_count=1)
        res = self.checkin()
        self.assertTrue(res.data["verified"])
        self.assert_checked_in()
        self.assertFalse(Collectible.objects.exists())
        res = self.claim()
        self.assertEqual(res.status_code, 400)
        self.assertIn("sold out", res.data["error"])

    # --- Claim: mints a queued POAP now, and says where it stands ---

    @patch("posts.src.collectible_mint.requests.post")
    def test_claim_success_transitions_to_minted(self, mock_post):
        mock_post.return_value = service_response(MINT_OK)
        self.checkin()

        res = self.claim()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["status"], "minted")
        self.assertEqual(res.data["collectible"]["asset_id"], "PoapAssetId111")

        checkin, rep = self.assert_checked_in(mint_status="minted")
        self.assertEqual(res.data["earned_points"], rep.points)
        collection = UserCollection.objects.get(user=self.attendee, post=self.event)
        self.assertEqual((collection.asset_id, collection.edition), ("PoapAssetId111", 1))
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 1)
        self.assertTrue(self.event.is_nft)
        self.assertEqual(mock_post.call_args.kwargs["json"],
                         {"recipient": self.attendee.wallet_address, "postId": self.event.id, "edition": 1})
        # The claim must not double-award the check-in reputation.
        self.assertEqual(
            Reputation.objects.filter(user=self.attendee, event=self.event, is_checkin=True).count(), 1
        )
        # A second claim: already on Solana, nothing minted again
        again = self.claim()
        self.assertTrue(again.data["already_owned"])
        self.assertEqual(mock_post.call_count, 1)

    @patch("posts.src.collectible_mint.requests.post")
    def test_claim_service_down_keeps_checkin(self, mock_post):
        mock_post.side_effect = requests_lib.ConnectionError("NewConnectionError: Connection refused")
        self.checkin()

        res = self.claim()
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["success"])
        self.assertIn("didn't work this time", res.data["error"])

        # The check-in and its reputation survive the mint failure; the POAP retries by itself
        self.assert_checked_in(mint_status="pending")
        self.assertFalse(UserCollection.objects.filter(user=self.attendee, post=self.event).exists())
        poap = self.poap()
        self.assertEqual((poap.status, poap.attempts), ("queued", 1))
        self.assertIsNotNone(poap.next_attempt_at)
        self.assertEqual(res.data["status"], "queued")
        # Retry (the pill's button) mints right away, past the backoff
        mock_post.side_effect = None
        mock_post.return_value = service_response(MINT_OK)
        res = self.claim()
        self.assertTrue(res.data["success"])
        self.assert_checked_in(mint_status="minted")

    @patch("posts.src.collectible_mint.requests.post")
    def test_claim_without_checkin_rejected(self, mock_post):
        res = self.claim()
        self.assertEqual(res.status_code, 400)
        self.assertIn("check in", res.data["error"].lower())
        mock_post.assert_not_called()

    @patch("posts.src.collectible_mint.requests.post")
    def test_claim_already_owned_selfheals(self, mock_post):
        # Minted before POAPs were recorded at check-in
        EventCheckin.objects.create(user=self.attendee, post=self.event, is_registered=True)
        UserCollection.objects.create(
            user=self.attendee, post=self.event,
            asset_id="ExistingAsset11", signature="sig", edition=1, price=0,
        )

        res = self.claim()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertTrue(res.data["already_owned"])
        poap = self.poap()
        self.assertEqual((poap.status, poap.asset_id), ("minted", "ExistingAsset11"))
        mock_post.assert_not_called()

    @patch("posts.src.collectible_mint.requests.post")
    def test_checkin_without_a_wallet(self, mock_post):
        """Everything as for a wallet user; the POAP is saved off-chain and nothing is minted."""
        User.objects.filter(pk=self.attendee.pk).update(wallet_address=None)
        self.attendee.refresh_from_db()
        self.client.force_authenticate(user=self.attendee)

        res = self.checkin()
        self.assertTrue(res.data["verified"])
        self.assertEqual(res.data["message"], "You're verified! Welcome to the event.")
        self.assert_checked_in()
        poap = self.poap()
        self.assertEqual((poap.status, poap.wallet), ("offchain", ""))

        # Apps with this change: saved is a success
        res = self.client.post(CLAIM_URL.format(self.event.id), {"wallet_optional": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertEqual((res.data["status"], res.data["message"]), ("offchain", "Saved to your profile · Claim anytime"))
        self.assertTrue(res.data["collectible"]["can_claim"])
        self.assertFalse(res.data["collectible"]["onchain"])
        # Older apps show the text in their retry pill
        res = self.claim()
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"], "Saved to your profile. Connect a wallet anytime to put it on Solana.")
        mock_post.assert_not_called()

        # The organizer sees the check-in like any other
        organizer = APIClient()
        organizer.force_authenticate(user=self.owner)
        listing = organizer.get(f"/api/v1/posts/event-checkin/list/{self.event.id}/").json()
        self.assertEqual((listing["total"], listing["registered"]), (1, 1))
