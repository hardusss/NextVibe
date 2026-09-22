"""
Proof of Meet: one slug per tap, the backfill, GET /api/v1/meet/<slug> and
its card PNG.

Covers:
- taps write one slug on both rows (IRL and event); repeats and races share it
- backfill: idempotent, slugs stable across runs, grouping (day / event / midnight)
- JSON: people, tier, place, local time, meet numbers, pair history; 404s for
  unknown slugs, blocked pairs, blocked viewers and banned accounts; deleted
  accounts keep their row with the default avatar
- PNG: both sizes for irl / organizer / peer taps, missing avatar, long names,
  no location, Seeker on both sides; cache headers, ETag, 404 card, rate limit
- history lists carry the slug only on your own profile
- geocoding is cached; time zones come from tzdata
"""
import io
import shutil
import tempfile
from datetime import datetime, timedelta, timezone as dt_timezone
from io import StringIO
from unittest import mock

import h3
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from posts.models import EventCheckin, EventRequest, Post, Reputation
from posts.src import geocode, meet_card, meets
from posts.view_pac.meet_share import MeetCardThrottle
from user.models import Block, User

IRL_TAP_URL = "/api/v1/posts/irl-tap/"
EVENT_TAP_URL = "/api/v1/posts/event-nfc-connect/"
CONNECTIONS_URL = "/api/v1/posts/user-event-connections/"
KYIV = (50.4501, 30.5234)
KYIV_CELL = h3.latlng_to_cell(*KYIV, 9)


def make_user(name, **extra):
    return User.objects.create_user(username=name, email=f"{name}@test.com", password="pass12345", **extra)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def png_size(content):
    return Image.open(io.BytesIO(content)).size


def at(day, hour=12, minute=0):
    return datetime(2026, 9, day, hour, minute, tzinfo=dt_timezone.utc)


class MeetTestCase(TestCase):
    def setUp(self):
        cache.clear()  # geocode answers and throttles live in locmem
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        overrides = override_settings(MEDIA_ROOT=media, PUBLIC_API_URL="https://api.nextvibe.io")
        overrides.enable()
        self.addCleanup(overrides.disable)
        # No network in tests: every H3 cell is in Kyiv, Ukraine
        patcher = mock.patch.object(geocode, "lookup", return_value=("Kyiv", "UA"))
        self.lookup = patcher.start()
        self.addCleanup(patcher.stop)

        self.alice = make_user("alice")
        self.bob = make_user("bob")
        self.api = APIClient()

    def tearDown(self):
        cache.clear()

    def add_tap(self, a, b, when, source="irl", event=None, points=(1, 1), slug=None, h3_geo=KYIV_CELL):
        """Two mirrored rows as a tap writes them, dated `when` (rows from before slugs have none)."""
        rows = [
            Reputation.objects.create(user=user, given_by=other, points=p, source=source, event=event,
                                      h3_geo=h3_geo, meet_slug=slug)
            for (user, other), p in zip(((a, b), (b, a)), points)
        ]
        Reputation.objects.filter(id__in=[r.id for r in rows]).update(created_at=when)
        return rows

    def backfill(self, *args):
        out = StringIO()
        call_command("backfill_meet_slugs", *args, stdout=out)
        return out.getvalue()

    def slug_of(self, a, b, **filters):
        return Reputation.objects.filter(user=a, given_by=b, **filters).values_list("meet_slug", flat=True).first()

    def meet_json(self, slug, client=None):
        return (client or self.api).get(f"/api/v1/meet/{slug}")

    def card(self, slug, **params):
        return self.api.get(f"/api/v1/meet/{slug}/card.png", params)

    def event(self, owner, **extra):
        defaults = dict(about="Superteam Ukraine Vibeathon", is_luma_event=True, is_approved=True,
                        moderation_status="approved", h3_geo=h3.latlng_to_cell(*KYIV, 9))
        defaults.update(extra)
        return Post.objects.create(owner=owner, **defaults)

    def check_in(self, user, event):
        EventRequest.objects.create(user=user, post=event, status=EventRequest.Status.APPROVED)
        EventCheckin.objects.create(user=user, post=event, is_registered=True)


class TapWritesSlugTests(MeetTestCase):
    def test_irl_tap_puts_one_slug_on_both_rows(self):
        res = client_for(self.alice).post(IRL_TAP_URL, {"scanned_user_id": self.bob.user_id,
                                                        "latitude": KYIV[0], "longitude": KYIV[1]}, format="json")
        self.assertEqual(res.status_code, 200)
        slugs = set(Reputation.objects.filter(source="irl").values_list("meet_slug", flat=True))
        self.assertEqual(len(slugs), 1)
        slug = slugs.pop()
        self.assertTrue(meets.is_slug(slug))
        self.assertEqual(res.data["meet_slug"], slug)
        self.assertEqual(res.data["meet_url"], f"https://nextvibe.io/u/meet/{slug}")
        self.assertEqual(slug, meets.tap_slug(self.bob.user_id, self.alice.user_id, "irl"))

    def test_repeat_tap_same_day_writes_nothing_and_names_the_meet(self):
        alice = client_for(self.alice)
        first = alice.post(IRL_TAP_URL, {"scanned_user_id": self.bob.user_id}, format="json")
        # Both pressed Confirm at once: the other phone's request lost
        second = client_for(self.bob).post(IRL_TAP_URL, {"scanned_user_id": self.alice.user_id}, format="json")
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data["code"], "ALREADY_TAPPED_TODAY")
        self.assertEqual(second.data["meet_slug"], first.data["meet_slug"])
        self.assertEqual(Reputation.objects.filter(source="irl").count(), 2)  # no zero-REP row

    def test_event_tap_puts_one_slug_on_both_rows(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)
        res = client_for(self.alice).post(EVENT_TAP_URL, {
            "event_id": event.id, "scanned_user_id": self.bob.user_id, "latitude": KYIV[0], "longitude": KYIV[1],
        }, format="json")
        self.assertEqual(res.status_code, 200)
        rows = Reputation.objects.filter(source="event", event=event)
        self.assertEqual(rows.count(), 2)
        self.assertEqual(len({r.meet_slug for r in rows}), 1)
        self.assertEqual(res.data["meet_slug"], rows.first().meet_slug)
        again = client_for(self.alice).post(EVENT_TAP_URL, {
            "event_id": event.id, "scanned_user_id": self.bob.user_id, "latitude": KYIV[0], "longitude": KYIV[1],
        }, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["meet_slug"], rows.first().meet_slug)

    def test_slug_is_unguessable_and_stable(self):
        a = meets.tap_slug(1, 2, "irl", when=at(21))
        self.assertEqual(a, meets.tap_slug(2, 1, "irl", when=at(21, 23, 59)))  # same pair, same UTC day
        self.assertNotEqual(a, meets.tap_slug(1, 2, "irl", when=at(22)))
        self.assertNotEqual(a, meets.tap_slug(1, 3, "irl", when=at(21)))
        self.assertNotEqual(meets.tap_slug(1, 2, "event", event_id=7), meets.tap_slug(1, 2, "event", event_id=8))
        neighbours = {meets.tap_slug(1, n, "irl", when=at(21)) for n in range(2, 50)}
        self.assertEqual(len(neighbours), 48)
        for slug in neighbours:
            self.assertRegex(slug, r"^[0-9A-Za-z]{12}$")
            self.assertFalse(slug.isdigit())


class BackfillTests(MeetTestCase):
    def test_backfill_groups_taps_into_meets(self):
        carol = make_user("carol")
        event = self.event(carol)
        self.add_tap(self.alice, self.bob, at(21, 16, 42))
        self.add_tap(self.alice, self.bob, at(22, 9, 0))  # next day: another meet
        self.add_tap(self.alice, carol, at(21, 17), source="event", event=event, points=(9, 2))
        # A race wrote a second pair of rows the same day: still one meet
        self.add_tap(self.bob, self.alice, at(21, 16, 42))
        # Not taps: check-ins, post awards, rows with no points
        Reputation.objects.create(user=self.alice, given_by=carol, points=12, is_checkin=True, source="checkin", event=event)
        Reputation.objects.create(user=self.alice, given_by=carol, points=2, source="post", post_type="collect")
        Reputation.objects.create(user=self.alice, given_by=carol, points=0, source="irl")

        out = self.backfill()
        self.assertIn("Set meet_slug on 8 rows (3 meets)", out)
        irl = Reputation.objects.filter(source="irl", points__gt=0)
        day1 = set(irl.filter(created_at__date=at(21).date()).values_list("meet_slug", flat=True))
        day2 = set(irl.filter(created_at__date=at(22).date()).values_list("meet_slug", flat=True))
        ev = set(Reputation.objects.filter(source="event").values_list("meet_slug", flat=True))
        self.assertEqual([len(day1), len(day2), len(ev)], [1, 1, 1])
        self.assertEqual(len(day1 | day2 | ev), 3)
        self.assertEqual(day1.pop(), meets.tap_slug(self.alice.user_id, self.bob.user_id, "irl", when=at(21)))
        self.assertEqual(ev.pop(), meets.tap_slug(self.alice.user_id, carol.user_id, "event", event_id=event.id))
        self.assertEqual(Reputation.objects.filter(meet_slug__isnull=False).count(), 8)

    def test_backfill_is_idempotent_and_stable(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        first = dict(Reputation.objects.values_list("id", "meet_slug"))
        self.assertIn("Set meet_slug on 0 rows (0 meets)", self.backfill())
        self.assertEqual(dict(Reputation.objects.values_list("id", "meet_slug")), first)
        # Wiped and run again: the same slugs come back
        Reputation.objects.update(meet_slug=None)
        self.backfill()
        self.assertEqual(dict(Reputation.objects.values_list("id", "meet_slug")), first)

    def test_dry_run_writes_nothing(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.assertIn("[dry-run] would set meet_slug on 2 rows", self.backfill("--dry-run"))
        self.assertFalse(Reputation.objects.filter(meet_slug__isnull=False).exists())

    def test_rows_of_one_tap_across_midnight_stay_one_meet(self):
        rows = self.add_tap(self.alice, self.bob, at(21, 23, 59))
        Reputation.objects.filter(id=rows[1].id).update(created_at=at(22, 0, 0))
        self.backfill()
        self.assertEqual(len(set(Reputation.objects.values_list("meet_slug", flat=True))), 1)

    def test_stored_slug_is_kept_and_reused(self):
        self.add_tap(self.alice, self.bob, at(21), slug="StoredSlug01")
        self.add_tap(self.bob, self.alice, at(21))  # raced copy without a slug
        self.backfill()
        self.assertEqual(set(Reputation.objects.values_list("meet_slug", flat=True)), {"StoredSlug01"})

    def test_pair_option_prints_meet_links(self):
        self.add_tap(self.alice, self.bob, at(21, 16, 42))
        out = self.backfill("--pair", "alice", "@bob")
        slug = self.slug_of(self.alice, self.bob)
        self.assertIn(f"2026-09-21 16:42 UTC  irl    https://nextvibe.io/u/meet/{slug}", out)


class MeetJsonTests(MeetTestCase):
    def test_first_meet(self):
        others = [make_user(f"friend{i}") for i in range(13)]
        for i, other in enumerate(others):  # alice's 13 earlier meets
            self.add_tap(self.alice, other, at(1 + i))
        self.add_tap(self.alice, self.bob, at(21, 16, 42))
        self.backfill()
        slug = self.slug_of(self.alice, self.bob)

        res = self.meet_json(slug)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "public, max-age=60")
        data = res.data
        self.assertEqual(data["slug"], slug)
        self.assertEqual(data["url"], f"https://nextvibe.io/u/meet/{slug}")
        self.assertEqual((data["tier"], data["tier_label"]), ("in_person", "IN PERSON"))
        self.assertEqual(data["place"], "Kyiv")
        self.assertEqual(data["timezone"], "Europe/Kyiv")
        self.assertEqual(data["when_line"], "Kyiv · Mon, Sep 21 · 19:42")  # 16:42 UTC is 19:42 in Kyiv
        self.assertIsNone(data["event"])
        a, b = data["users"]
        self.assertEqual((a["username"], a["meet_number"], a["points"]), ("alice", 14, 1))
        self.assertEqual((b["username"], b["meet_number"], b["points"]), ("bob", 1, 1))
        self.assertIsNone(a["avatar"])  # the default silhouette is never shown
        self.assertEqual(data["pair"]["count"], 1)
        self.assertEqual(data["history_line"], "+1 REP each · #14 for @alice · #1 for @bob")
        self.assertEqual(data["proof_line"], "Proof of Meet · recorded on NextVibe")
        self.assertIsNone(data["asset_id"])
        self.assertEqual(data["title"], "@alice met @bob · NextVibe")
        self.assertIn("Met in person in Kyiv on Mon, Sep 21.", data["description"])
        self.assertTrue(data["card_url"].startswith(f"https://api.nextvibe.io/api/v1/meet/{slug}/card.png?v=og&rev="))
        self.assertIn("?v=story&rev=", data["story_url"])
        self.assertNotIn("lat", str(data))
        self.assertNotIn(KYIV_CELL, str(data))  # never coordinates

    def test_trailing_slash_works_too(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        self.assertEqual(self.api.get(f"/api/v1/meet/{self.slug_of(self.alice, self.bob)}/").status_code, 200)

    def test_pair_history(self):
        self.add_tap(self.alice, self.bob, at(19))
        self.add_tap(self.bob, self.alice, at(20))
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        latest = self.slug_of(self.alice, self.bob, created_at=at(21))
        data = self.meet_json(latest).data
        self.assertEqual(data["pair"]["count"], 3)
        self.assertEqual(data["history_line"], "3rd time meeting @bob · first: Sep 19")
        self.assertIn("Their 3rd meeting.", data["description"])
        # The earlier ones keep their own numbers
        self.assertEqual(self.meet_json(self.slug_of(self.alice, self.bob, created_at=at(19))).data["pair"]["count"], 1)
        self.assertEqual(self.meet_json(self.slug_of(self.alice, self.bob, created_at=at(20))).data["pair"]["count"], 2)

    def test_no_location_says_in_person_and_utc(self):
        self.add_tap(self.alice, self.bob, at(21, 16, 42), h3_geo=None)
        self.backfill()
        data = self.meet_json(self.slug_of(self.alice, self.bob)).data
        self.assertIsNone(data["place"])
        self.assertEqual(data["when_line"], "In person · Mon, Sep 21 · 16:42 UTC")

    def test_event_meet_with_organizer_approval(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)
        self.check_in(self.bob, event)
        self.add_tap(self.alice, self.bob, at(26, 16, 42), source="event", event=event, points=(9, 2))
        self.backfill()
        data = self.meet_json(self.slug_of(self.alice, self.bob)).data
        self.assertEqual((data["tier"], data["tier_label"]), ("organizer_verified", "ORGANIZER VERIFIED"))
        self.assertEqual(data["event"], {"id": event.id, "name": "Superteam Ukraine Vibeathon"})
        self.assertEqual(data["history_line"], "+9 & +2 REP · #1 for @alice · #1 for @bob")
        self.assertIn("Met at Superteam Ukraine Vibeathon in Kyiv on Sat, Sep 26.", data["description"])

    def test_event_meet_via_geofence_only_is_peer_verified(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)  # bob never got approved
        self.add_tap(self.alice, self.bob, at(26), source="event", event=event, points=(2, 2))
        self.backfill()
        self.assertEqual(self.meet_json(self.slug_of(self.alice, self.bob)).data["tier"], "peer_verified")

    def test_hidden_event_keeps_the_tier_but_not_its_name(self):
        event = self.event(make_user("host"), is_hide=True)
        self.add_tap(self.alice, self.bob, at(26), source="event", event=event, points=(2, 2))
        self.backfill()
        data = self.meet_json(self.slug_of(self.alice, self.bob)).data
        self.assertEqual(data["source"], "event")
        self.assertIsNone(data["event"])

    def test_unknown_and_malformed_slugs_404(self):
        for slug in ("AAAAAAAAAAAA", "short", "abc-def_ghi!", "a" * 40):
            res = self.meet_json(slug)
            self.assertEqual(res.status_code, 404, slug)
            self.assertEqual(res["Cache-Control"], "no-store")

    def test_blocked_pair_404(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        slug = self.slug_of(self.alice, self.bob)
        Block.objects.create(blocker=self.bob, blocked=self.alice)
        self.assertEqual(self.meet_json(slug).status_code, 404)
        self.assertEqual(self.card(slug).status_code, 404)

    def test_viewer_who_blocked_someone_in_it_gets_404(self):
        carol = make_user("carol")
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        slug = self.slug_of(self.alice, self.bob)
        Block.objects.create(blocker=carol, blocked=self.alice)
        res = self.meet_json(slug, client_for(carol))
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.meet_json(slug).status_code, 200)  # the public page doesn't know carol
        own = self.meet_json(slug, client_for(self.bob))
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own["Cache-Control"], "private, no-store")

    def test_stale_token_is_just_anonymous(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        res = self.api.get(f"/api/v1/meet/{self.slug_of(self.alice, self.bob)}", HTTP_AUTHORIZATION="Bearer expired.token.here")
        self.assertEqual(res.status_code, 200)

    def test_banned_account_hides_the_meet(self):
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        slug = self.slug_of(self.alice, self.bob)
        User.all_objects.filter(user_id=self.bob.user_id).update(is_baned=True)
        self.assertEqual(self.meet_json(slug).status_code, 404)

    def test_deleted_account_keeps_the_meet_with_default_avatar(self):
        default_storage.save("images/bob.jpg", ContentFile(_jpeg()))
        User.objects.filter(user_id=self.bob.user_id).update(avatar="images/bob.jpg")
        self.add_tap(self.alice, self.bob, at(21))
        self.backfill()
        slug = self.slug_of(self.alice, self.bob)
        self.assertIsNotNone(self.meet_json(slug).data["users"][1]["avatar"])

        res = client_for(User.objects.get(user_id=self.bob.user_id)).delete("/api/v1/users/delete-account/")
        self.assertEqual(res.status_code, 200)
        res = self.meet_json(slug)
        self.assertEqual(res.status_code, 200)
        gone = res.data["users"][1]
        self.assertEqual(gone["username"], f"deleted_user_{self.bob.user_id}")
        self.assertIsNone(gone["avatar"])
        self.assertTrue(gone["deleted"])
        self.assertFalse(gone["seeker_verified"])
        self.assertEqual(self.card(slug).status_code, 200)


class MeetCardTests(MeetTestCase):
    def slug(self, a=None, b=None, **tap):
        a, b = a or self.alice, b or self.bob
        self.add_tap(a, b, tap.pop("when", at(21, 16, 42)), **tap)
        self.backfill()
        return self.slug_of(a, b)

    def render_text(self, slug):
        """What the card draws, captured from the render call."""
        with mock.patch.object(meet_card, "render_card", wraps=meet_card.render_card) as render:
            self.assertEqual(self.card(slug).status_code, 200)
        return render.call_args.args[0]

    def test_both_sizes(self):
        slug = self.slug()
        og = self.card(slug)
        self.assertEqual(og.status_code, 200)
        self.assertEqual(og["Content-Type"], "image/png")
        self.assertEqual(png_size(og.content), (1200, 630))
        story = self.card(slug, v="story")
        self.assertEqual(png_size(story.content), (1080, 1350))

    def test_cache_headers_and_etag(self):
        slug = self.slug()
        res = self.card(slug)
        self.assertEqual(res["Cache-Control"], "public, max-age=3600")
        etag = res["ETag"]
        self.assertTrue(etag.startswith('"og-'))
        again = self.api.get(f"/api/v1/meet/{slug}/card.png", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(again.status_code, 304)
        self.assertEqual(again.content, b"")
        self.assertNotEqual(self.card(slug, v="story")["ETag"], etag)

    def test_image_accept_header_is_fine(self):
        slug = self.slug()
        res = self.api.get(f"/api/v1/meet/{slug}/card.png", HTTP_ACCEPT="image/png")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.api.head(f"/api/v1/meet/{slug}/card.png").status_code, 200)

    def test_renders_once_then_from_storage(self):
        slug = self.slug()
        with mock.patch.object(meet_card, "render_card", wraps=meet_card.render_card) as render:
            first = self.card(slug)
            second = self.card(slug)
        self.assertEqual(render.call_count, 1)
        self.assertEqual(first.content, second.content)

    def test_unknown_slug_is_a_404_card(self):
        for variant, size in (("og", (1200, 630)), ("story", (1080, 1350))):
            res = self.card("AAAAAAAAAAAA", v=variant)
            self.assertEqual(res.status_code, 404)
            self.assertEqual(res["Content-Type"], "image/png")
            self.assertEqual(res["Cache-Control"], "no-store")
            self.assertEqual(png_size(res.content), size)

    def test_rate_limited_per_ip(self):
        slug = self.slug()
        with mock.patch.object(MeetCardThrottle, "rate", "3/min"):
            codes = [self.card(slug).status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])

    def test_irl_card(self):
        t = self.render_text(self.slug())
        self.assertEqual((t.tier, t.tier_label), ("in_person", "IN PERSON"))
        self.assertEqual((t.a, t.b), ("alice", "bob"))
        self.assertEqual(t.when_line, "Kyiv · Mon, Sep 21 · 19:42")
        self.assertIsNone(t.event_name)
        self.assertEqual((t.lead, t.detail), ("+1 REP each", "#1 for @alice · #1 for @bob"))
        self.assertEqual(t.proof, "recorded on NextVibe")
        self.assertEqual(t.url_line, f"nextvibe.io/u/meet/{self.slug_of(self.alice, self.bob)}")

    def test_event_card_with_organizer_approval(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)
        self.check_in(self.bob, event)
        t = self.render_text(self.slug(source="event", event=event, points=(9, 2)))
        self.assertEqual(t.tier_label, "ORGANIZER VERIFIED")
        self.assertEqual(t.event_name, "Superteam Ukraine Vibeathon")
        self.assertEqual(t.lead, "+9 & +2 REP")

    def test_event_card_via_geofence(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)
        t = self.render_text(self.slug(source="event", event=event, points=(2, 2)))
        self.assertEqual(t.tier_label, "PEER VERIFIED")
        self.assertEqual(t.event_name, "Superteam Ukraine Vibeathon")

    def test_missing_avatar_draws_the_initial(self):
        User.objects.filter(user_id=self.bob.user_id).update(avatar="images/does-not-exist.png")
        slug = self.slug()
        with mock.patch.object(meet_card, "initial_avatar", wraps=meet_card.initial_avatar) as initial:
            self.assertEqual(self.card(slug).status_code, 200)
        # alice has the default avatar, bob's file is missing
        self.assertEqual(sorted(c.args[0] for c in initial.call_args_list), ["alice", "bob"])

    def test_real_avatar_is_drawn(self):
        default_storage.save("images/bob.jpg", ContentFile(_jpeg()))
        User.objects.filter(user_id=self.bob.user_id).update(avatar="images/bob.jpg")
        slug = self.slug()
        with mock.patch.object(meet_card, "initial_avatar", wraps=meet_card.initial_avatar) as initial:
            self.card(slug)
        self.assertEqual([c.args[0] for c in initial.call_args_list], ["alice"])

    def test_long_usernames(self):
        long_a = make_user("averyveryverylongusername_1234")
        long_b = make_user("another_really_long_handle.skr")
        slug = self.slug(long_a, long_b)
        t = self.render_text(slug)
        self.assertEqual(t.detail, "#1 for @averyveryverylong… · #1 for @another_really_lo…")
        # Headline: shrinks to 40px, then 18-character names
        runs = meet_card._headline(t, 1200 - 128, range(56, 39, -2))
        self.assertLessEqual(meet_card._runs_width(runs), 1200 - 128)
        self.assertEqual(runs[0].text, "@averyveryverylong…")
        self.assertEqual(len("averyveryverylong…"), 18)
        self.assertEqual(png_size(self.card(slug, v="story").content), (1080, 1350))

    def test_short_names_keep_the_big_headline(self):
        t = self.render_text(self.slug())
        runs = meet_card._headline(t, 1200 - 128, range(56, 39, -2))
        self.assertEqual(runs[0].face.size, 56)
        self.assertEqual(runs[0].text, "@alice")

    def test_no_location(self):
        t = self.render_text(self.slug(h3_geo=None))
        self.assertEqual(t.when_line, "In person · Mon, Sep 21 · 16:42 UTC")

    def test_both_seeker_verified(self):
        User.objects.filter(user_id__in=[self.alice.user_id, self.bob.user_id]).update(seeker_verified=True)
        slug = self.slug()
        t = self.render_text(slug)
        self.assertTrue(t.a_seeker and t.b_seeker)
        runs = meet_card._headline(t, 1200 - 128, range(56, 39, -2))
        self.assertEqual(sum(isinstance(r, meet_card._Badge) for r in runs), 2)
        self.assertEqual(png_size(self.card(slug, v="story").content), (1080, 1350))

    def test_new_avatar_renders_a_new_card(self):
        slug = self.slug()
        before = self.card(slug)["ETag"]
        default_storage.save("images/new.jpg", ContentFile(_jpeg()))
        User.objects.filter(user_id=self.bob.user_id).update(avatar="images/new.jpg")
        self.assertNotEqual(self.card(slug)["ETag"], before)


class HistoryCarriesSlugTests(MeetTestCase):
    def test_own_history_has_the_slug_other_profiles_dont(self):
        event = self.event(make_user("host"))
        self.check_in(self.alice, event)
        self.add_tap(self.alice, self.bob, at(21))
        self.add_tap(self.alice, self.bob, at(22), source="event", event=event, points=(2, 2))
        self.backfill()
        irl_slug = self.slug_of(self.alice, self.bob, source="irl")
        event_slug = self.slug_of(self.alice, self.bob, source="event")

        data = client_for(self.alice).get(CONNECTIONS_URL).data
        self.assertEqual(data["irl_taps"][0]["meet_slug"], irl_slug)
        items = {i["type"]: i for i in data["reputation_items"]}
        self.assertEqual(items["irl_tap"]["meet_slug"], irl_slug)
        self.assertEqual(items["networking"]["meet_slug"], event_slug)
        self.assertEqual(data["events"][0]["connections"][0]["meet_slug"], event_slug)

        other = client_for(self.bob).get(CONNECTIONS_URL, {"user_id": self.alice.user_id}).data
        self.assertIsNone(other["irl_taps"][0]["meet_slug"])
        self.assertNotIn("meet_slug", other["events"][0]["connections"][0])


class GeocodeTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_city_is_cached_per_area(self):
        with mock.patch.object(geocode, "lookup", return_value=("Kyiv", "UA")) as lookup:
            self.assertEqual(geocode.place_for_cell(KYIV_CELL), ("Kyiv", "UA"))
            # Another tap in the same res-7 area, stored at a finer resolution
            area = h3.cell_to_parent(KYIV_CELL, geocode.CACHE_RES)
            nearby = h3.cell_to_children(area, 15)[123]
            self.assertEqual(geocode.place_for_cell(nearby), ("Kyiv", "UA"))
        self.assertEqual(lookup.call_count, 1)

    def test_failure_is_retried_later(self):
        with mock.patch.object(geocode, "lookup", side_effect=geocode.LookupFailed("down")):
            self.assertEqual(geocode.place_for_cell(KYIV_CELL), (None, None))
        cache.clear()  # the short failure entry expired
        with mock.patch.object(geocode, "lookup", return_value=("Kyiv", "UA")):
            self.assertEqual(geocode.place_for_cell(KYIV_CELL), ("Kyiv", "UA"))

    def test_bad_cells(self):
        with mock.patch.object(geocode, "lookup") as lookup:
            self.assertEqual(geocode.place_for_cell(None), (None, None))
            self.assertEqual(geocode.place_for_cell("not-a-cell"), (None, None))
        lookup.assert_not_called()

    def test_nominatim_answer_is_reduced_to_a_city(self):
        found = mock.Mock(raw={"address": {"road": "Khreshchatyk", "city": "Kyiv", "country_code": "ua"}})
        with mock.patch("geopy.geocoders.Nominatim.reverse", return_value=found):
            self.assertEqual(geocode._nominatim(*KYIV), ("Kyiv", "UA"))

    def test_time_zones(self):
        self.assertEqual(geocode.timezone_at(*KYIV, "UA").key, "Europe/Kyiv")
        self.assertEqual(geocode.timezone_at(40.71, -74.0, "US").key, "America/New_York")
        self.assertEqual(geocode.timezone_at(34.05, -118.24, "US").key, "America/Los_Angeles")
        self.assertEqual(geocode.timezone_at(48.62, 22.29, "UA").key, "Europe/Kyiv")  # near the border
        self.assertEqual(geocode.timezone_at(51.51, -0.13).key, "Europe/London")  # country unknown


class CardTextTests(TestCase):
    def test_ordinals(self):
        self.assertEqual([meet_card.ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111)],
                         ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd", "111th"])

    def test_short_names(self):
        self.assertEqual(meet_card.short_name("toji"), "toji")
        self.assertEqual(meet_card.short_name("a" * 18), "a" * 18)
        self.assertEqual(meet_card.short_name("a" * 19), "a" * 17 + "…")

    def test_asset_ids_shorten(self):
        self.assertEqual(meet_card.short_asset("8xKpQ1v9z3fQ"), "8xK…3fQ")


def _jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), (200, 80, 60)).save(buf, "JPEG")
    return buf.getvalue()
