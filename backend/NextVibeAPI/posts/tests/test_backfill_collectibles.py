"""manage.py backfill_collectibles: what exists already becomes collectibles, once."""
import hashlib
from io import StringIO
from unittest import mock

import base58
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase

from posts.models import Collectible, EventCheckin, MeetPhoto, Post, Reputation, UserCollection
from posts.src import meets
from user.models import OgAvatarMint, User


def wallet(name):
    return base58.b58encode(hashlib.sha256(name.encode()).digest()).decode()


def make_user(name, with_wallet=True, **extra):
    return User.objects.create_user(username=name, email=f"{name}@test.com", password="pass12345",
                                    wallet_address=wallet(name) if with_wallet else None, **extra)


class BackfillCollectiblesTest(TestCase):
    def setUp(self):
        cache.clear()
        for target in ("posts.src.collectibles.enqueue", "posts.src.realtime.publish"):
            patcher = mock.patch(target)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.queued_users = []
        patcher = mock.patch("posts.src.collectibles.enqueue_user", side_effect=self.queued_users.append)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = mock.patch("django.db.transaction.on_commit", side_effect=lambda f, using=None, robust=False: f())
        patcher.start()
        self.addCleanup(patcher.stop)

        self.alice, self.carol = make_user("alice"), make_user("carol")
        self.bob, self.dave = make_user("bob", with_wallet=False), make_user("dave", with_wallet=False)
        self.gone = make_user("gone", with_wallet=False)
        User.all_objects.filter(pk=self.gone.pk).update(auth_provider="deleted", is_active=False, is_baned=True)
        organizer = make_user("organizer")
        self.event = Post.objects.create(owner=organizer, about="Kyiv Meetup", is_luma_event=True, is_approved=True,
                                         moderation_status="approved", total_supply=50, minted_count=1)
        post = Post.objects.create(owner=organizer, about="A post", is_approved=True, moderation_status="approved")
        ai_post = Post.objects.create(owner=organizer, about="AI", is_approved=True, is_ai_generated=True)

        # alice's POAP was minted at check-in; bob collected a post (and an AI one, kept out)
        EventCheckin.objects.create(user=self.alice, post=self.event, is_registered=True, mint_status="minted")
        UserCollection.objects.create(user=self.alice, post=self.event, asset_id=wallet("poap-a"), edition=1)
        UserCollection.objects.create(user=self.bob, post=post, asset_id=wallet("post-b"), edition=3)
        UserCollection.objects.create(user=self.bob, post=ai_post, asset_id=wallet("ai-b"), edition=1)
        # carol is an OG
        OgAvatarMint.objects.create(user=self.carol, edition=7, asset_id=wallet("og-c"))
        # dave checked in without a wallet: his POAP was never minted; a deleted account too
        EventCheckin.objects.create(user=self.dave, post=self.event, is_registered=True)
        EventCheckin.objects.create(user=self.gone, post=self.event, is_registered=True)
        # alice met bob (no leaves); carol met dave, and carol's selfie leaf was minted (v2)
        self.slug_ab = self.tap(self.alice, self.bob)
        self.slug_cd = self.tap(self.carol, self.dave)
        MeetPhoto.objects.create(meet_slug=self.slug_cd, photographer=self.carol, subject=self.dave, raw_key="k",
                                 raw_sha256="0" * 64, status=MeetPhoto.Status.MINTED,
                                 asset_id_photographer=wallet("meet-c"), wallet_photographer=self.carol.wallet_address)
        self.tap(self.alice, self.gone)

    def tap(self, a, b):
        slug = meets.tap_slug(a.user_id, b.user_id, "irl")
        for user, other in ((a, b), (b, a)):
            Reputation.objects.create(user=user, given_by=other, points=1, source="irl", meet_slug=slug)
        return slug

    def run_command(self, *args):
        out = StringIO()
        call_command("backfill_collectibles", *args, stdout=out)
        return out.getvalue()

    def table(self):
        return sorted(Collectible.objects.values_list("user__username", "kind", "status", "asset_id"))

    def test_backfill(self):
        output = self.run_command()
        self.assertEqual(self.table(), sorted([
            ("alice", "poap", "minted", wallet("poap-a")),
            ("bob", "post", "minted", wallet("post-b")),
            ("carol", "badge", "minted", wallet("og-c")),
            ("carol", "meet", "minted", wallet("meet-c")),
            ("dave", "meet", "offchain", ""),
            ("alice", "meet", "offchain", ""),
            ("bob", "meet", "offchain", ""),
            ("alice", "meet", "offchain", ""),  # her meet with the deleted account
            ("dave", "poap", "offchain", ""),
        ]))
        self.assertIn("poap   created: minted 1, offchain 1", output)
        self.assertIn("meet   created: minted 1, offchain 4", output)
        # carol's leaf keeps the URI it was minted with
        carols = Collectible.objects.get(user=self.carol, kind="meet")
        self.assertEqual(carols.metadata_uri, f"https://api.nextvibe.io/meta/meet/{self.slug_cd}.json")
        daves = Collectible.objects.get(user=self.dave, kind="meet")
        self.assertEqual(daves.metadata_uri, f"https://api.nextvibe.io/meta/meet/{self.slug_cd}/{self.dave.user_id}.json")
        # dave's POAP takes the next edition, counted in the event
        self.assertEqual(Collectible.objects.get(user=self.dave, kind="poap").edition, 2)
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 2)
        # Nothing was queued: off-chain items wait for a Claim or a wallet
        self.assertEqual(self.queued_users, [])

    def test_it_is_idempotent(self):
        self.run_command()
        before = self.table()
        output = self.run_command()
        self.assertEqual(self.table(), before)
        for kind in ("poap", "meet", "post", "badge"):
            self.assertIn(f"{kind:6} nothing new", output)
        self.event.refresh_from_db()
        self.assertEqual(self.event.minted_count, 2)

    def test_dry_run_writes_nothing(self):
        output = self.run_command("--dry-run")
        self.assertFalse(Collectible.objects.exists())
        self.assertIn("would create", output)

    def test_queue_for_people_with_a_wallet(self):
        self.run_command("--queue")
        self.assertEqual(
            sorted(Collectible.objects.filter(status="queued").values_list("user__username", flat=True)),
            ["alice", "alice"],
        )
        self.assertEqual(self.queued_users, [self.alice.user_id])

    def test_a_row_recorded_off_chain_is_upgraded_when_its_leaf_exists(self):
        self.run_command("--kind", "meet")
        MeetPhoto.objects.filter(meet_slug=self.slug_cd).update(asset_id_subject=wallet("meet-d"))
        self.run_command("--kind", "meet")
        daves = Collectible.objects.get(user=self.dave, kind="meet")
        self.assertEqual((daves.status, daves.asset_id), ("minted", wallet("meet-d")))
