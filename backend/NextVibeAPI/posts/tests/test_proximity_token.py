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

    def test_generate_token_success(self):
        """Test successful token generation."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(len(response.data["token"]), 8)

    def test_generate_token_stored_in_cache(self):
        """Test that token is stored in cache with correct payload."""
        response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "networking", "event_id": self.event.id},
            format="json",
        )
        token = response.data["token"]
        cache_key = f"{TOKEN_PREFIX}{token}"
        stored = cache.get(cache_key)
        self.assertIsNotNone(stored)

        payload = json.loads(stored)
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

    def test_verify_token_single_use(self):
        """Test that a token can only be used once (strict single-use)."""
        # Generate a token
        gen_response = self.broadcaster_client.post(
            "/api/v1/posts/proximity/generate-token/",
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        token = gen_response.data["token"]

        # First verification should succeed (or return a business logic error, but not "invalid token")
        first_response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        # Token was consumed regardless of business logic outcome
        self.assertNotEqual(first_response.data.get("error", ""), "Token is invalid, expired, or already used.")

        # Second verification must fail with "invalid/expired" error
        second_response = self.scanner_client.post(
            "/api/v1/posts/proximity/verify-token/",
            {"token": token},
            format="json",
        )
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invalid", second_response.data["error"].lower())

    def test_verify_token_self_interaction_prevented(self):
        """Test that a user cannot verify their own token."""
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
