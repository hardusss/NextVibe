"""
Wallet-optional collectibles (posts/src/collectibles.py, collectible_mint.py).

- a tap between someone with a wallet and someone without: one minted, one off-chain
- collecting a post without a wallet asks for one and records nothing off-chain
- connecting a wallet puts everything on Solana in one batch: asset ids, one
  push, socket updates, and no duplicates when Claim and connect race
- a failing mint retries with backoff, ends in failed, and Claim brings it back
- a new wallet takes what isn't minted yet; unlinking returns queued rows
- the metadata JSON is the same before and after the mint ("Claimed later" aside)
- the cNFT tab: the same card on-chain or not, claim state only for the owner,
  blocks, filters and counts, paging, other wallet assets from DAS
- account deletion, a removed check-in, a full tree, the daily budget, a mint
  nobody answered
"""
import hashlib
import json
from datetime import timedelta
from unittest import mock

import base58
import requests
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from posts.models import Collectible, EventCheckin, EventRequest, MeetPhoto, Post, Reputation, UserCollection
from posts.src import collectible_metadata as meta
from posts.src import collectible_mint, collectibles, meets
from user.models import Block, User

Status = Collectible.Status


def wallet(name) -> str:
    """A real-shaped Solana address (32 bytes, base58)."""
    return base58.b58encode(hashlib.sha256(name.encode()).digest()).decode()


def make_user(name, with_wallet=True, **extra):
    return User.objects.create_user(
        username=name, email=f"{name}@test.com", password="pass12345",
        wallet_address=wallet(name) if with_wallet else None, **extra,
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=User.all_objects.get(pk=user.pk))
    return client


class FakeNftService:
    """/mint and /mint/meet: records every body; can fail, time out or refuse."""

    def __init__(self):
        self.calls = []
        self.fail = 0
        self.error = None
        self.count = 0

    def post(self, url, json=None, timeout=None):
        path = url.split("://", 1)[-1].split("/", 1)[-1]
        self.calls.append(("/" + path, json))
        if self.error is not None:
            raise self.error
        response = mock.Mock()
        if self.fail:
            self.fail -= 1
            response.status_code = 502
            response.json.return_value = {"success": False, "error": "MINT_SEND_FAILED"}
            return response
        self.count += 1
        response.status_code = 200
        response.json.return_value = {"success": True, "assetId": wallet(f"asset-{self.count}"), "signature": "c2ln"}
        return response

    def recipients(self):
        return [body["recipient"] for _, body in self.calls]


class CollectiblesTestCase(TestCase):
    def setUp(self):
        cache.clear()

        def patch(target, **kwargs):
            patcher = mock.patch(target, **kwargs)
            started = patcher.start()
            self.addCleanup(patcher.stop)
            return started

        # TestCase never commits: run on_commit work (the queue) right away
        patch("django.db.transaction.on_commit", side_effect=lambda func, using=None, robust=False: func())
        patch("posts.src.geocode.lookup", return_value=("Kyiv", "UA"))
        self.service = FakeNftService()
        patch("posts.src.collectible_mint.requests.post", side_effect=self.service.post)
        self.enqueue = patch("posts.src.collectibles.enqueue", side_effect=collectible_mint.process)
        self.enqueue_user = patch("posts.src.collectibles.enqueue_user",
                                  side_effect=collectible_mint.mint_pending_for_user)
        self.tree = patch("posts.src.collectible_mint.tree_status",
                          return_value={"capacity": 16384, "minted": 100, "remaining": 16284})
        patch("posts.src.collectible_mint.MINT_PAUSE", new=0)
        self.leaf_lookup = patch("posts.src.das.find_leaf", return_value=None)
        self.events = []
        patch("posts.src.realtime.publish", side_effect=lambda ids, env: self.events.append((sorted(ids), env)) or True)
        self.pushes = []
        patch("posts.src.push.send",
              side_effect=lambda user, title, body, data: self.pushes.append((user, title, body, data)))
        patch("user.views_pac.save_wallet_address.verify_seeker_in_background")

        self.alice = make_user("alice")
        self.bob = make_user("bob", with_wallet=False)
        self.organizer = make_user("organizer")
        self.event = Post.objects.create(owner=self.organizer, about="Superteam Ukraine Kyiv", is_luma_event=True,
                                         is_approved=True, moderation_status="approved", total_supply=50)
        for user in (self.alice, self.bob):
            EventRequest.objects.create(user=user, post=self.event, status=EventRequest.Status.APPROVED)

    def tearDown(self):
        cache.clear()

    # Actions, through the API like the app does

    def checkin(self, user):
        response = client_for(user).post(f"/api/v1/posts/event-checkin/{self.event.id}/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["verified"])
        return response.json()

    def irl_tap(self, a, b):
        """a confirms a tap with b."""
        response = client_for(a).post("/api/v1/posts/irl-tap/", {"scanned_user_id": b.user_id}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def recorded_meet(self, a, b, when):
        """A tap that happened at `when` (IRL), recorded the way the tap views do."""
        slug = meets.tap_slug(a.user_id, b.user_id, "irl", when=when)
        rows = [Reputation.objects.create(user=u, given_by=o, points=1, source="irl", h3_geo="8928308280fffff",
                                          meet_slug=slug) for u, o in ((a, b), (b, a))]
        Reputation.objects.filter(id__in=[r.id for r in rows]).update(created_at=when)
        collectibles.record_meet(slug, a, b, when=when)
        return slug

    def connect(self, user, address=None):
        response = client_for(user).post("/api/v1/users/save-wallet/",
                                         {"walletAddress": address or wallet(f"{user.username}-wallet")},
                                         format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def rows(self, user, **filters):
        return Collectible.objects.filter(user=user, **filters).order_by("id")

    def statuses(self, user):
        return sorted(self.rows(user).values_list("status", flat=True))

    def make_due(self, user=None):
        """Time passes: every backoff is over."""
        rows = Collectible.objects.all() if user is None else Collectible.objects.filter(user=user)
        rows.update(next_attempt_at=None)


class TapAndCheckinTests(CollectiblesTestCase):
    def test_tap_between_a_wallet_and_no_wallet(self):
        data = self.irl_tap(self.alice, self.bob)
        # The tap answers at once: queued for alice's wallet (the worker mints it right after)
        self.assertEqual(data["collectible"]["status"], "queued")
        alices = self.rows(self.alice).get()
        bobs = self.rows(self.bob).get()
        self.assertEqual((alices.kind, alices.status, alices.wallet), ("meet", "minted", self.alice.wallet_address))
        self.assertTrue(alices.asset_id)
        self.assertEqual((bobs.status, bobs.wallet, bobs.asset_id), ("offchain", "", ""))
        self.assertEqual(alices.source_id, bobs.source_id)
        self.assertEqual(alices.counterpart_id, self.bob.user_id)
        # One mint, to alice, with the meet's own per-holder metadata, listing only her wallet
        path, body = self.service.calls[0]
        self.assertEqual(path, "/mint/meet")
        self.assertEqual(body["recipient"], self.alice.wallet_address)
        self.assertEqual(body["coAuthors"], [self.alice.wallet_address])
        self.assertEqual(body["uri"], f"https://api.nextvibe.io/meta/meet/{alices.source_id}/{self.alice.user_id}.json")
        self.assertEqual(body["name"], "Proof of Meet — @alice × @bob")
        self.assertEqual(len(self.service.calls), 1)
        # The open app updates in place; no push for a single mint
        statuses = [env["status"] for ids, env in self.events if env["type"] == "collectible" and ids == [self.alice.user_id]]
        self.assertEqual(statuses[-1], "minted")
        self.assertEqual(self.pushes, [])

    def test_both_without_a_wallet(self):
        carol = make_user("carol", with_wallet=False)
        self.irl_tap(carol, self.bob)
        self.assertEqual(self.statuses(carol), ["offchain"])
        self.assertEqual(self.statuses(self.bob), ["offchain"])
        self.assertEqual(self.service.calls, [])

    def test_event_tap_and_checkin(self):
        self.checkin(self.alice)
        self.checkin(self.bob)
        response = client_for(self.alice).post("/api/v1/posts/event-nfc-connect/",
                                               {"event_id": self.event.id, "scanned_user_id": self.bob.user_id},
                                               format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(sorted(self.rows(self.alice).values_list("kind", "status")), [("meet", "minted"), ("poap", "minted")])
        self.assertEqual(sorted(self.rows(self.bob).values_list("kind", "status")), [("meet", "offchain"), ("poap", "offchain")])
        # Editions go by check-in order, wallet or not
        self.assertEqual(self.rows(self.alice, kind="poap").get().edition, 1)
        self.assertEqual(self.rows(self.bob, kind="poap").get().edition, 2)
        self.assertEqual(UserCollection.objects.filter(post=self.event).count(), 1)
        self.assertEqual(EventCheckin.objects.get(user=self.alice).mint_status, "minted")

    def test_recording_never_breaks_the_action(self):
        with mock.patch("posts.src.collectibles.Collectible.objects.get_or_create", side_effect=RuntimeError("db")):
            data = self.irl_tap(self.alice, self.bob)
        self.assertTrue(data["success"])
        self.assertEqual(Reputation.objects.filter(source="irl").count(), 2)
        self.assertFalse(Collectible.objects.exists())


class CollectTests(CollectiblesTestCase):
    def setUp(self):
        super().setUp()
        self.post = Post.objects.create(owner=self.organizer, about="A post", is_approved=True,
                                        moderation_status="approved", is_nft=True)
        # Past the 24 h window that keeps early editions for people who met the author
        Post.objects.filter(pk=self.post.pk).update(create_at=timezone.now() - timedelta(days=2))

    def collect(self, user):
        return client_for(user).post("/api/v1/posts/collect/prepare/", {"postId": self.post.id, "signer": "none"},
                                     format="json", HTTP_X_CLIENT_PLATFORM="ios")

    def test_collect_needs_a_wallet_and_leaves_nothing_off_chain(self):
        response = self.collect(self.bob)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "WALLET_REQUIRED")
        self.assertFalse(Collectible.objects.filter(user=self.bob).exists())

        # After connecting, the collect goes through in one go and shows in the tab, minted
        self.connect(self.bob)
        minted = mock.Mock(status_code=200)
        minted.json.return_value = {"success": True, "assetId": wallet("collected"), "signature": "c2ln"}
        with mock.patch("posts.view_pac.collect.requests.post", return_value=minted):
            response = self.collect(self.bob)
        self.assertEqual(response.status_code, 201, response.content)
        row = self.rows(self.bob).get()
        self.assertEqual((row.kind, row.status, row.asset_id, row.edition), ("post", "minted", wallet("collected"), 1))
        self.assertFalse(self.rows(self.bob, status=Status.OFFCHAIN).exists())


class ConnectAndClaimTests(CollectiblesTestCase):
    def five_offchain(self):
        """bob: a POAP and four meets, all off-chain."""
        self.checkin(self.bob)
        for index in range(4):
            other = make_user(f"friend{index}", with_wallet=False)
            self.irl_tap(other, self.bob)
        self.assertEqual(self.statuses(self.bob), ["offchain"] * 5)
        self.service.calls.clear()

    def test_connect_wallet_puts_everything_on_solana_once(self):
        self.five_offchain()
        data = self.connect(self.bob, wallet("bob-phone"))
        self.assertEqual(data["collectibles"], {"queued": 5})
        self.assertEqual(self.statuses(self.bob), ["minted"] * 5)
        self.assertTrue(all(self.rows(self.bob).values_list("asset_id", flat=True)))
        self.assertEqual(set(self.rows(self.bob).values_list("wallet", flat=True)), {wallet("bob-phone")})
        self.assertEqual(self.service.recipients(), [wallet("bob-phone")] * 5)
        # Oldest first
        recorded = list(self.rows(self.bob).order_by("minted_at", "id").values_list("recorded_at", flat=True))
        self.assertEqual(recorded, sorted(recorded))
        # One push for the batch
        self.assertEqual(len(self.pushes), 1)
        user, title, body, data = self.pushes[0]
        self.assertEqual(user, self.bob.user_id)
        self.assertEqual(title, "5 of your collectibles are now on Solana")
        self.assertEqual(body, "Your POAPs and Proof of Meets landed in your wallet.")
        self.assertEqual(data["url"], "/u/collectibles")
        # A socket update for every card
        minted_events = {env["id"] for ids, env in self.events
                         if ids == [self.bob.user_id] and env["type"] == "collectible" and env["status"] == "minted"}
        self.assertEqual(minted_events, set(self.rows(self.bob).values_list("id", flat=True)))

    def test_claim_and_connect_racing_never_mint_twice(self):
        self.five_offchain()
        # The connect's batch hasn't run yet when Claim is pressed twice and Claim all once
        self.enqueue_user.side_effect = None
        self.connect(self.bob, wallet("bob-phone"))
        bob = User.objects.get(pk=self.bob.pk)
        first = self.rows(self.bob).first()
        self.enqueue.side_effect = None
        collectibles.claim(bob, first.pk)
        collectibles.claim(bob, first.pk)
        collectibles.claim_all(bob)
        # …then every worker runs at once
        collectible_mint.process([first.pk])
        collectible_mint.mint_pending_for_user(self.bob.user_id)
        collectible_mint.mint_pending_for_user(self.bob.user_id)
        collectible_mint.sweep()
        self.assertEqual(self.statuses(self.bob), ["minted"] * 5)
        self.assertEqual(len(self.service.calls), 5)
        self.assertEqual(len(set(self.rows(self.bob).values_list("asset_id", flat=True))), 5)

    def test_single_claim_mints_that_one(self):
        self.irl_tap(self.alice, self.bob)
        self.connect(self.bob)  # the batch mints it
        row = self.rows(self.bob).get()
        self.assertEqual(row.status, "minted")
        response = client_for(self.bob).post(f"/api/v1/collectibles/{row.pk}/claim")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "ALREADY_ON_CHAIN")

    def test_claim_needs_a_wallet(self):
        self.irl_tap(self.alice, self.bob)
        row = self.rows(self.bob).get()
        client = client_for(self.bob)
        response = client.post(f"/api/v1/collectibles/{row.pk}/claim")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "no_wallet"))
        response = client.post("/api/v1/collectibles/claim-all")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "no_wallet"))
        # Someone else's item doesn't exist for you
        self.assertEqual(client_for(self.alice).post(f"/api/v1/collectibles/{row.pk}/claim").status_code, 404)

    def test_claim_with_a_wallet(self):
        self.irl_tap(self.alice, self.bob)
        row = self.rows(self.bob).get()
        User.objects.filter(pk=self.bob.pk).update(wallet_address=wallet("bob-set"))  # e.g. linked, queue not run
        self.service.calls.clear()
        response = client_for(self.bob).post(f"/api/v1/collectibles/{row.pk}/claim")
        self.assertEqual(response.status_code, 202, response.content)
        row.refresh_from_db()
        self.assertEqual((row.status, row.wallet), ("minted", wallet("bob-set")))
        self.assertEqual(len(self.service.calls), 1)
        self.assertEqual(self.pushes, [])  # the app shows it; no push for one Claim

    def test_failure_retries_then_fails_then_claim_works_again(self):
        self.irl_tap(self.alice, self.bob)
        self.service.calls.clear()
        self.service.fail = 99
        self.connect(self.bob)
        row = self.rows(self.bob).get()
        self.assertEqual((row.status, row.attempts), ("queued", 1))
        self.assertGreater(row.next_attempt_at, timezone.now() + timedelta(seconds=20))
        # Not due yet: the sweep leaves it
        collectible_mint.sweep()
        self.assertEqual(self.rows(self.bob).get().attempts, 1)
        for attempt in range(2, 6):
            self.make_due()
            collectible_mint.sweep()
            self.assertEqual(self.rows(self.bob).get().attempts, attempt)
        row = self.rows(self.bob).get()
        self.assertEqual((row.status, row.last_error), ("failed", "MINT_SEND_FAILED"))
        card = client_for(self.bob).get("/api/v1/users/bob/collectibles").json()["items"][0]
        self.assertEqual((card["status"], card["can_claim"], card["error"]), ("failed", True, "Couldn't put this on Solana"))
        # The partial batch told bob what landed: nothing, so no push
        self.assertEqual(self.pushes, [])

        self.service.fail = 0
        response = client_for(self.bob).post(f"/api/v1/collectibles/{row.pk}/claim")
        self.assertEqual(response.status_code, 202)
        row.refresh_from_db()
        self.assertEqual(row.status, "minted")
        self.assertEqual(len(self.service.calls), 6)

    def test_a_partial_batch_says_the_rest_will_retry(self):
        self.five_offchain()
        self.service.fail = 2
        self.connect(self.bob)
        self.assertEqual(self.statuses(self.bob).count("minted"), 3)
        self.assertEqual(self.pushes[0][1:3], ("3 of your collectibles are now on Solana",
                                               "3 landed, 2 will retry automatically."))

    def test_retries_check_the_chain_first(self):
        self.irl_tap(self.alice, self.bob)
        self.service.error = requests.ReadTimeout("read timed out")
        self.connect(self.bob)
        row = self.rows(self.bob).get()
        self.assertEqual(row.status, "minting")  # no answer: maybe it landed
        # DAS finds the leaf a few minutes later: minted, nothing sent again
        self.service.error = None
        self.leaf_lookup.return_value = wallet("found-leaf")
        Collectible.objects.filter(pk=row.pk).update(last_attempt_at=timezone.now() - timedelta(minutes=5))
        calls = len(self.service.calls)
        collectible_mint.sweep()
        row.refresh_from_db()
        self.assertEqual((row.status, row.asset_id), ("minted", wallet("found-leaf")))
        self.assertEqual(len(self.service.calls), calls)
        self.leaf_lookup.assert_called_with(row.wallet, row.metadata_uri)

    def test_no_answer_and_no_leaf_is_retried(self):
        self.irl_tap(self.alice, self.bob)
        self.service.error = requests.ReadTimeout("read timed out")
        self.connect(self.bob)
        row = self.rows(self.bob).get()
        Collectible.objects.filter(pk=row.pk).update(last_attempt_at=timezone.now() - timedelta(minutes=11))
        self.service.error = None
        collectible_mint.sweep()
        row.refresh_from_db()
        self.assertEqual((row.status, row.attempts), ("queued", 1))
        self.make_due()
        collectible_mint.sweep()
        row.refresh_from_db()
        self.assertEqual(row.status, "minted")

    def test_changing_wallets_moves_only_what_isnt_minted(self):
        self.checkin(self.bob)
        self.irl_tap(self.alice, self.bob)
        self.connect(self.bob, wallet("first"))
        minted = set(self.rows(self.bob).values_list("pk", flat=True))
        # Two more items, queued for the first wallet, not minted yet (the worker is busy)
        self.enqueue.side_effect = None
        self.enqueue_user.side_effect = None
        carol, dave = make_user("carol"), make_user("dave")
        self.irl_tap(carol, self.bob)
        self.irl_tap(dave, self.bob)
        self.assertEqual(set(self.rows(self.bob, status="queued").values_list("wallet", flat=True)), {wallet("first")})
        self.connect(self.bob, wallet("second"))
        self.assertEqual(set(self.rows(self.bob, status="queued").values_list("wallet", flat=True)), {wallet("second")})
        collectible_mint.mint_pending_for_user(self.bob.user_id)
        self.assertEqual(set(self.rows(self.bob, pk__in=minted).values_list("wallet", flat=True)), {wallet("first")})
        self.assertEqual(set(self.rows(self.bob).exclude(pk__in=minted).values_list("wallet", flat=True)),
                         {wallet("second")})

    def test_unlinking_returns_queued_rows_to_off_chain(self):
        self.enqueue.side_effect = None
        self.irl_tap(self.bob, self.alice)
        self.assertEqual(self.statuses(self.alice), ["queued"])
        response = client_for(self.alice).delete("/api/v1/users/save-wallet/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.statuses(self.alice), ["offchain"])
        self.assertIsNone(User.objects.get(pk=self.alice.pk).wallet_address)

    def test_unlinked_wallet_while_queued_waits_again(self):
        self.enqueue.side_effect = None
        self.irl_tap(self.bob, self.alice)
        User.objects.filter(pk=self.alice.pk).update(wallet_address=None)
        Collectible.objects.filter(user=self.alice).update(wallet="")
        collectible_mint.mint_pending_for_user(self.alice.user_id)
        self.assertEqual(self.statuses(self.alice), ["offchain"])
        self.assertEqual(self.service.calls, [])


class MetadataTests(CollectiblesTestCase):
    def test_meet_metadata_is_the_same_before_and_after_the_mint(self):
        two_days_ago = timezone.now() - timedelta(days=2)
        slug = self.recorded_meet(self.alice, self.bob, two_days_ago)
        url = f"/meta/meet/{slug}/{self.bob.user_id}.json"
        before = APIClient().get(url)
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before["Cache-Control"], "public, max-age=300")
        data = json.loads(before.content)
        traits = {t["trait_type"]: t["value"] for t in data["attributes"]}
        self.assertEqual(traits["Recorded"], two_days_ago.astimezone(meets.load_meet(slug).tz).date().isoformat())
        self.assertEqual((traits["Participant A"], traits["Participant B"], traits["City"]), ("alice", "bob", "Kyiv"))
        self.assertEqual(traits["Participant A wallet"], self.alice.wallet_address)
        self.assertNotIn("Participant B wallet", traits)  # bob had none when it was recorded
        self.assertEqual(data["image"], f"https://api.nextvibe.io/api/v1/meet/{slug}/card.png?v=story")
        self.assertNotIn("Claimed later", traits)

        self.connect(self.bob)
        self.assertEqual(self.rows(self.bob).get().status, "minted")
        after = json.loads(APIClient().get(url).content)
        claimed = [t for t in after["attributes"] if t["trait_type"] == "Claimed later"]
        self.assertEqual(claimed, [{"trait_type": "Claimed later", "value": "Yes"}])
        after["attributes"].remove(claimed[0])
        self.assertEqual(json.dumps(after, sort_keys=False), json.dumps(data, sort_keys=False))

    def test_minted_within_a_day_is_byte_identical(self):
        self.irl_tap(self.alice, self.bob)
        row = self.rows(self.bob).get()
        url = f"/meta/meet/{row.source_id}/{self.bob.user_id}.json"
        before = APIClient().get(url).content
        self.connect(self.bob)
        self.assertEqual(APIClient().get(url).content, before)

    def test_poap_metadata_is_frozen(self):
        self.checkin(self.bob)
        row = self.rows(self.bob).get()
        url = f"/api/v1/posts/{self.event.id}/metadata/{row.edition}/"
        before = APIClient().get(url).content
        data = json.loads(before)
        self.assertEqual(data["name"], "Superteam Ukraine Kyiv #1")
        traits = {t["trait_type"]: t["value"] for t in data["attributes"]}
        self.assertEqual((traits["Type"], traits["Attendee"], traits["Edition"]), ("POAP", "@bob", "1 of 50"))
        # The organizer renames the event: the POAP says what it was
        Post.objects.filter(pk=self.event.pk).update(about="Renamed")
        self.connect(self.bob)
        self.assertEqual(self.rows(self.bob).get().status, "minted")
        self.assertEqual(APIClient().get(url).content, before)

    def test_long_event_names_fit_the_onchain_name(self):
        self.event.about = "Solana Breakpoint 2026 Side Event: Builders Night in Kyiv"
        name = meta.poap_name(self.event, 12)
        self.assertLessEqual(len(name.encode()), 32)
        self.assertTrue(name.endswith("… #12"))
        self.assertLessEqual(len(meta.meet_onchain_name("averyveryverylongname", "другий_користувач").encode()), 32)

    def test_unknown_holder_is_404(self):
        self.assertEqual(APIClient().get(f"/meta/meet/AAAAAAAAAAAA/{self.bob.user_id}.json").status_code, 404)


class TabTests(CollectiblesTestCase):
    def setUp(self):
        super().setUp()
        self.checkin(self.bob)
        self.irl_tap(self.alice, self.bob)
        self.carol = make_user("carol")
        self.irl_tap(self.carol, self.bob)
        self.connect(self.bob)
        # One more, off-chain again (the wallet was unlinked)
        client_for(self.bob).delete("/api/v1/users/save-wallet/")
        self.dave = make_user("dave", with_wallet=False)
        self.irl_tap(self.dave, self.bob)

    def tab(self, viewer, **params):
        response = client_for(viewer).get("/api/v1/users/bob/collectibles", params)
        return response

    def test_owner_sees_claim_state_on_the_same_cards(self):
        data = self.tab(self.bob).json()
        self.assertTrue(data["owner"])
        self.assertEqual(data["counts"], {"all": 4, "poap": 1, "meet": 3, "post": 0, "badge": 0})
        self.assertEqual(data["summary"]["offchain"], 1)
        first = data["items"][0]  # newest recorded first: the meet with dave
        self.assertEqual((first["kind"], first["onchain"], first["status"], first["can_claim"]),
                         ("meet", False, "offchain", True))
        self.assertEqual(first["with"]["username"], "dave")
        for key in ("asset_id", "explorer_url", "wallet", "minted_at"):
            self.assertIsNone(first[key])
        onchain = [item for item in data["items"] if item["onchain"]]
        self.assertEqual(len(onchain), 3)
        for item in onchain:
            self.assertTrue(item["asset_id"])
            self.assertEqual(item["explorer_url"], f"https://solscan.io/token/{item['asset_id']}")
            self.assertFalse(item["can_claim"])
        # Every card has the same keys, on-chain or not
        self.assertEqual({frozenset(item) for item in data["items"]}, {frozenset(first)})

    def test_others_see_the_same_cards_without_claim_state(self):
        data = self.tab(self.alice).json()
        self.assertFalse(data["owner"])
        self.assertNotIn("summary", data)
        self.assertNotIn("external", data)
        item = data["items"][0]
        self.assertFalse(item["onchain"])
        for key in ("status", "can_claim", "error"):
            self.assertNotIn(key, item)

    def test_blocks_hide_the_profile_and_meets_with_the_blocked(self):
        Block.objects.create(blocker=self.bob, blocked=self.alice)
        self.assertEqual(self.tab(self.alice).status_code, 404)
        # carol blocked dave: bob's meet with dave is hidden from her
        Block.objects.create(blocker=self.carol, blocked=self.dave)
        usernames = [item["with"]["username"] for item in self.tab(self.carol).json()["items"] if item["with"]]
        self.assertNotIn("dave", usernames)

    def test_filters_and_paging(self):
        data = self.tab(self.bob, kind="poap").json()
        self.assertEqual([item["kind"] for item in data["items"]], ["poap"])
        page = self.tab(self.bob, limit=2).json()
        self.assertEqual(len(page["items"]), 2)
        rest = self.tab(self.bob, limit=2, cursor=page["next_cursor"]).json()
        self.assertEqual(len(rest["items"]), 2)
        self.assertIsNone(rest["next_cursor"])
        ids = [i["id"] for i in page["items"] + rest["items"]]
        self.assertEqual(len(set(ids)), 4)

    def test_a_live_selfie_gives_the_meet_card_a_new_image_url(self):
        meet = self.rows(self.bob, kind="meet", counterpart=self.alice).get()
        before = {item["id"]: item["image_url"] for item in self.tab(self.bob).json()["items"]}
        self.assertEqual(before[meet.pk], meet.image_url)
        photo = MeetPhoto.objects.create(meet_slug=meet.source_id, photographer=self.alice, subject=self.bob,
                                         raw_key="raw/x.jpg", raw_sha256="0" * 64, status=MeetPhoto.Status.MINTED)
        after = {item["id"]: item["image_url"] for item in self.tab(self.bob).json()["items"]}
        self.assertTrue(after[meet.pk].startswith(meet.image_url + "&rev="))
        # Everything else keeps its picture
        self.assertEqual({k: v for k, v in after.items() if k != meet.pk}, {k: v for k, v in before.items() if k != meet.pk})
        # The detail sheet looks it up on its own; a takedown brings the v1 card back
        detail = client_for(self.bob).get(f"/api/v1/collectibles/{meet.pk}").json()
        self.assertEqual(detail["image_url"], after[meet.pk])
        MeetPhoto.objects.filter(pk=photo.pk).update(status=MeetPhoto.Status.TAKEN_DOWN)
        detail = client_for(self.bob).get(f"/api/v1/collectibles/{meet.pk}").json()
        self.assertEqual(detail["image_url"], meet.image_url)

    def test_profile_count_includes_off_chain(self):
        detail = client_for(self.alice).get(f"/api/v1/users/user-detail/{self.bob.user_id}/").json()
        self.assertEqual(detail["cnft_count"], 4)

    def test_other_wallet_assets_for_the_owner(self):
        self.connect(self.bob, wallet("bob-2"))
        mine = self.rows(self.bob).first().asset_id
        items = [
            {"id": mine, "interface": "V1_NFT", "content": {"metadata": {"name": "ours"}}},
            {"id": "ExternalAsset", "interface": "V1_NFT",
             "content": {"metadata": {"name": "Mad Lad"}, "links": {"image": "https://img/x.png"}},
             "grouping": [{"group_key": "collection", "group_value": "C", "collection_metadata": {"name": "Mad Lads"}}]},
            {"id": "Token", "interface": "FungibleToken", "content": {}},
        ]
        with mock.patch("posts.src.das.owned_assets", return_value=items):
            data = self.tab(User.objects.get(pk=self.bob.pk)).json()
        self.assertEqual([(e["asset_id"], e["name"], e["collection"]) for e in data["external"]],
                         [("ExternalAsset", "Mad Lad", "Mad Lads")])

    def test_detail_sheet(self):
        offchain = self.rows(self.bob, status="offchain").get()
        data = client_for(self.bob).get(f"/api/v1/collectibles/{offchain.pk}").json()
        self.assertEqual(data["recorded_at"][:10], offchain.recorded_at.date().isoformat())
        self.assertIsNone(data["asset_id"])
        self.assertIn({"trait_type": "Recorded", "value": data["attributes"][-1]["value"]}, data["attributes"])
        minted = self.rows(self.bob, status="minted").first()
        other = client_for(self.alice).get(f"/api/v1/collectibles/{minted.pk}").json()
        self.assertTrue(other["asset_id"])
        self.assertNotIn("status", other)

    def test_summary_takes_the_time_zone(self):
        data = client_for(self.bob).get("/api/v1/me/collectibles/summary", {"tz": "America/New_York"}).json()
        self.assertEqual((data["offchain"], data["minted"], data["claimable"]), (1, 3, 1))
        self.assertFalse(data["has_wallet"])
        self.assertTrue(data["wallet_reminders"])
        from posts.models import ReminderPreference
        self.assertEqual(ReminderPreference.objects.get(user=self.bob).timezone, "America/New_York")
        client_for(self.bob).get("/api/v1/me/collectibles/summary", {"tz": "Not/AZone"})
        self.assertEqual(ReminderPreference.objects.get(user=self.bob).timezone, "America/New_York")

    def test_notification_settings(self):
        client = client_for(self.bob)
        self.assertEqual(client.get("/api/v1/me/notification-settings").json(), {"wallet_reminders": True})
        self.assertEqual(client.patch("/api/v1/me/notification-settings", {"wallet_reminders": False},
                                      format="json").json(), {"wallet_reminders": False})
        self.assertEqual(client.patch("/api/v1/me/notification-settings", {"wallet_reminders": "no"},
                                      format="json").status_code, 400)


class RemovalTests(CollectiblesTestCase):
    def test_account_deletion_forgets_what_isnt_on_chain(self):
        self.checkin(self.alice)
        self.irl_tap(self.bob, self.alice)
        self.enqueue.side_effect = None
        carol = make_user("carol", with_wallet=False)
        self.irl_tap(carol, self.alice)  # queued, not minted yet
        self.assertEqual(self.statuses(self.alice), ["minted", "minted", "queued"])
        response = client_for(self.alice).delete("/api/v1/users/delete-account/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.statuses(self.alice), ["minted", "minted"])

    def test_removed_checkin_takes_its_off_chain_poap(self):
        self.checkin(self.bob)
        self.checkin(self.alice)
        EventCheckin.objects.filter(user=self.bob).delete()
        self.assertFalse(self.rows(self.bob).exists())
        EventCheckin.objects.filter(user=self.alice).delete()
        self.assertEqual(self.statuses(self.alice), ["minted"])  # on-chain can't be undone

    def test_deleted_event_takes_its_off_chain_poaps(self):
        self.checkin(self.bob)
        self.checkin(self.alice)
        Post.all_objects.filter(pk=self.event.pk).delete()
        self.assertFalse(self.rows(self.bob).exists())
        self.assertEqual(self.statuses(self.alice), ["minted"])


class GuardTests(CollectiblesTestCase):
    def test_a_full_tree_pauses_minting(self):
        self.tree.return_value = {"capacity": 100, "minted": 100, "remaining": 0}
        self.irl_tap(self.bob, self.alice)
        self.assertEqual(self.statuses(self.alice), ["queued"])
        self.assertEqual(self.service.calls, [])

    def test_the_tree_alert_at_80_percent(self):
        make_user("admin", user_id=39)
        self.tree.return_value = {"capacity": 100, "minted": 85, "remaining": 15}
        self.irl_tap(self.bob, self.alice)
        self.irl_tap(make_user("carol", with_wallet=False), self.alice)
        from user.models import Notification
        alerts = Notification.objects.filter(recipient_id=39)
        self.assertEqual(alerts.count(), 1)  # once a day
        self.assertIn("85%", alerts.get().text_preview)
        self.assertEqual(self.statuses(self.alice), ["minted", "minted"])

    def test_the_daily_budget(self):
        self.enqueue_user.side_effect = None
        self.checkin(self.bob)
        self.irl_tap(make_user("carol", with_wallet=False), self.bob)
        self.irl_tap(make_user("dave", with_wallet=False), self.bob)
        self.connect(self.bob)
        with mock.patch("posts.src.collectible_mint.DAILY_MINT_CAP", 1):
            collectible_mint.mint_pending_for_user(self.bob.user_id)
        self.assertEqual(self.statuses(self.bob), ["minted", "queued", "queued"])
        self.assertEqual(self.pushes, [])  # the batch isn't through yet
        collectible_mint.mint_pending_for_user(self.bob.user_id)
        self.assertEqual(self.statuses(self.bob), ["minted"] * 3)
        self.assertEqual(self.pushes[0][1], "3 of your collectibles are now on Solana")

    def test_the_collection_not_set_up_doesnt_burn_attempts(self):
        not_ready = mock.Mock(status_code=503)
        not_ready.json.return_value = {"success": False, "error": "MEET_COLLECTION_NOT_CONFIGURED"}
        with mock.patch("posts.src.collectible_mint.requests.post", return_value=not_ready):
            self.irl_tap(self.bob, self.alice)
        row = self.rows(self.alice).get()
        self.assertEqual((row.status, row.attempts), ("queued", 0))
        self.assertGreater(row.next_attempt_at, timezone.now() + timedelta(minutes=20))

    def test_a_bad_address_fails_without_calling_the_service(self):
        User.objects.filter(pk=self.alice.pk).update(wallet_address="not-a-solana-address-at-all-0OIl")
        self.irl_tap(self.bob, User.objects.get(pk=self.alice.pk))
        row = self.rows(self.alice).get()
        self.assertEqual(row.status, "failed")
        self.assertIn("not a Solana address", row.last_error)
        self.assertEqual(self.service.calls, [])
