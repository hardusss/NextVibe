"""Organizer tap map: check-in zone, event times and tap timestamps."""
from datetime import datetime, timezone as dt_timezone
from unittest import mock

import h3
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from posts.constants import GEOFENCE_RINGS
from posts.models import Post, Reputation
from posts.src import geocode
from posts.view_pac.event_checkin import _verify_event_geofence

User = get_user_model()

BANGKOK = (13.7465, 100.5393)
EVENT_CELL = h3.latlng_to_cell(*BANGKOK, 11)


class EventTapsTest(TestCase):
    def setUp(self):
        cache.clear()  # geocode answers live in locmem
        patcher = mock.patch.object(geocode, "lookup", return_value=("Bangkok", "TH"))
        self.lookup = patcher.start()
        self.addCleanup(patcher.stop)

        self.owner = User.objects.create_user(email="org@example.com", username="organizer", password="Password123!")
        self.alice = User.objects.create_user(email="alice@example.com", username="alice", password="Password123!")
        self.bob = User.objects.create_user(email="bob@example.com", username="bob", password="Password123!")
        self.event = Post.objects.create(
            owner=self.owner, about="Vibeathon", is_luma_event=True, is_approved=True,
            moderation_status="approved", h3_geo=EVENT_CELL,
            luma_event_start_time=datetime(2026, 10, 1, 10, 0, tzinfo=dt_timezone.utc),
            luma_event_end_time=datetime(2026, 10, 2, 16, 0, tzinfo=dt_timezone.utc),
        )
        tap_cell = h3.latlng_to_cell(*BANGKOK, 15)
        Reputation.objects.create(user=self.alice, given_by=self.owner, points=10, is_checkin=True,
                                  source="checkin", event=self.event, h3_geo=tap_cell)
        for user, other in ((self.alice, self.bob), (self.bob, self.alice)):
            Reputation.objects.create(user=user, given_by=other, points=15, source="event",
                                      event=self.event, h3_geo=tap_cell)

    def get(self, event):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        res = client.get(f"/api/v1/posts/event-taps/{event.id}/")
        self.assertEqual(res.status_code, 200)
        return res.json()

    def test_returns_the_check_in_zone_and_event_times(self):
        data = self.get(self.event)
        self.assertEqual(data["h3_geo"], EVENT_CELL)
        self.assertEqual(data["zone_rings"], GEOFENCE_RINGS)
        self.assertEqual(data["zone_rings"], 2)
        self.assertTrue(data["start_time"].startswith("2026-10-01T10:00:00"))
        self.assertTrue(data["end_time"].startswith("2026-10-02T16:00:00"))
        self.assertEqual(data["timezone"], "Asia/Bangkok")

    def test_every_tap_has_a_timestamp(self):
        taps = self.get(self.event)["taps"]
        self.assertEqual(sorted(t["type"] for t in taps), ["checkin", "networking"])  # mirrored pair = one tap
        for tap in taps:
            self.assertIsNotNone(datetime.fromisoformat(tap["created_at"].replace("Z", "+00:00")))

    def test_event_without_a_cell_has_no_zone(self):
        event = Post.objects.create(owner=self.owner, about="Old event", is_luma_event=True,
                                    is_approved=True, moderation_status="approved")
        data = self.get(event)
        self.assertIsNone(data["h3_geo"])
        self.assertIsNone(data["timezone"])
        self.assertIsNone(data["start_time"])
        self.assertEqual(data["taps"], [])

    def test_timezone_is_optional_when_the_geocoder_is_down(self):
        self.lookup.side_effect = geocode.LookupFailed("offline")
        data = self.get(self.event)
        self.assertEqual(data["h3_geo"], EVENT_CELL)
        self.assertIn(data["timezone"], (None, "Asia/Bangkok"))  # nearest zone without a country


class GeofenceRingsTest(TestCase):
    """The zone drawn on the organizer map is exactly what check-in accepts."""

    def setUp(self):
        owner = User.objects.create_user(email="org2@example.com", username="organizer2", password="Password123!")
        self.event = Post.objects.create(owner=owner, about="Meetup", is_luma_event=True, h3_geo=EVENT_CELL)

    def at_distance(self, k):
        cell = next(iter(set(h3.grid_ring(EVENT_CELL, k))))
        return h3.cell_to_latlng(cell)

    def test_edge_of_the_zone_is_accepted_and_one_ring_out_is_rejected(self):
        self.assertIsNone(_verify_event_geofence(self.event, *self.at_distance(GEOFENCE_RINGS)))
        self.assertIsNotNone(_verify_event_geofence(self.event, *self.at_distance(GEOFENCE_RINGS + 1)))
