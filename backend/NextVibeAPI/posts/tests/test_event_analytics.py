"""Organizer overview numbers: Proof of Meets with a selfie, Seeker Verified guests, POAP status."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from posts.models import Collectible, EventCheckin, MeetPhoto, Post, Reputation

User = get_user_model()


class EventAnalyticsOverviewTest(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="org@example.com", username="organizer", password="Password123!")
        self.event = Post.objects.create(owner=self.owner, about="Vibeathon", is_luma_event=True,
                                         is_approved=True, moderation_status="approved")
        self.guests = [
            User.objects.create_user(email=f"g{i}@example.com", username=f"guest{i}", password="Password123!")
            for i in range(4)
        ]
        self.guests[0].seeker_verified = True
        self.guests[0].save(update_fields=["seeker_verified"])
        for g in self.guests:
            EventCheckin.objects.create(user=g, post=self.event, is_registered=True)

        # Two meets (mirrored rows); only the first has a selfie both agreed to
        for (a, b), slug in (((0, 1), "meetab"), ((1, 2), "meetbc")):
            for x, y in ((a, b), (b, a)):
                Reputation.objects.create(user=self.guests[x], given_by=self.guests[y], points=15, source="event",
                                          event=self.event, meet_slug=slug)
        MeetPhoto.objects.create(meet_slug="meetab", photographer=self.guests[0], subject=self.guests[1],
                                 raw_key="k", raw_sha256="0" * 64, status=MeetPhoto.Status.MINTED)
        MeetPhoto.objects.create(meet_slug="meetbc", photographer=self.guests[1], subject=self.guests[2],
                                 raw_key="k2", raw_sha256="1" * 64, status=MeetPhoto.Status.REJECTED)

        for g, status in zip(self.guests, (Collectible.Status.MINTED, Collectible.Status.OFFCHAIN,
                                           Collectible.Status.OFFCHAIN, Collectible.Status.QUEUED)):
            Collectible.objects.create(user=g, kind=Collectible.Kind.POAP, source_id=str(self.event.id), post=self.event,
                                       metadata_uri="https://example.com/m.json", name="POAP",
                                       recorded_at=timezone.now(), status=status)
        # Another event's POAP doesn't count
        other = Post.objects.create(owner=self.owner, about="Other", is_luma_event=True)
        Collectible.objects.create(user=self.guests[0], kind=Collectible.Kind.POAP, source_id=str(other.id), post=other,
                                   metadata_uri="https://example.com/m.json", name="POAP",
                                   recorded_at=timezone.now(), status=Collectible.Status.MINTED)

    def test_overview_numbers(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        res = client.get(f"/api/v1/posts/event-analytics/{self.event.id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["proof_of_meets"], 2)
        self.assertEqual(data["meets_with_selfie"], 1)
        self.assertEqual(data["seeker_verified_guests"], 1)
        self.assertEqual(data["poap_status"], {"onchain": 1, "saved": 2, "pending": 1, "failed": 0})
        # Existing fields are unchanged
        self.assertEqual(data["total_irl_taps"], 2)
        self.assertEqual(data["nfc_checkins"], 4)

    def test_empty_event(self):
        event = Post.objects.create(owner=self.owner, about="Empty", is_luma_event=True)
        client = APIClient()
        client.force_authenticate(user=self.owner)
        data = client.get(f"/api/v1/posts/event-analytics/{event.id}/").json()
        self.assertEqual(data["proof_of_meets"], 0)
        self.assertEqual(data["meets_with_selfie"], 0)
        self.assertEqual(data["seeker_verified_guests"], 0)
        self.assertEqual(data["poap_status"], {"onchain": 0, "saved": 0, "pending": 0, "failed": 0})


class EventReplayDataTest(TestCase):
    """event-social-graph carries what the dashboard's replay plays back."""

    def setUp(self):
        self.owner = User.objects.create_user(email="org2@example.com", username="organizer2", password="Password123!")
        self.event = Post.objects.create(owner=self.owner, about="Vibeathon", is_luma_event=True)
        self.a, self.b, self.c = (
            User.objects.create_user(email=f"r{i}@example.com", username=f"replay{i}", password="Password123!")
            for i in range(3)
        )
        EventCheckin.objects.create(user=self.a, post=self.event, is_registered=True)
        EventCheckin.objects.create(user=self.b, post=self.event, is_registered=True)
        EventCheckin.objects.create(user=self.c, post=self.event, is_registered=False)
        start = timezone.now() - timezone.timedelta(hours=3)
        # Written newest first: the replay orders by time, not by id
        for (x, y), slug, when, cell in (((self.b, self.c), "meetbc", start + timezone.timedelta(hours=2), None),
                                         ((self.a, self.b), "meetab", start, "8f1e7689cba0000")):
            ids = [Reputation.objects.create(user=u, given_by=v, points=3, source="event", event=self.event,
                                             h3_geo=cell, meet_slug=slug).id for u, v in ((x, y), (y, x))]
            Reputation.objects.filter(id__in=ids).update(created_at=when)
        # Not a tap: an IRL tap, a check-in award
        Reputation.objects.create(user=self.a, given_by=self.c, points=1, source="irl", meet_slug="irlac")
        Reputation.objects.create(user=self.a, given_by=self.owner, points=9, source="checkin", is_checkin=True,
                                  event=self.event)

    def test_replay_fields(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        data = client.get(f"/api/v1/posts/event-social-graph/{self.event.id}/").json()
        self.assertEqual(data["total_checkins"], 2)
        taps = data["taps"]
        self.assertEqual([(t["user_a"], t["user_b"]) for t in taps],
                         [(self.a.user_id, self.b.user_id), (self.b.user_id, self.c.user_id)])
        self.assertEqual([t["h3"] for t in taps], ["8f1e7689cba0000", None])
        self.assertLess(taps[0]["time"], taps[1]["time"])

    def test_only_the_organizer(self):
        client = APIClient()
        client.force_authenticate(user=self.a)
        res = client.get(f"/api/v1/posts/event-social-graph/{self.event.id}/")
        self.assertEqual(res.status_code, 403)
