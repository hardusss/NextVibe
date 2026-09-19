from nvcli import audience, log
from nvcli.tests._base import NvTestCase


class SegmentTest(NvTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.user("alice", seeker=True, source="onchain", wallet="A" * 44, last_login=3)
        self.bob = self.user("bob", push=False, last_login=200)
        self.carol = self.user("carol", email=False, seeker=True, source="skr")
        self.dave = self.user("dave", email=False, push=False)
        self.user("banned", banned=True)
        self.user("gone", active=False)

    def names(self, qs):
        return sorted(qs.values_list("username", flat=True))

    def test_base_excludes_banned_and_inactive(self):
        self.assertEqual(self.names(audience.base_queryset()), ["alice", "bob", "carol", "dave"])
        self.assertEqual(audience.excluded_count(), 2)

    def test_channel_segments(self):
        self.assertEqual(self.names(audience.segment_queryset("push")), ["alice", "carol"])
        self.assertEqual(self.names(audience.segment_queryset("email-only")), ["bob"])
        self.assertEqual(self.names(audience.segment_queryset("both")), ["alice"])

    def test_seeker_wallet_activity(self):
        self.assertEqual(self.names(audience.segment_queryset("seeker")), ["alice", "carol"])
        self.assertEqual(self.names(audience.segment_queryset("non-seeker")), ["bob", "dave"])
        self.assertEqual(self.names(audience.segment_queryset("wallet")), ["alice"])
        self.assertEqual(self.names(audience.segment_queryset("active-30d")), ["alice"])
        # never logged in counts as inactive too
        self.assertEqual(self.names(audience.segment_queryset("inactive-90d")), ["bob", "carol", "dave"])

    def test_include_is_and_exclude_is_or(self):
        self.assertEqual(self.names(audience.apply(["seeker", "push"])), ["alice", "carol"])
        self.assertEqual(self.names(audience.apply(["seeker"], ["wallet"])), ["carol"])
        self.assertEqual(self.names(audience.apply(["push"], ["seeker", "email"])), [])

    def test_tapped_and_event_segments(self):
        from posts.models import EventCheckin, Post, Reputation

        event = Post.objects.create(owner=self.alice, about="Solana meetup", is_approved=True)
        EventCheckin.objects.create(user=self.bob, post=event)
        Reputation.objects.create(user=self.alice, given_by=self.carol, points=1, source="irl")
        Reputation.objects.create(user=self.dave, given_by=self.alice, points=1, source="checkin")
        self.assertEqual(self.names(audience.segment_queryset("tapped")), ["alice", "carol"])
        self.assertEqual(self.names(audience.segment_queryset(f"event:{event.id}")), ["bob"])

    def test_file_and_sent_in_segments(self):
        path = self.logs / "names.txt"
        path.write_text("@alice\n# comment\nbob\n\nnobody\n")
        self.assertEqual(self.names(audience.segment_queryset(f"file:{path}")), ["alice", "bob"])
        log.append("sep20", log.entry(campaign="sep20", wave=1, user_id=self.bob.user_id, channel="email", status="sent"))
        log.append("sep20", log.entry(campaign="sep20", wave=1, user_id=self.alice.user_id, channel="push", status="failed"))
        self.assertEqual(self.names(audience.segment_queryset("sent-in:sep20")), ["bob"])
        self.assertEqual(self.names(audience.apply(["email"], ["sent-in:sep20"])), ["alice"])

    def test_unknown_segment(self):
        with self.assertRaises(KeyError):
            audience.segment_queryset("moon")

    def test_optouts_are_excluded_per_channel(self):
        log.add_optout("push", self.alice.user_id)
        log.add_optout("email", self.bob.user_id)
        qs = audience.base_queryset()
        self.assertEqual(self.names(audience.without_optouts(qs, "push")), ["bob", "carol", "dave"])
        self.assertEqual(self.names(audience.without_optouts(qs, "email")), ["alice", "carol", "dave"])
        self.assertEqual(self.names(audience.without_optouts(qs, "both")), ["carol", "dave"])

    def test_with_channel_and_channels_for(self):
        qs = audience.base_queryset()
        self.assertEqual(self.names(audience.with_channel(qs, "both")), ["alice", "bob", "carol"])
        self.assertEqual(audience.channels_for(self.alice, "both"), ["push", "email"])
        self.assertEqual(audience.channels_for(self.bob, "both"), ["email"])
        self.assertEqual(audience.channels_for(self.bob, "push"), [])

    def test_overview_counts(self):
        o = audience.overview()
        self.assertEqual(o["total"], 4)
        self.assertEqual((o["push"], o["email"], o["both"]), (2, 2, 1))
        self.assertEqual((o["push_only"], o["email_only"], o["unreachable"]), (1, 1, 1))
        self.assertEqual((o["seeker"], o["seeker_push"], o["active_30d"], o["excluded"]), (2, 2, 1, 2))

    def test_user_stats(self):
        from posts.models import EventCheckin, Post, Reputation

        event = Post.objects.create(owner=self.bob, about="Meetup", is_approved=True)
        EventCheckin.objects.create(user=self.alice, post=event)
        Reputation.objects.create(user=self.alice, given_by=self.bob, points=2, source="event", event=event)
        Reputation.objects.create(user=self.alice, given_by=self.bob, points=1, source="irl")
        Reputation.objects.create(user=self.alice, given_by=self.carol, points=1, source="irl")
        Reputation.objects.create(user=self.alice, given_by=self.dave, points=5, source="checkin")
        s = audience.user_stats(self.alice)
        self.assertEqual((s["rep"], s["events"], s["met"]), (9, 1, 2))
        self.assertTrue(s["push"] and s["email"] and s["seeker"])


class SamplingTest(NvTestCase):
    def setUp(self):
        super().setUp()
        self.users = [self.user(f"u{i:03d}") for i in range(200)]

    def test_sample_is_deterministic_and_nested(self):
        ten = audience.sample(self.users, "camp", 0.10)
        ten_again = audience.sample(self.users, "camp", 0.10)
        quarter = audience.sample(self.users, "camp", 0.25)
        self.assertEqual([u.user_id for u in ten], [u.user_id for u in ten_again])
        self.assertTrue(5 <= len(ten) <= 40)
        self.assertTrue({u.user_id for u in ten} <= {u.user_id for u in quarter})
        self.assertEqual(len(audience.sample(self.users, "camp", 1.0)), 200)

    def test_different_campaigns_pick_different_people(self):
        a = {u.user_id for u in audience.sample(self.users, "camp-a", 0.5)}
        b = {u.user_id for u in audience.sample(self.users, "camp-b", 0.5)}
        self.assertNotEqual(a, b)

    def test_sample_n_is_a_prefix_of_sample(self):
        five = audience.sample_n(self.users, "camp", 5)
        self.assertEqual(len(five), 5)
        half = {u.user_id for u in audience.sample(self.users, "camp", 0.5)}
        self.assertTrue({u.user_id for u in five} <= half)

    def test_variant_split_is_stable_and_roughly_even(self):
        variants = [audience.variant_for("camp", u.user_id, 0.5) for u in self.users]
        self.assertEqual(variants, [audience.variant_for("camp", u.user_id, 0.5) for u in self.users])
        self.assertTrue(60 <= variants.count("A") <= 140)
        self.assertTrue(all(v == "A" for v in (audience.variant_for("camp", u.user_id, 1.0) for u in self.users)))
