"""
Tests for the Proximity Token service.

Tests cover:
- Token generation (format, storage, TTL)
- Token verification (single-use, expiry, self-interaction prevention)
- Checkin flow via token
- Networking flow via token
"""
import json
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status
from user.models import User
from posts.models import Post, EventRequest, EventCheckin, Reputation
from posts.view_pac.proximity_token import TOKEN_PREFIX, TOKEN_TTL


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "proximity-token-test",
        }
    }
)
class ProximityTokenTests(TestCase):
    """Test suite for proximity token generation and verification."""

    def setUp(self):
        """Set up test fixtures."""
        cache.clear()

        # Create test users
        self.user_broadcaster = User.objects.create_user(
            username="broadcaster",
            email="broadcaster@test.com",
            password="testpass123",
        )
        self.user_scanner = User.objects.create_user(
            username="scanner",
            email="scanner@test.com",
            password="testpass123",
        )

        # Create test event (Post with is_luma_event=True)
        self.event = Post.objects.create(
            owner=self.user_broadcaster,
            about="Test Event",
            is_luma_event=True,
        )

        # Set up API clients
        self.broadcaster_client = APIClient()
        self.broadcaster_client.force_authenticate(user=self.user_broadcaster)

        self.scanner_client = APIClient()
        self.scanner_client.force_authenticate(user=self.user_scanner)

    def tearDown(self):
        cache.clear()

    # --- Token Generation Tests ---

    def _check_in(self, user, event=None):
        """Networking tokens now require the broadcaster to be checked in."""
        return EventCheckin.objects.create(
            user=user, post=event or self.event, is_registered=True
        )

    def test_generate_token_success(self):
        """Test successful token generation."""
        self._check_in(self.user_broadcaster)
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(len(response.data["token"]), 8)
        self.assertEqual(response.data["interaction_type"], "networking")
        self.assertEqual(response.data["event_id"], self.event.id)

    def test_generate_token_stored_in_cache(self):
        """Test that token is stored in cache with correct payload."""
        self._check_in(self.user_broadcaster)
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = response.data["token"]
        cache_key = f"{TOKEN_PREFIX}{token}"
        payload = cache.get(cache_key)
        self.assertIsNotNone(payload)

        if isinstance(payload, str):
            payload = json.loads(payload)
        self.assertEqual(str(payload["user_id"]), str(self.user_broadcaster.user_id))
        self.assertEqual(payload["event_id"], self.event.id)
        self.assertEqual(payload["interaction_type"], "networking")

    def test_generate_token_invalid_interaction_type(self):
        """Test rejection of invalid interaction types."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "invalid", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_token_missing_event_id(self):
        """Test rejection when event_id is missing."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_token_nonexistent_event(self):
        """Test rejection when event doesn't exist."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": 99999},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_generate_token_requires_auth(self):
        """Test that unauthenticated requests are rejected."""
        client = APIClient()
        response = client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Token Verification Tests ---

    def test_verify_token_invalid(self):
        """Test rejection of invalid/nonexistent token."""
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": "nonexistent"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid", response.data["error"].lower())

    def test_verify_token_valid_during_ttl(self):
        """Test that a temporary token remains valid during its TTL window."""
        # Generate a token
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        # Verification should succeed (not return "invalid or expired token")
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertNotEqual(response.data.get("error", ""), "Token is invalid or expired.")

    def test_verify_token_self_interaction_prevented(self):
        """Test that a user cannot verify their own token."""
        self._check_in(self.user_broadcaster)
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        # Broadcaster tries to verify their own token
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("yourself", response.data["error"].lower())

    def test_verify_token_missing(self):
        """Test rejection when token is not provided."""
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_token_requires_auth(self):
        """Test that unauthenticated requests are rejected."""
        client = APIClient()
        response = client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": "sometoken"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Checkin Flow Tests ---

    def test_checkin_flow_verified_user(self):
        """Test check-in flow for a registered/approved user."""
        # Approve the scanner for the event
        EventRequest.objects.create(
            user=self.user_scanner,
            post=self.event,
            status=EventRequest.Status.APPROVED,
        )

        # Generate checkin token
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        # Verify token
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["verified"])
        self.assertEqual(response.data["interaction_type"], "checkin")
        self.assertEqual(response.data["post_name"], "Test Event")

    def test_checkin_flow_unregistered_user(self):
        """Test check-in flow for an unregistered user."""
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["verified"])
        self.assertEqual(response.data["interaction_type"], "checkin")

    # --- Networking Flow Tests ---

    def test_networking_flow_success(self):
        """Test networking flow between two checked-in users."""
        # Both users need to be checked in
        EventCheckin.objects.create(
            user=self.user_broadcaster,
            post=self.event,
            is_registered=True,
        )
        EventCheckin.objects.create(
            user=self.user_scanner,
            post=self.event,
            is_registered=True,
        )

        # Generate networking token
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        # Verify token
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertIn("earned_points", response.data)
        self.assertIn("scanned_user", response.data)

        # Verify reputation records were created
        scanner_rep = Reputation.objects.filter(
            user=self.user_scanner,
            given_by=self.user_broadcaster,
            event=self.event,
            is_checkin=False,
        ).exists()
        broadcaster_rep = Reputation.objects.filter(
            user=self.user_broadcaster,
            given_by=self.user_scanner,
            event=self.event,
            is_checkin=False,
        ).exists()
        self.assertTrue(scanner_rep)
        self.assertTrue(broadcaster_rep)

    def test_networking_preview_grants_nothing(self):
        """Preview must return the peer + points without writing Reputation."""
        EventCheckin.objects.create(user=self.user_broadcaster, post=self.event, is_registered=True)
        EventCheckin.objects.create(user=self.user_scanner, post=self.event, is_registered=True)

        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token, "preview": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["preview"])
        self.assertIn("earned_points", response.data)
        self.assertEqual(response.data["scanned_user"]["username"], "broadcaster")
        self.assertEqual(Reputation.objects.count(), 0)

        # The follow-up confirming call is what actually grants.
        confirm = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.assertTrue(confirm.data["success"])
        self.assertEqual(Reputation.objects.count(), 2)

    def test_irl_preview_grants_nothing(self):
        """IRL preview must not write Reputation or count toward daily limits."""
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "irl"},
            format="json",
        )
        token = gen_response.data["token"]

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token, "preview": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["preview"])
        self.assertEqual(response.data["source"], "irl")
        self.assertEqual(Reputation.objects.count(), 0)

        confirm = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.assertTrue(confirm.data["success"])
        self.assertEqual(Reputation.objects.count(), 2)

    def test_networking_flow_not_checked_in(self):
        """Test networking fails if scanner is not checked in."""
        EventCheckin.objects.create(
            user=self.user_broadcaster,
            post=self.event,
            is_registered=True,
        )
        # Scanner is NOT checked in

        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("check-in", response.data["error"].lower())

    # --- Server-side mode resolution (event vs IRL) ---

    def test_generate_irl_upgraded_to_networking_when_checked_in(self):
        """A checked-in broadcaster requesting an 'irl' token gets a
        networking token for their active event, and the resulting tap is
        recorded as source='event' at that event — never as an IRL tap."""
        self._check_in(self.user_broadcaster)
        self._check_in(self.user_scanner)

        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "irl"},
            format="json",
        )
        self.assertEqual(gen_response.status_code, status.HTTP_200_OK)
        self.assertEqual(gen_response.data["interaction_type"], "networking")
        self.assertEqual(gen_response.data["event_id"], self.event.id)

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": gen_response.data["token"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["interaction_type"], "networking")

        event_rows = Reputation.objects.filter(source="event", event=self.event, is_checkin=False)
        self.assertEqual(event_rows.count(), 2)
        self.assertTrue(event_rows.filter(user=self.user_scanner, given_by=self.user_broadcaster).exists())
        self.assertTrue(event_rows.filter(user=self.user_broadcaster, given_by=self.user_scanner).exists())
        self.assertEqual(Reputation.objects.filter(source="irl").count(), 0)

    def test_generate_irl_without_checkin_stays_irl(self):
        """A broadcaster with no active check-in gets a true IRL token and the
        tap lands as source='irl' with no event attached."""
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "irl"},
            format="json",
        )
        self.assertEqual(gen_response.status_code, status.HTTP_200_OK)
        self.assertEqual(gen_response.data["interaction_type"], "irl")
        self.assertIsNone(gen_response.data["event_id"])

        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": gen_response.data["token"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["source"], "irl")

        irl_rows = Reputation.objects.filter(source="irl")
        self.assertEqual(irl_rows.count(), 2)
        for row in irl_rows:
            self.assertIsNone(row.event)
            self.assertEqual(row.points, 1)
        self.assertEqual(Reputation.objects.filter(source="event").count(), 0)

    def test_generate_networking_without_checkin_403(self):
        """Requesting a networking token without an active check-in for the
        event is rejected, mirroring the scanner-side gate."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("check in", response.data["error"].lower())

    def test_already_networked_ignores_post_rep_rows(self):
        """Post-linked reputation rows (event posts, collect bonuses) at the
        same event must not count as an existing tap between two users."""
        self._check_in(self.user_broadcaster)
        self._check_in(self.user_scanner)

        content_post = Post.objects.create(
            owner=self.user_broadcaster, about="Event photo", on_event=self.event,
        )
        Reputation.objects.create(
            user=self.user_scanner,
            given_by=self.user_broadcaster,
            points=10,
            is_checkin=False,
            event=self.event,
            post=content_post,
            post_type="event_post",
            source="post",
        )

        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": gen_response.data["token"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(
            Reputation.objects.filter(source="event", post__isnull=True).count(), 2
        )
