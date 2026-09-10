"""
Tests for IRL taps (Tap to Meet outside events).

Covers:
- happy path: both sides +IRL_TAP_POINTS, rows have source='irl', event=None
- same-pair second tap the same UTC day rejected (ALREADY_TAPPED_TODAY)
- per-user daily cap (IRL_TAP_DAILY_LIMIT -> 429 IRL_DAILY_LIMIT)
- self-tap rejected
- irl_taps listing + source on reputation items in user-event-connections
- active-checkin endpoint returns only active checked-in events
- per-event analytics unaffected by IRL rows (event=None)
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from posts.constants import IRL_TAP_DAILY_LIMIT, IRL_TAP_POINTS
from posts.models import EventCheckin, Post, Reputation
from user.models import User

IRL_TAP_URL = "/api/v1/posts/irl-tap/"
CONNECTIONS_URL = "/api/v1/posts/user-event-connections/"
ACTIVE_CHECKIN_URL = "/api/v1/posts/active-checkin/"
GENERATE_TOKEN_URL = "/api/v1/posts/proximity/generate-token/"
VERIFY_TOKEN_URL = "/api/v1/posts/proximity/verify-token/"


class IRLTapTestCase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@test.com", password="pass12345",
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@test.com", password="pass12345",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)

    def tap(self, scanned_user, lat=None, lng=None):
        body = {"scanned_user_id": scanned_user.user_id}
        if lat is not None:
            body["latitude"] = lat
            body["longitude"] = lng
        return self.client.post(IRL_TAP_URL, body, format="json")

    def test_tap_awards_both_sides(self):
        res = self.tap(self.bob, lat=50.45, lng=30.52)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["earned_points"], IRL_TAP_POINTS)
        self.assertEqual(res.data["source"], "irl")
        self.assertEqual(res.data["scanned_user"]["username"], "bob")

        rows = Reputation.objects.filter(source="irl")
        self.assertEqual(rows.count(), 2)
        for row in rows:
            self.assertIsNone(row.event)
            self.assertFalse(row.is_checkin)
            self.assertEqual(row.points, IRL_TAP_POINTS)
            self.assertIsNotNone(row.h3_geo)
        self.assertTrue(rows.filter(user=self.alice, given_by=self.bob).exists())
        self.assertTrue(rows.filter(user=self.bob, given_by=self.alice).exists())

    def test_tap_without_coordinates_ok(self):
        res = self.tap(self.bob)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(Reputation.objects.filter(source="irl").first().h3_geo)

    def test_same_pair_same_day_rejected(self):
        self.assertEqual(self.tap(self.bob).status_code, 200)
        res = self.tap(self.bob)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "ALREADY_TAPPED_TODAY")
        # reverse direction is also blocked (rows are mirrored)
        self.client.force_authenticate(user=self.bob)
        res = self.client.post(
            IRL_TAP_URL, {"scanned_user_id": self.alice.user_id}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "ALREADY_TAPPED_TODAY")

    def test_pair_can_tap_again_next_day(self):
        self.assertEqual(self.tap(self.bob).status_code, 200)
        Reputation.objects.filter(source="irl").update(
            created_at=timezone.now() - timedelta(days=1, hours=1)
        )
        self.assertEqual(self.tap(self.bob).status_code, 200)

    def test_daily_cap(self):
        for i in range(IRL_TAP_DAILY_LIMIT):
            other = User.objects.create_user(
                username=f"peer{i}", email=f"peer{i}@test.com", password="pass12345",
            )
            self.assertEqual(self.tap(other).status_code, 200)
        res = self.tap(self.bob)
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.data["code"], "IRL_DAILY_LIMIT")

    def test_scanned_user_at_cap_rejected(self):
        for i in range(IRL_TAP_DAILY_LIMIT):
            other = User.objects.create_user(
                username=f"peer{i}", email=f"peer{i}@test.com", password="pass12345",
            )
            Reputation.objects.create(
                user=self.bob, given_by=other, points=IRL_TAP_POINTS,
                is_checkin=False, source="irl",
            )
        res = self.tap(self.bob)
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.data["code"], "IRL_DAILY_LIMIT")

    def test_self_tap_rejected(self):
        res = self.tap(self.alice)
        self.assertEqual(res.status_code, 400)

    def test_unknown_user_404(self):
        res = self.client.post(
            IRL_TAP_URL, {"scanned_user_id": 999999}, format="json"
        )
        self.assertEqual(res.status_code, 404)

    def test_connections_listing_includes_irl_taps(self):
        self.tap(self.bob, lat=50.45, lng=30.52)
        res = self.client.get(CONNECTIONS_URL)
        self.assertEqual(res.status_code, 200)

        taps = res.data["irl_taps"]
        self.assertEqual(len(taps), 1)
        self.assertEqual(taps[0]["username"], "bob")
        self.assertEqual(taps[0]["points"], IRL_TAP_POINTS)
        self.assertIsNotNone(taps[0]["lat"])

        irl_items = [i for i in res.data["reputation_items"] if i["type"] == "irl_tap"]
        self.assertEqual(len(irl_items), 1)
        self.assertEqual(irl_items[0]["source"], "irl")
        # every reputation item carries a source
        for item in res.data["reputation_items"]:
            self.assertIn("source", item)

        # the tap must not appear under any event
        for event in res.data["events"]:
            self.assertEqual(event["connections"], [])

    def test_event_analytics_unaffected_by_irl_rows(self):
        event = Post.objects.create(
            owner=self.bob, about="Meetup", is_luma_event=True, is_approved=True,
            moderation_status="approved",
        )
        EventCheckin.objects.create(user=self.alice, post=event, is_registered=True)
        Reputation.objects.create(
            user=self.alice, given_by=self.bob, points=5, is_checkin=True,
            event=event, source="checkin",
        )
        self.tap(self.bob)

        event_rows = Reputation.objects.filter(event=event)
        self.assertEqual(event_rows.count(), 1)
        self.assertEqual(
            Reputation.objects.filter(event=event, is_checkin=False, post__isnull=True).count(),
            0,
        )

    def test_irl_proximity_token_flow(self):
        # bob broadcasts an IRL token (no event_id), alice scans it
        self.client.force_authenticate(user=self.bob)
        res = self.client.post(
            GENERATE_TOKEN_URL, {"interaction_type": "irl"}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        token = res.data["token"]

        self.client.force_authenticate(user=self.alice)
        res = self.client.post(VERIFY_TOKEN_URL, {"token": token}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["interaction_type"], "irl")
        self.assertEqual(res.data["source"], "irl")
        self.assertEqual(res.data["scanned_user"]["username"], "bob")
        self.assertEqual(Reputation.objects.filter(source="irl").count(), 2)

    def test_active_checkin_endpoint(self):
        active_event = Post.objects.create(
            owner=self.bob, about="Tonight", is_luma_event=True, is_approved=True,
            moderation_status="approved",
            luma_event_start_time=timezone.now() - timedelta(hours=1),
            luma_event_end_time=timezone.now() + timedelta(hours=3),
        )
        ended_event = Post.objects.create(
            owner=self.bob, about="Last week", is_luma_event=True, is_approved=True,
            moderation_status="approved",
            luma_event_start_time=timezone.now() - timedelta(days=8),
            luma_event_end_time=timezone.now() - timedelta(days=7),
        )
        EventCheckin.objects.create(user=self.alice, post=active_event, is_registered=True)
        EventCheckin.objects.create(user=self.alice, post=ended_event, is_registered=True)

        res = self.client.get(ACTIVE_CHECKIN_URL)
        self.assertEqual(res.status_code, 200)
        events = res.data["active_events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_id"], active_event.id)
        self.assertEqual(events[0]["event_name"], "Tonight")
