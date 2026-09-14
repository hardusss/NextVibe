"""
Tests for event check-in and the decoupled POAP cNFT claim.

Check-in verification (both the direct endpoint and the proximity-token path)
must atomically record EventCheckin(is_registered=True, mint_status='pending')
and Reputation(source='checkin') — independent of the mint. The claim endpoint
only performs the mint and transitions mint_status, so a mint failure never
loses the check-in.
"""
from unittest.mock import patch, MagicMock

import requests as requests_lib
from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient

from posts.models import EventCheckin, EventRequest, Post, Reputation, UserCollection
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
        self.attendee.wallet_address = "AttendeeWallet1111111111111111111111111111"
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

    # --- Check-in verification grants everything except the mint ---

    def test_verify_creates_checkin_reputation_and_pending_mint(self):
        res = self.checkin()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["verified"])

        checkin, rep = self.assert_checked_in(mint_status="pending")
        self.assertEqual(res.data["earned_points"], rep.points)
        # No NFT yet — the pending mint_status is the mint job record.
        self.assertFalse(UserCollection.objects.filter(user=self.attendee, post=self.event).exists())

    def test_verify_is_idempotent(self):
        self.assertEqual(self.checkin().status_code, 200)
        self.assertEqual(self.checkin().status_code, 200)
        self.assertEqual(EventCheckin.objects.filter(user=self.attendee, post=self.event).count(), 1)
        self.assertEqual(
            Reputation.objects.filter(user=self.attendee, event=self.event, is_checkin=True).count(), 1
        )

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

    def test_unregistered_verify_creates_nothing(self):
        EventRequest.objects.filter(user=self.attendee, post=self.event).delete()
        res = self.checkin()
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["verified"])
        self.assertFalse(EventCheckin.objects.filter(user=self.attendee, post=self.event).exists())
        self.assertEqual(Reputation.objects.count(), 0)

    # --- Claim: mint only, transitions mint_status ---

    @patch("posts.view_pac.event_checkin.requests.post")
    def test_claim_success_transitions_to_minted(self, mock_post):
        mock_post.return_value = service_response(MINT_OK)
        self.checkin()

        res = self.claim()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])

        checkin, rep = self.assert_checked_in(mint_status="minted")
        self.assertEqual(res.data["earned_points"], rep.points)
        collection = UserCollection.objects.get(user=self.attendee, post=self.event)
        self.assertEqual(collection.asset_id, "PoapAssetId111")
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 1)
        # The claim must not double-award the check-in reputation.
        self.assertEqual(
            Reputation.objects.filter(user=self.attendee, event=self.event, is_checkin=True).count(), 1
        )

    @patch("posts.view_pac.event_checkin.requests.post")
    def test_claim_service_down_keeps_checkin(self, mock_post):
        mock_post.side_effect = requests_lib.ConnectionError("nft-service unreachable")
        self.checkin()

        res = self.claim()
        self.assertEqual(res.status_code, 500)

        # The check-in and its reputation survive the mint failure.
        self.assert_checked_in(mint_status="failed")
        self.assertFalse(UserCollection.objects.filter(user=self.attendee, post=self.event).exists())
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 0)

    @patch("posts.view_pac.event_checkin.requests.post")
    def test_claim_without_checkin_rejected(self, mock_post):
        res = self.claim()
        self.assertEqual(res.status_code, 400)
        self.assertIn("check in", res.data["error"].lower())
        mock_post.assert_not_called()

    @patch("posts.view_pac.event_checkin.requests.post")
    def test_claim_already_owned_selfheals(self, mock_post):
        self.checkin()
        UserCollection.objects.create(
            user=self.attendee, post=self.event,
            asset_id="ExistingAsset11", signature="sig", edition=1, price=0,
        )

        res = self.claim()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertTrue(res.data["already_owned"])
        self.assert_checked_in(mint_status="minted")
        mock_post.assert_not_called()
