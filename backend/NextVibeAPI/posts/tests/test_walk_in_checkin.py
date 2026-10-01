"""
Walk-in check-in: a guest inside the event zone without an approved request
gets one (none or PENDING -> APPROVED) and is checked in in the same request,
on both the direct check-in endpoint and the proximity-token path. REJECTED
stays rejected, and nobody outside the zone gets a request.
"""
from unittest.mock import patch

import h3
from django.core.cache import cache
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from posts.models import EventCheckin, EventRequest, Post, Reputation
from posts.view_pac.event_checkin import approve_walk_in
from user.models import User

CHECKIN_URL = "/api/v1/posts/event-checkin/{}/"
GENERATE_TOKEN_URL = "/api/v1/posts/proximity/generate-token/"
VERIFY_TOKEN_URL = "/api/v1/posts/proximity/verify-token/"

INSIDE = (13.7465, 100.5393)  # Bangkok
OUTSIDE = (18.7883, 98.9853)  # Chiang Mai
EVENT_CELL = h3.latlng_to_cell(*INSIDE, 11)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "walk-in-checkin-test",
        }
    }
)
class WalkInSetup(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(
            username="organizer", email="organizer@test.com", password="pass12345",
        )
        self.guest = User.objects.create_user(
            username="walkin", email="walkin@test.com", password="pass12345",
        )
        self.event = Post.objects.create(
            owner=self.owner,
            about="Walk-in Event",
            is_luma_event=True,
            is_approved=True,
            moderation_status="approved",
            total_supply=50,
            minted_count=0,
            h3_geo=EVENT_CELL,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.guest)

        for target in ("posts.src.collectibles.enqueue", "posts.src.realtime.publish",
                       "posts.src.collectible_mint.tree_status"):
            patcher = patch(target, return_value=None)
            patcher.start()
            self.addCleanup(patcher.stop)
        on_commit = patch("django.db.transaction.on_commit", side_effect=lambda func, using=None, robust=False: func())
        on_commit.start()
        self.addCleanup(on_commit.stop)

    def tearDown(self):
        cache.clear()

    def request_status(self):
        return EventRequest.objects.get(user=self.guest, post=self.event).status



class WalkInCases:
    """The same walk-in cases, run against each check-in path."""

    def assert_checked_in(self, res):
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["verified"])
        self.assertEqual(res.data["message"], "You're verified! Welcome to the event.")
        self.assertTrue(EventCheckin.objects.get(user=self.guest, post=self.event).is_registered)
        rep = Reputation.objects.get(user=self.guest, event=self.event, is_checkin=True)
        self.assertEqual(res.data["earned_points"], rep.points)

    def assert_not_checked_in(self):
        self.assertFalse(EventCheckin.objects.filter(user=self.guest, post=self.event).exists())
        self.assertFalse(Reputation.objects.filter(user=self.guest, event=self.event).exists())

    def test_no_request_inside_zone_is_approved_and_checked_in(self):
        with self.assertLogs("posts.checkin", "INFO") as logs:
            res = self.checkin()
        self.assert_checked_in(res)
        self.assertEqual(self.request_status(), EventRequest.Status.APPROVED)
        self.assertIn(f"checkin.walk_in_approved user={self.guest.pk} post={self.event.id} was=none",
                      "\n".join(logs.output))

    def test_pending_inside_zone_becomes_approved(self):
        EventRequest.objects.create(user=self.guest, post=self.event, status=EventRequest.Status.PENDING)
        with self.assertLogs("posts.checkin", "INFO") as logs:
            res = self.checkin()
        self.assert_checked_in(res)
        self.assertEqual(self.request_status(), EventRequest.Status.APPROVED)
        self.assertIn("was=pending", "\n".join(logs.output))

    def test_rejected_stays_rejected(self):
        EventRequest.objects.create(user=self.guest, post=self.event, status=EventRequest.Status.REJECTED)
        res = self.checkin()
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["verified"])
        self.assertEqual(res.data["message"], "You are not registered for this event.")
        self.assertEqual(res.data["earned_points"], 0)
        self.assertEqual(self.request_status(), EventRequest.Status.REJECTED)
        self.assert_not_checked_in()

    def test_outside_zone_is_400_and_creates_no_request(self):
        res = self.checkin(OUTSIDE)
        self.assertEqual(res.status_code, 400)
        self.assertIn("physically present", res.data["error"])
        self.assertFalse(EventRequest.objects.filter(user=self.guest, post=self.event).exists())
        self.assert_not_checked_in()

    def test_checking_in_twice_is_idempotent(self):
        self.assert_checked_in(self.checkin())
        self.assert_checked_in(self.checkin())
        self.assertEqual(EventRequest.objects.filter(user=self.guest, post=self.event).count(), 1)
        self.assertEqual(EventCheckin.objects.filter(user=self.guest, post=self.event).count(), 1)
        self.assertEqual(
            Reputation.objects.filter(user=self.guest, event=self.event, is_checkin=True).count(), 1
        )


class WalkInEventCheckinViewTests(WalkInCases, WalkInSetup):
    def checkin(self, where=INSIDE):
        return self.client.post(
            CHECKIN_URL.format(self.event.id),
            {"coords": {"lat": where[0], "lng": where[1]}},
            format="json",
        )


class WalkInProximityTokenTests(WalkInCases, WalkInSetup):
    def checkin(self, where=INSIDE):
        organizer = APIClient()
        organizer.force_authenticate(user=self.owner)
        gen = organizer.post(
            GENERATE_TOKEN_URL,
            {"interaction_type": "checkin", "event_id": self.event.id},
            format="json",
        )
        self.assertEqual(gen.status_code, 200)
        res = self.client.post(
            VERIFY_TOKEN_URL,
            {"token": gen.data["token"], "latitude": where[0], "longitude": where[1]},
            format="json",
        )
        if res.status_code == 200:
            self.assertEqual(res.data["interaction_type"], "checkin")
        return res


class ApproveWalkInRaceTests(WalkInSetup):
    def test_integrity_error_rereads_the_row(self):
        """A concurrent check-in created the row between the read and the insert."""
        EventRequest.objects.create(user=self.guest, post=self.event, status=EventRequest.Status.PENDING)
        with patch.object(EventRequest.objects, "get_or_create", side_effect=IntegrityError):
            self.assertTrue(approve_walk_in(self.guest, self.event))
        self.assertEqual(self.request_status(), EventRequest.Status.APPROVED)
