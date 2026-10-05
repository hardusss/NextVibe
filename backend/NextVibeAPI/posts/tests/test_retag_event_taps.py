"""manage.py retag_event_taps: IRL taps made at an event become that event's taps."""
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone as dt_timezone
from io import StringIO

import h3
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from posts.models import Collectible, EventCheckin, EventRequest, MeetPhoto, Post, Reputation
from posts.src.meets import tap_slug
from user.models import User

VENUE = (49.8355, 24.0144)  # Lviv Polytechnic
FAR = (49.8420, 24.0310)  # about 1.4 km away
DAY1 = datetime(2026, 10, 1, 7, 0, tzinfo=dt_timezone.utc)  # 10:00 Kyiv
DAY2 = datetime(2026, 10, 2, 7, 0, tzinfo=dt_timezone.utc)


def cell(latlng, res=15):
    return h3.latlng_to_cell(*latlng, res)


class RetagEventTapsTest(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="organizer", email="org@example.com", password="Password123!")
        self.day1 = self._event("Vibeathon day 1", DAY1)
        self.day2 = self._event("Vibeathon day 2", DAY2)
        self.people = {
            name: User.objects.create_user(username=name, email=f"{name}@example.com", password="Password123!")
            for name in ("ana", "bo", "cy", "di")
        }
        self.backup_dir = tempfile.mkdtemp()

    def _event(self, title, start):
        return Post.objects.create(
            owner=self.owner, about=title, is_luma_event=True, is_approved=True, moderation_status="approved",
            h3_geo=cell(VENUE, 11), luma_event_start_time=start, luma_event_end_time=start + timedelta(hours=11),
        )

    def _irl(self, a, b, when, where=VENUE, where_b=None, h3_geo=True):
        """Both rows of one IRL tap, as process_irl_tap writes them."""
        a, b = self.people[a], self.people[b]
        slug = tap_slug(a.user_id, b.user_id, "irl", when=when)
        rows = []
        for user, other, place in ((a, b, where), (b, a, where_b or where)):
            row = Reputation.objects.create(user=user, given_by=other, points=1, is_checkin=False, event=None,
                                            h3_geo=cell(place) if h3_geo else None, source="irl", meet_slug=slug)
            rows.append(row)
        Reputation.objects.filter(id__in=[r.id for r in rows]).update(created_at=when)
        return slug

    def _run(self, *args):
        out = StringIO()
        call_command("retag_event_taps", *args, "--tz", "Europe/Kyiv", "--backup-dir", self.backup_dir, stdout=out)
        return out.getvalue()

    def _events_args(self, *events):
        return [arg for e in events for arg in ("--event", str(e.id))]

    def _state(self, slug):
        return sorted(Reputation.objects.filter(meet_slug=slug).values_list("source", "event_id"))

    # ── Selection ────────────────────────────────────────────────────────

    def test_dry_run_lists_and_changes_nothing(self):
        slug = self._irl("ana", "bo", DAY1 + timedelta(hours=2))
        out = self._run(*self._events_args(self.day1))
        self.assertIn(f"Event {self.day1.id}: Vibeathon day 1", out)
        self.assertIn("2026-10-01 10:00:00 EEST", out)  # the window, in Kyiv time
        self.assertIn("Would move 1 meets", out)
        self.assertIn(slug, out)
        self.assertIn("@ana ↔ @bo", out)
        self.assertIn("Dry run", out)
        self.assertEqual(self._state(slug), [("irl", None), ("irl", None)])

    def test_time_window(self):
        before = self._irl("ana", "bo", DAY1 - timedelta(minutes=1))
        inside = self._irl("ana", "cy", DAY1 + timedelta(hours=3))
        after = self._irl("ana", "di", DAY1 + timedelta(hours=11, minutes=1))
        self._run(*self._events_args(self.day1), "--apply")
        self.assertEqual(self._state(before), [("irl", None), ("irl", None)])
        self.assertEqual(self._state(inside), [("event", self.day1.id)] * 2)
        self.assertEqual(self._state(after), [("irl", None), ("irl", None)])

    def test_each_tap_goes_to_the_post_of_its_day(self):
        first = self._irl("ana", "bo", DAY1 + timedelta(hours=1))
        second = self._irl("cy", "di", DAY2 + timedelta(hours=1))
        self._run(*self._events_args(self.day1, self.day2), "--apply")
        self.assertEqual(self._state(first), [("event", self.day1.id)] * 2)
        self.assertEqual(self._state(second), [("event", self.day2.id)] * 2)

    def test_geofence(self):
        far = self._irl("ana", "bo", DAY1 + timedelta(hours=1), where=FAR)
        no_location = self._irl("ana", "cy", DAY1 + timedelta(hours=1), h3_geo=False)
        near = self._irl("ana", "di", DAY1 + timedelta(hours=1))
        out = self._run(*self._events_args(self.day1), "--apply")
        self.assertIn("outside the geofence", out)
        self.assertIn("no location (h3_geo) on a row", out)
        self.assertEqual(self._state(far), [("irl", None), ("irl", None)])
        self.assertEqual(self._state(no_location), [("irl", None), ("irl", None)])
        self.assertEqual(self._state(near), [("event", self.day1.id)] * 2)

    def test_both_rows_move_or_neither(self):
        # One side tapped inside the zone, the other's row says outside
        split = self._irl("ana", "bo", DAY1 + timedelta(hours=1), where=VENUE, where_b=FAR)
        # One row written inside the window, the other a moment before it opened
        edge = self._irl("cy", "di", DAY1 + timedelta(seconds=30))
        first = Reputation.objects.filter(meet_slug=edge).order_by("id").first()
        Reputation.objects.filter(id=first.id).update(created_at=DAY1 - timedelta(seconds=30))
        self._run(*self._events_args(self.day1), "--apply")
        self.assertEqual(self._state(split), [("irl", None), ("irl", None)])
        self.assertEqual(self._state(edge), [("irl", None), ("irl", None)])

    def test_pair_with_an_event_tap_is_skipped(self):
        ana, bo = self.people["ana"], self.people["bo"]
        for user, other in ((ana, bo), (bo, ana)):
            Reputation.objects.create(user=user, given_by=other, points=2, event=self.day1, source="event",
                                      h3_geo=cell(VENUE), meet_slug="existingslug")
        slug = self._irl("ana", "bo", DAY1 + timedelta(hours=2))
        out = self._run(*self._events_args(self.day1), "--apply")
        self.assertIn("pair already has an event tap at this event", out)
        self.assertEqual(self._state(slug), [("irl", None), ("irl", None)])

    def test_two_irl_meets_of_one_pair_in_one_event_move_only_the_first(self):
        long_event = self._event("Vibeathon", DAY1)
        Post.objects.filter(id=long_event.id).update(luma_event_end_time=DAY2 + timedelta(hours=11))
        first = self._irl("ana", "bo", DAY1 + timedelta(hours=1))
        second = self._irl("ana", "bo", DAY2 + timedelta(hours=1))
        out = self._run(*self._events_args(long_event), "--apply")
        self.assertIn(f"pair already gets an earlier meet ({first})", out)
        self.assertEqual(self._state(first), [("event", long_event.id)] * 2)
        self.assertEqual(self._state(second), [("irl", None), ("irl", None)])

    # ── Apply and revert ─────────────────────────────────────────────────

    def test_apply_then_revert_restores_exact_values(self):
        slug = self._irl("ana", "bo", DAY1 + timedelta(hours=1))
        other = self._irl("cy", "di", DAY1 + timedelta(hours=2), where=FAR)  # stays
        fields = ("id", "user_id", "given_by_id", "points", "h3_geo", "meet_slug", "created_at", "is_checkin",
                  "post_id", "post_type")
        before = list(Reputation.objects.order_by("id").values(*fields, "source", "event_id"))

        out = self._run(*self._events_args(self.day1), "--apply")
        backups = os.listdir(self.backup_dir)
        self.assertEqual(len(backups), 1)
        path = os.path.join(self.backup_dir, backups[0])
        self.assertIn(path, out)
        with open(path) as f:
            backup = json.load(f)
        self.assertEqual(sorted((r["source"], r["event_id"], r["new_event_id"]) for r in backup["rows"]),
                         [("irl", None, self.day1.id)] * 2)
        self.assertEqual(self._state(slug), [("event", self.day1.id)] * 2)
        # Nothing else on the rows moved
        self.assertEqual(list(Reputation.objects.order_by("id").values(*fields)), [
            {k: row[k] for k in fields} for row in before
        ])

        out = StringIO()
        call_command("retag_event_taps", "--revert", path, stdout=out)
        self.assertIn("Reverted 2 rows", out.getvalue())
        self.assertEqual(list(Reputation.objects.order_by("id").values(*fields, "source", "event_id")), before)
        self.assertEqual(self._state(other), [("irl", None), ("irl", None)])

    def test_revert_refuses_rows_changed_after_the_move(self):
        slug = self._irl("ana", "bo", DAY1 + timedelta(hours=1))
        self._run(*self._events_args(self.day1), "--apply")
        path = os.path.join(self.backup_dir, os.listdir(self.backup_dir)[0])
        Reputation.objects.filter(meet_slug=slug, user=self.people["ana"]).update(event=self.day2)
        with self.assertRaises(CommandError):
            call_command("retag_event_taps", "--revert", path, stdout=StringIO())
        # All or nothing: the untouched row is still the event's
        self.assertEqual(self._state(slug), sorted([("event", self.day1.id), ("event", self.day2.id)]))

    def test_check_ins_and_collectibles_are_untouched(self):
        ana, bo = self.people["ana"], self.people["bo"]
        EventCheckin.objects.create(user=ana, post=self.day1, is_registered=True)
        EventRequest.objects.create(user=bo, post=self.day1, status=EventRequest.Status.PENDING)
        slug = self._irl("ana", "bo", DAY1 + timedelta(hours=1))
        for user, other in ((ana, bo), (bo, ana)):
            Collectible.objects.create(user=user, counterpart=other, kind=Collectible.Kind.MEET, source_id=slug,
                                       metadata_uri="https://example.com/m.json", name="Proof of Meet",
                                       recorded_at=timezone.now(), status=Collectible.Status.MINTED,
                                       metadata={"attributes": [{"trait_type": "Tier", "value": "In person"}]})
        MeetPhoto.objects.create(meet_slug=slug, photographer=ana, subject=bo, raw_key="k", raw_sha256="0" * 64,
                                 status=MeetPhoto.Status.MINTED)

        def snapshot():
            return (
                list(EventCheckin.objects.order_by("id").values()),
                list(EventRequest.objects.order_by("id").values()),
                list(Collectible.objects.order_by("id").values()),
                list(MeetPhoto.objects.order_by("id").values()),
                list(Reputation.objects.filter(is_checkin=True).values()),
            )

        before = snapshot()
        out = self._run(*self._events_args(self.day1), "--apply")
        self.assertIn("already minted as a Proof of Meet: 1", out)
        self.assertIn("with a selfie (approved or minted): 1", out)
        self.assertIn("PEER VERIFIED 1", out)  # only one of the two checked in
        self.assertEqual(self._state(slug), [("event", self.day1.id)] * 2)
        self.assertEqual(snapshot(), before)

        path = os.path.join(self.backup_dir, os.listdir(self.backup_dir)[0])
        call_command("retag_event_taps", "--revert", path, stdout=StringIO())
        self.assertEqual(snapshot(), before)
