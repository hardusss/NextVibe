"""
Proof of Meet v2: the shared selfie at a tap (posts/src/meet_photos.py).

Covers:
- the happy path: lock → upload → send → approve → moderation → render →
  two mints → the co-authored post on both profiles → /u/meet/<slug> and its
  card switch to the selfie, the metadata JSON, the X post's "📸" line
- reject (no mint, no post, v1 card), 24 h expiry, block, account deletion
- only the two people: a third party gets 404 on every endpoint
- EXIF (GPS) never reaches the stored raw or the published card
- takedown: post gone, public images back to the v1 card, metadata without
  the photo, asset ids unchanged, private files deleted
- Proof of Meet posts can't be collected
- limits: the lock, retakes, rejections, the upload rate limit
- moderation: flagged uploads never reach the subject; outages aren't failures
- rendering: long names, no city, events, Seeker on both sides, portrait and landscape
- lazy mint for someone without a wallet
- every leaf lists both people's wallets as co-authors (creators), and so
  does the metadata JSON
"""
import io
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from posts.models import MeetPhoto, Post, Reputation
from posts.src import meet_photo_card, meet_photos, meets, moderation
from posts.src.meet_photo_store import R2PrivateStore, private_store, public_key
from posts.view_pac.meet_photo import MeetPhotoUploadThrottle, MeetPhotoView
from user.models import Block, User

Status = MeetPhoto.Status
# The real functions, before each test patches the module attributes
REAL_IMAGE_PASSES = moderation.image_passes
REAL_MINT_LEAF = meet_photos._mint_leaf
PHOTOGRAPHER_ASSET = "8xKq9ZrYpD3fQh1LmNbVcXz2Wt5Ue6Rs7Ta8Pb9Qc3fQ"
SUBJECT_ASSET = "4TzAbCdEfGhJkLmNpQrStUvWxYz123456789aBcD9aB"


def make_user(name, **extra):
    return User.objects.create_user(username=name, email=f"{name}@test.com", password="pass12345", **extra)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def photo_bytes(size=(1200, 1600), fmt="JPEG", gps=False, color=(200, 150, 120)):
    img = Image.new("RGB", size, color)
    out = io.BytesIO()
    if gps:
        exif = img.getexif()
        exif[0x010F] = "TestCam"  # Make
        gps_ifd = exif.get_ifd(0x8825)
        gps_ifd[1], gps_ifd[2] = "N", (50.0, 27.0, 5.0)
        gps_ifd[3], gps_ifd[4] = "E", (30.0, 31.0, 7.0)
        img.save(out, fmt, exif=exif)
    else:
        img.save(out, fmt)
    return out.getvalue()


def upload_file(data=None, name="selfie.jpg", content_type="image/jpeg"):
    return SimpleUploadedFile(name, data if data is not None else photo_bytes(), content_type=content_type)


def has_gps(data: bytes) -> bool:
    img = Image.open(io.BytesIO(data))
    exif = img.getexif()
    return bool(exif) and bool(exif.get_ifd(0x8825)) or b"TestCam" in data


class MeetPhotoTestCase(TestCase):
    def setUp(self):
        cache.clear()
        media = tempfile.mkdtemp()
        private = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        self.addCleanup(shutil.rmtree, private, ignore_errors=True)
        self.private_dir = private
        overrides = override_settings(
            MEDIA_ROOT=media, PUBLIC_API_URL="https://api.nextvibe.io",
            MEET_PHOTO_BUCKET="", MEET_PHOTO_LOCAL_DIR=private,
        )
        overrides.enable()
        self.addCleanup(overrides.disable)

        def patch(target, **kwargs):
            patcher = mock.patch(target, **kwargs)
            started = patcher.start()
            self.addCleanup(patcher.stop)
            return started

        # TestCase never commits: run on_commit work (purges, events, mints) right away
        patch("django.db.transaction.on_commit", side_effect=lambda func, using=None, robust=False: func())
        patch("posts.src.geocode.lookup", return_value=("Lviv", "UA"))
        self.image_check = patch("posts.src.moderation.image_passes", return_value=True)
        self.text_check = patch("posts.src.moderation.text_passes", return_value=True)
        self.events = []
        patch("posts.src.realtime.publish", side_effect=lambda ids, env: self.events.append((sorted(ids), env)) or True)
        self.pushes = []
        patch("posts.src.meet_photos._push", side_effect=lambda user, body, photo: self.pushes.append((user.username, body)))
        self.enqueued = []
        patch("posts.src.meet_photos._enqueue_mint", side_effect=self.enqueued.append)
        self.leaves = iter([PHOTOGRAPHER_ASSET, SUBJECT_ASSET, "5ThirdLeafAssetId1111111111111111111111111"])
        self.mint_leaf = patch("posts.src.meet_photos._mint_leaf", side_effect=lambda photo, meet, wallet: next(self.leaves))
        # Throttling is tested on its own
        original = MeetPhotoView.get_throttles
        MeetPhotoView.get_throttles = lambda view: []
        self.addCleanup(setattr, MeetPhotoView, "get_throttles", original)

        self.alice = make_user("alice", wallet_address="A1ice1111111111111111111111111111111111111")
        self.bob = make_user("bob", wallet_address="B0b11111111111111111111111111111111111111111")
        self.carol = make_user("carol")
        self.slug = self.tap(self.alice, self.bob)
        self.a = client_for(self.alice)
        self.b = client_for(self.bob)
        self.c = client_for(self.carol)

    def tearDown(self):
        cache.clear()

    def tap(self, a, b, when=None):
        slug = meets.tap_slug(a.user_id, b.user_id, "irl", when=when)
        rows = [Reputation.objects.create(user=u, given_by=o, points=1, source="irl", h3_geo="8928308280fffff",
                                          meet_slug=slug) for u, o in ((a, b), (b, a))]
        if when:
            Reputation.objects.filter(id__in=[r.id for r in rows]).update(created_at=when)
        return slug

    def url(self, action=""):
        return f"/api/v1/meet/{self.slug}/photo{('/' + action) if action else ''}"

    # Steps of the flow, asserting each one worked

    def lock(self, client=None):
        response = (client or self.a).post(self.url("lock"))
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def upload(self, client=None, data=None, expect=201):
        response = (client or self.a).post(self.url(), {"image": upload_file(data)}, format="multipart")
        self.assertEqual(response.status_code, expect, response.content)
        return response.json()

    def send(self, client=None):
        response = (client or self.a).post(self.url("send"))
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def decide(self, approve, client=None, expect=200):
        response = (client or self.b).post(self.url("decision"), {"approve": approve}, format="json")
        self.assertEqual(response.status_code, expect, response.content)
        return response.json()

    def sent_photo(self, data=None):
        self.lock()
        self.upload(data=data)
        self.send()
        return MeetPhoto.objects.get(meet_slug=self.slug, status=Status.PENDING)

    def approved_photo(self, data=None):
        self.sent_photo(data)
        self.decide(True)
        return MeetPhoto.objects.get(meet_slug=self.slug, status=Status.APPROVED)

    def live_photo(self, data=None):
        photo = self.approved_photo(data)
        meet_photos.mint(photo.pk)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.MINTED)
        return photo

    def public_bytes(self, variant):
        with default_storage.open(public_key(self.slug, variant), "rb") as fh:
            return fh.read()

    def private_files(self):
        store = private_store()
        return sorted(p.name for p in store.root.rglob("*.jpg"))

    def profile_ids(self, viewer_client, user):
        response = viewer_client.get(f"/api/v1/posts/posts-menu/{user.user_id}/")
        self.assertEqual(response.status_code, 200)
        return [item["post_id"] for item in response.json()["data"]]


class HappyPathTests(MeetPhotoTestCase):
    def test_full_flow_from_tap_to_live_selfie(self):
        state = self.lock()
        self.assertTrue(state["available"])
        self.assertEqual(state["taking"], {"user_id": self.alice.user_id, "username": "alice", "mine": True})
        self.assertIn(([self.bob.user_id], {"type": "meet_photo", "slug": self.slug, "status": "taking",
                                             "by": {"user_id": self.alice.user_id, "username": "alice"}}), self.events)

        state = self.upload()
        self.assertEqual(state["status"], "draft")
        photo = state["photo"]
        self.assertEqual(photo["role"], "photographer")
        self.assertEqual(photo["retakes_left"], 3)
        self.assertIn("/api/v1/meet/photo-file/", photo["preview_url"])
        # The preview is the server's own render: a 1080×1350 card
        preview = self.a.get(photo["preview_url"].replace("https://api.nextvibe.io", ""))
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(Image.open(io.BytesIO(preview.content)).size, (1080, 1350))
        self.assertEqual(self.image_check.call_count, 1)

        # The subject knows only that alice is taking a photo, never the draft
        bob_view = self.b.get(self.url()).json()
        self.assertEqual(bob_view["status"], "none")
        self.assertIsNone(bob_view["photo"])
        self.assertEqual(bob_view["taking"]["username"], "alice")
        self.assertFalse(bob_view["can_start"])

        self.send()
        self.assertEqual(self.pushes, [("bob", "@alice took your Proof of Meet photo")])
        bob_view = self.b.get(self.url()).json()
        self.assertEqual(bob_view["status"], "pending")
        self.assertEqual(bob_view["photo"]["role"], "subject")
        self.assertIsNotNone(bob_view["photo"]["preview_url"])
        self.assertIsNotNone(bob_view["photo"]["expires_at"])
        self.assertIsNone(bob_view["taking"])  # the lock is released once it's sent

        state = self.decide(True)
        self.assertEqual(state["status"], "approved")
        self.assertTrue(state["photo"]["minting"])
        self.assertEqual(self.image_check.call_count, 2)  # checked again before publishing
        photo = MeetPhoto.objects.get(meet_slug=self.slug)
        self.assertEqual(self.enqueued, [photo.pk])
        # Approved: the metadata can already be served (a leaf is indexed right after its mint)
        self.assertEqual(self.api_json(f"/meta/meet/{self.slug}.json")["attributes"][-1],
                         {"trait_type": "Selfie", "value": "Yes"})
        # …but /u/meet stays on the v1 card until it's minted
        self.assertFalse(self.api_json(f"/api/v1/meet/{self.slug}")["selfie"])

        meet_photos.mint(photo.pk)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.MINTED)
        self.assertEqual((photo.asset_id_photographer, photo.asset_id_subject), (PHOTOGRAPHER_ASSET, SUBJECT_ASSET))
        self.assertEqual((photo.wallet_photographer, photo.wallet_subject),
                         (self.alice.wallet_address, self.bob.wallet_address))
        self.assertEqual(self.mint_leaf.call_count, 2)
        self.assertIn(("alice", "@bob said yes — your Proof of Meet is live"), self.pushes)

        # One post, on both profiles, "@alice with @bob"
        post = photo.post
        self.assertEqual((post.owner, post.co_author, post.meet_slug), (self.alice, self.bob, self.slug))
        self.assertEqual(post.about, "")
        self.assertIsNone(post.location)  # the card shows the city
        self.assertEqual(post.media.get().file.name, f"meet/{self.slug}/story.jpg")
        self.assertIn(post.id, self.profile_ids(self.c, self.alice))
        self.assertIn(post.id, self.profile_ids(self.c, self.bob))
        item = self.c.get(f"/api/v1/posts/posts-menu/{self.bob.user_id}/").json()
        self.assertEqual(item["user"]["username"], "bob")  # the profile's owner, not the post's
        entry = item["data"][0]
        self.assertEqual((entry["post_type"], entry["co_author"]["username"], entry["owner"]["username"]),
                         ("proof_of_meet", "bob", "alice"))
        self.assertFalse(entry["collectable"])
        self.assertEqual(User.objects.get(pk=self.alice.pk).post_count, 1)
        self.assertEqual(User.objects.get(pk=self.bob.pk).post_count, 1)
        # The profile header's count (recomputed on every read) includes it for both
        for user in (self.alice, self.bob):
            detail = self.c.get(f"/api/v1/users/user-detail/{user.user_id}/").json()
            self.assertEqual(detail["posts_count"], 1)

        # /u/meet/<slug> and its card are the selfie now
        meet_json = self.api_json(f"/api/v1/meet/{self.slug}")
        self.assertTrue(meet_json["selfie"])
        self.assertEqual(meet_json["photo"]["post_id"], post.id)
        self.assertTrue(meet_json["card_url"].startswith(f"https://{self.media_host()}/meet/{self.slug}/og.jpg?v="))
        self.assertIn("verified on Solana · 8xK…3fQ", meet_json["proof_line"])
        card = APIClient().get(f"/api/v1/meet/{self.slug}/card.png", {"v": "story"})
        self.assertEqual(card.status_code, 200)
        self.assertEqual(card["Content-Type"], "image/jpeg")
        self.assertEqual(card["Cache-Control"], "public, max-age=300")
        self.assertEqual(Image.open(io.BytesIO(card.content)).size, (1080, 1350))
        og = APIClient().get(f"/api/v1/meet/{self.slug}/card.png", {"v": "og"})
        self.assertEqual(Image.open(io.BytesIO(og.content)).size, (1200, 630))

        # The X post gains the photo line
        meet = meets.load_meet(self.slug)
        text = meets.x_post_text(meet, viewer_id=self.alice.user_id)
        self.assertEqual(
            text,
            "Met bob in person — Proof of Meet on @NextVibeWeb3, verified on Solana. Tap phones. Prove you met.\n"
            f"📸 with bob\nhttps://nextvibe.io/u/meet/{self.slug}",
        )

    def test_metadata_json(self):
        photo = self.live_photo()
        data = self.api_json(f"/meta/meet/{self.slug}.json")
        image = f"https://{self.media_host()}/meet/{self.slug}/story.jpg"
        meet = meets.load_meet(self.slug)
        a, b = meet.people
        self.assertEqual(data["name"], f"Proof of Meet — @{a.username} × @{b.username}")
        self.assertEqual(data["symbol"], "NVMEET")
        self.assertEqual(data["image"], image)
        self.assertEqual(data["external_url"], f"https://nextvibe.io/u/meet/{self.slug}")
        self.assertTrue(data["description"].startswith(f"@{a.username} and @{b.username} met in person in Lviv on "))
        self.assertTrue(data["description"].endswith("Recorded by a phone-to-phone tap on NextVibe."))
        traits = {t["trait_type"]: t["value"] for t in data["attributes"]}
        self.assertEqual(traits["Type"], "Proof of Meet")
        self.assertEqual(traits["Tier"], "In person")
        self.assertEqual({traits["Participant A"], traits["Participant B"]}, {"alice", "bob"})
        wallets = {"alice": self.alice.wallet_address, "bob": self.bob.wallet_address}
        self.assertEqual((traits["Participant A wallet"], traits["Participant B wallet"]),
                         (wallets[a.username], wallets[b.username]))
        self.assertEqual(traits["Photographer"], "alice")
        self.assertEqual(traits["City"], "Lviv")
        self.assertEqual(traits["Event"], "—")
        self.assertEqual(traits["Pair meeting #"], 1)
        self.assertEqual(traits["Selfie"], "Yes")
        self.assertEqual(data["properties"]["files"], [{"uri": image, "type": "image/jpeg"}])
        self.assertEqual(data["properties"]["co_authors"], [
            {"username": "alice", "wallet": self.alice.wallet_address, "role": "photographer"},
            {"username": "bob", "wallet": self.bob.wallet_address, "role": "subject"},
        ])
        self.assertEqual(data["properties"]["meet_slug"], self.slug)
        self.assertEqual(data["properties"]["photo_sha256"], photo.raw_sha256)
        # Nothing before approval
        self.assertEqual(APIClient().get("/meta/meet/AAAAAAAAAAAA.json").status_code, 404)

    def test_x_post_matches_the_app(self):
        """Word for word what src/utils/__tests__/meetShare.test.ts expects."""
        self.live_photo()
        meet = meets.load_meet(self.slug)
        a, b = meet.people
        self.assertIn(f"\n📸 {a.username} with {b.username}\nhttps://", meets.x_post_text(meet))
        self.assertIn(f"\n📸 with {a.username}\nhttps://", meets.x_post_text(meet, viewer_id=b.user_id))
        from dataclasses import replace
        at_event = replace(meet, source="event", event_name="Vibeathon")
        self.assertEqual(
            meets.x_post_text(at_event, viewer_id=b.user_id),
            f"Met {a.username} at Vibeathon — checked in by tap, Proof of Meet on @NextVibeWeb3.\n"
            f"📸 with {a.username}\nhttps://nextvibe.io/u/meet/{self.slug}",
        )
        self.assertNotIn("📸", meets.x_post_text(replace(meet, selfie=False)))

    def test_onchain_name_fits_bubblegum(self):
        meet = meets.load_meet(self.slug)
        self.assertEqual(meet_photos.onchain_name(meet), f"Proof of Meet — @{meet.people[0].username} × @{meet.people[1].username}")
        long = mock.Mock(people=(mock.Mock(username="averyveryverylongname"), mock.Mock(username="другий_користувач")))
        name = meet_photos.onchain_name(long)
        self.assertLessEqual(len(name.encode()), 32)
        self.assertEqual(name, "Proof of Meet")

    def api_json(self, url):
        response = APIClient().get(url)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def media_host(self):
        from django.conf import settings
        return settings.AWS_S3_CUSTOM_DOMAIN


class RejectAndExpiryTests(MeetPhotoTestCase):
    def test_reject_mints_nothing_and_keeps_the_v1_card(self):
        self.sent_photo()
        state = self.decide(False)
        self.assertEqual(state["status"], "rejected")
        photo = MeetPhoto.objects.get(meet_slug=self.slug)
        self.assertIsNone(photo.active_slug)
        self.assertIsNotNone(photo.purged_at)
        self.assertEqual(self.private_files(), [])
        self.assertEqual(self.enqueued, [])
        self.assertFalse(Post.objects.filter(meet_slug=self.slug).exists())
        self.assertIn(("alice", "@bob passed on this one"), self.pushes)
        meet_json = APIClient().get(f"/api/v1/meet/{self.slug}").json()
        self.assertFalse(meet_json["selfie"])
        self.assertIn("/card.png?v=og", meet_json["card_url"])
        self.assertEqual(APIClient().get(f"/meta/meet/{self.slug}.json").status_code, 404)
        # One more try after the first "no"
        self.assertTrue(self.a.get(self.url()).json()["can_start"])

    def test_two_rejections_end_it(self):
        for _ in range(2):
            self.sent_photo()
            self.decide(False)
        for client in (self.a, self.b):
            response = client.post(self.url("lock"))
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["code"], "NO_MORE_TRIES")
        self.assertFalse(self.a.get(self.url()).json()["can_start"])

    def test_request_expires_after_24_hours(self):
        photo = self.sent_photo()
        MeetPhoto.objects.filter(pk=photo.pk).update(sent_at=timezone.now() - timedelta(hours=24, minutes=1))
        meet_photos.sweep()
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.EXPIRED)
        self.assertIsNone(photo.active_slug)
        # Sent photos are kept 7 days after expiry, then deleted
        self.assertIsNone(photo.purged_at)
        meet_photos.sweep(now=timezone.now() + timedelta(days=7, minutes=1))
        photo.refresh_from_db()
        self.assertIsNotNone(photo.purged_at)
        self.assertEqual(self.private_files(), [])
        # Too late to answer; the v1 card stays
        self.assertEqual(self.decide(True, expect=409)["code"], "NOT_PENDING")
        self.assertFalse(APIClient().get(f"/api/v1/meet/{self.slug}").json()["selfie"])

    def test_a_late_answer_expires_the_request(self):
        photo = self.sent_photo()
        MeetPhoto.objects.filter(pk=photo.pk).update(sent_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.b.get(self.url()).json()["status"], "expired")
        self.assertEqual(self.decide(True, expect=409)["code"], "NOT_PENDING")

    def test_only_the_subject_decides(self):
        self.sent_photo()
        response = self.a.post(self.url("decision"), {"approve": True}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "ONLY_SUBJECT")

    def test_block_expires_the_request(self):
        photo = self.sent_photo()
        response = self.b.post("/api/v1/users/block/", {"user_id": self.alice.user_id}, format="json")
        self.assertEqual(response.status_code, 201)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.EXPIRED)
        self.assertEqual(self.b.post(self.url("decision"), {"approve": True}, format="json").status_code, 404)

    def test_block_keeps_a_live_photo_until_a_takedown(self):
        photo = self.live_photo()
        Block.objects.create(blocker=self.bob, blocked=self.alice)
        meet_photos.expire_between(self.bob.user_id, self.alice.user_id)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.MINTED)
        # Blocked pairs still reach the takedown (and nothing else)
        self.assertEqual(self.b.get(self.url()).status_code, 404)
        response = self.b.post(self.url("takedown"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "taken_down")


class AccessTests(MeetPhotoTestCase):
    def test_third_party_gets_404_everywhere(self):
        self.sent_photo()
        for method, action, body in (
            ("get", "", None), ("post", "lock", None), ("post", "", {"image": upload_file()}),
            ("post", "send", None), ("post", "cancel", None), ("post", "decision", {"approve": True}),
            ("post", "takedown", None), ("post", "caption", {"about": "hi"}), ("post", "hide", {"hidden": True}),
        ):
            kwargs = {"format": "multipart"} if action == "" and method == "post" else {"format": "json"}
            response = getattr(self.c, method)(self.url(action), body, **kwargs)
            self.assertEqual(response.status_code, 404, f"{method} {action}: {response.content}")
        self.assertEqual(self.c.get("/api/v1/meet/photos/pending").json()["data"], [])
        self.assertEqual(self.c.get("/api/v1/meet/photos/mine").json()["data"], [])
        self.assertEqual(APIClient().get(self.url()).status_code, 401)

    def test_unknown_slug(self):
        for client in (self.a, self.c):
            self.assertEqual(client.get("/api/v1/meet/AAAAAAAAAAAA/photo").status_code, 404)

    def test_signed_files(self):
        self.lock()
        url = self.upload()["photo"]["preview_url"].replace("https://api.nextvibe.io", "")
        self.assertEqual(APIClient().get(url).status_code, 200)
        self.assertEqual(APIClient().get(url[:-3] + "xyz").status_code, 404)
        with mock.patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 601):
            self.assertEqual(APIClient().get(url).status_code, 404)
        self.assertEqual(APIClient().get("/api/v1/meet/photo-file/..%2F..%2Fetc").status_code, 404)

    def test_r2_urls_are_signed_for_ten_minutes(self):
        with override_settings(AWS_S3_ENDPOINT_URL="https://acc.r2.cloudflarestorage.com",
                               AWS_ACCESS_KEY_ID="key", AWS_SECRET_ACCESS_KEY="secret"):
            url = R2PrivateStore("nv-private").signed_url("meet-photos/x/raw.jpg")
        self.assertTrue(url.startswith("https://acc.r2.cloudflarestorage.com/nv-private/meet-photos/x/raw.jpg?"))
        self.assertIn("X-Amz-Expires=600", url)
        self.assertIn("X-Amz-Signature=", url)

    def test_off_without_a_private_bucket(self):
        with override_settings(MEET_PHOTO_LOCAL_DIR="", MEET_PHOTO_BUCKET=""):
            self.assertFalse(self.a.get(self.url()).json()["available"])
            response = self.a.post(self.url("lock"))
            self.assertEqual((response.status_code, response.json()["code"]), (503, "PHOTOS_UNAVAILABLE"))
            self.assertFalse(APIClient().get(f"/api/v1/meet/{self.slug}").json()["photo_available"])
        self.assertTrue(APIClient().get(f"/api/v1/meet/{self.slug}").json()["photo_available"])

    def test_pending_list(self):
        self.sent_photo()
        data = self.b.get("/api/v1/meet/photos/pending").json()["data"]
        self.assertEqual([(d["slug"], d["status"], d["photographer"]["username"]) for d in data],
                         [(self.slug, "pending", "alice")])
        self.assertEqual(self.a.get("/api/v1/meet/photos/pending").json()["data"], [])


class ImageTests(MeetPhotoTestCase):
    def test_exif_gps_never_stored_or_published(self):
        original = photo_bytes(gps=True)
        self.assertTrue(has_gps(original))
        photo = self.live_photo(data=original)
        store = private_store()
        raw = store.get(photo.raw_key)
        self.assertFalse(has_gps(raw))
        self.assertNotIn(b"Exif", raw[:4096])
        for variant in ("story", "og"):
            self.assertFalse(has_gps(self.public_bytes(variant)))
        self.assertEqual(Image.open(io.BytesIO(raw)).format, "JPEG")

    def test_orientation_applied_and_size_capped(self):
        img = Image.new("RGB", (4000, 3000), (10, 20, 30))
        exif = img.getexif()
        exif[0x0112] = 6  # rotate 90° CW to display
        out = io.BytesIO()
        img.save(out, "JPEG", exif=exif)
        photo = self.approved_photo(data=out.getvalue())
        raw = Image.open(io.BytesIO(private_store().get(photo.raw_key)))
        self.assertEqual(raw.size, (1536, 2048))  # upright, long side 2048

    def test_accepted_and_refused_files(self):
        self.lock()
        self.upload(data=photo_bytes(fmt="PNG"))
        gif = io.BytesIO()
        Image.new("RGB", (10, 10)).save(gif, "GIF")
        response = self.a.post(self.url(), {"image": upload_file(gif.getvalue(), "a.gif", "image/gif")}, format="multipart")
        self.assertEqual((response.status_code, response.json()["code"]), (415, "UNSUPPORTED"))
        big = SimpleUploadedFile("big.jpg", b"\xff\xd8" + b"0" * (8 * 1024 * 1024), content_type="image/jpeg")
        response = self.a.post(self.url(), {"image": big}, format="multipart")
        self.assertEqual((response.status_code, response.json()["code"]), (413, "TOO_LARGE"))
        response = self.a.post(self.url(), {}, format="multipart")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "NO_IMAGE"))

    def test_heic_accepted(self):
        try:
            import pillow_heif
        except ImportError:
            self.skipTest("pillow-heif not installed")
        pillow_heif.register_heif_opener()
        out = io.BytesIO()
        try:
            Image.new("RGB", (800, 600), (120, 80, 60)).save(out, "HEIF")
        except Exception:
            self.skipTest("no HEIF encoder in this build")
        self.lock()
        self.upload(data=out.getvalue())
        photo = MeetPhoto.objects.get(meet_slug=self.slug)
        self.assertEqual(Image.open(io.BytesIO(private_store().get(photo.raw_key))).format, "JPEG")


class TakedownTests(MeetPhotoTestCase):
    def test_takedown_removes_the_face_everywhere_we_control(self):
        photo = self.live_photo()
        post_id = photo.post_id
        selfie_story = self.public_bytes("story")
        response = self.b.post(self.url("takedown"))
        self.assertEqual(response.status_code, 200, response.content)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.TAKEN_DOWN)
        self.assertIsNotNone(photo.taken_down_at)
        # The post is gone from both profiles
        self.assertFalse(Post.all_objects.filter(pk=post_id).exists())
        self.assertNotIn(post_id, self.profile_ids(self.c, self.alice))
        self.assertEqual(User.objects.get(pk=self.alice.pk).post_count, 0)
        # Same URLs, now the v1 card (a JPEG, no photo)
        for variant, size in (("story", (1080, 1350)), ("og", (1200, 630))):
            data = self.public_bytes(variant)
            img = Image.open(io.BytesIO(data))
            self.assertEqual((img.format, img.size), ("JPEG", size))
        self.assertNotEqual(self.public_bytes("story"), selfie_story)
        # Metadata: same image URL, no "Selfie" and no photo hash
        data = APIClient().get(f"/meta/meet/{self.slug}.json").json()
        self.assertNotIn("Selfie", [t["trait_type"] for t in data["attributes"]])
        self.assertNotIn("photo_sha256", data["properties"])
        self.assertTrue(data["image"].endswith(f"/meet/{self.slug}/story.jpg"))
        # The cNFTs stay, with the same ids
        self.assertEqual((photo.asset_id_photographer, photo.asset_id_subject), (PHOTOGRAPHER_ASSET, SUBJECT_ASSET))
        # /u/meet is the v1 card again, still verified on Solana
        meet_json = APIClient().get(f"/api/v1/meet/{self.slug}").json()
        self.assertFalse(meet_json["selfie"])
        self.assertIn("verified on Solana", meet_json["proof_line"])
        self.assertEqual(APIClient().get(f"/api/v1/meet/{self.slug}/card.png")["Content-Type"], "image/png")
        # Private files deleted, and nobody can start another selfie for this meet
        self.assertEqual(self.private_files(), [])
        self.assertEqual(self.a.post(self.url("lock")).json()["code"], "PHOTO_EXISTS")
        # Idempotent
        self.assertEqual(self.a.post(self.url("takedown")).status_code, 200)
        self.assertIn(([self.alice.user_id, self.bob.user_id],
                       {"type": "meet_photo", "slug": self.slug, "status": "taken_down", "photo_id": photo.pk}),
                      self.events)

    def test_takedown_while_pending(self):
        photo = self.sent_photo()
        self.assertEqual(self.a.post(self.url("takedown")).status_code, 200)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.TAKEN_DOWN)
        self.assertEqual(self.decide(True, expect=409)["code"], "NOT_PENDING")
        self.assertFalse(default_storage.exists(public_key(self.slug, "story")))

    def test_account_deletion_takes_photos_down(self):
        photo = self.live_photo()
        response = self.b.delete("/api/v1/users/delete-account/")
        self.assertEqual(response.status_code, 200)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.TAKEN_DOWN)
        self.assertFalse(Post.all_objects.filter(meet_slug=self.slug).exists())
        data = APIClient().get(f"/meta/meet/{self.slug}.json").json()
        subject = data["properties"]["co_authors"][1]
        self.assertEqual(subject, {"username": f"deleted_user_{self.bob.user_id}", "wallet": None, "role": "subject"})
        # The JSON stops naming his wallet (his and alice's leaves keep it on-chain)
        wallet_traits = {t["trait_type"]: t["value"] for t in data["attributes"] if t["trait_type"].endswith("wallet")}
        self.assertEqual(wallet_traits, {"Participant A wallet": self.alice.wallet_address})

    def test_legacy_delete_hides_from_the_owners_profile_only(self):
        photo = self.live_photo()
        response = self.a.delete(f"/api/v1/posts/delete-post/?postId={photo.post_id}")
        self.assertEqual(response.json()["code"], "HIDDEN_FROM_PROFILE")
        self.assertNotIn(photo.post_id, self.profile_ids(self.c, self.alice))
        self.assertIn(photo.post_id, self.profile_ids(self.c, self.bob))
        self.assertTrue(Post.objects.filter(pk=photo.post_id, is_hide=False).exists())


class PostTests(MeetPhotoTestCase):
    def test_not_collectable(self):
        photo = self.live_photo()
        response = self.c.post("/api/v1/posts/collect/prepare/", {"postId": photo.post_id}, format="json")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "NOT_COLLECTABLE"))
        response = self.a.post("/api/v1/posts/cnft-mint/", {"postId": photo.post_id}, format="json")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "NOT_COLLECTABLE"))
        data = self.c.get(f"/api/v1/posts/get-post/?postId={photo.post_id}").json()["data"]
        self.assertEqual((data["post_type"], data["collectable"], data["co_author"]["username"]),
                         ("proof_of_meet", False, "bob"))

    def test_feed(self):
        photo = self.live_photo()
        dave = make_user("dave")
        results = client_for(dave).get("/api/v1/posts/recommendation-feed/").json()["results"]
        entry = next(r for r in results if r["id"] == photo.post_id)
        self.assertEqual((entry["post_type"], entry["co_author"]["username"], entry["owner__username"]),
                         ("proof_of_meet", "bob", "alice"))
        self.assertFalse(entry["collectable"])
        # Not in your own feed as the co-author
        cache.clear()
        results = self.b.get("/api/v1/posts/recommendation-feed/").json()["results"]
        self.assertNotIn(photo.post_id, [r["id"] for r in results])
        # Hidden from someone who blocked the co-author
        Block.objects.create(blocker=dave, blocked=self.bob)
        cache.clear()
        results = client_for(dave).get("/api/v1/posts/recommendation-feed/").json()["results"]
        self.assertNotIn(photo.post_id, [r["id"] for r in results])
        self.assertEqual(client_for(dave).get(f"/api/v1/posts/get-post/?postId={photo.post_id}").status_code, 404)

    def test_hide_from_my_profile(self):
        photo = self.live_photo()
        response = self.b.post(self.url("hide"), {"hidden": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(photo.post_id, self.profile_ids(self.c, self.bob))
        self.assertIn(photo.post_id, self.profile_ids(self.c, self.alice))
        self.assertTrue(self.b.get(f"/api/v1/posts/get-post/?postId={photo.post_id}").json()["data"]["hidden_on_my_profile"])
        self.b.post(self.url("hide"), {"hidden": False}, format="json")
        self.assertIn(photo.post_id, self.profile_ids(self.c, self.bob))

    def test_caption_last_edit_wins(self):
        photo = self.live_photo()
        self.assertEqual(self.b.post(self.url("caption"), {"about": "Lviv nights"}, format="json").status_code, 200)
        self.assertEqual(self.a.post(self.url("caption"), {"about": "  Superteam  "}, format="json").status_code, 200)
        self.assertEqual(Post.objects.get(pk=photo.post_id).about, "Superteam")
        self.text_check.return_value = False
        response = self.b.post(self.url("caption"), {"about": "bad words"}, format="json")
        self.assertEqual((response.status_code, response.json()["code"]), (422, "CAPTION_REJECTED"))
        self.assertEqual(Post.objects.get(pk=photo.post_id).about, "Superteam")
        response = self.a.post(self.url("caption"), {"about": "x" * 256}, format="json")
        self.assertEqual(response.json()["code"], "CAPTION_TOO_LONG")

    def test_clients_cant_forge_proof_of_meet_posts(self):
        response = self.c.post("/api/v1/posts/posts/", {"about": "hi", "owner": self.carol.user_id,
                                                        "co_author": self.alice.user_id, "meet_slug": self.slug},
                               format="json")
        self.assertIn(response.status_code, (200, 201))
        post = Post.all_objects.get(pk=response.json()["id"])
        self.assertIsNone(post.co_author)
        self.assertIsNone(post.meet_slug)


class LimitTests(MeetPhotoTestCase):
    def test_lock_decides_who_takes_the_photo(self):
        self.lock(self.a)
        response = self.b.post(self.url("lock"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "LOCKED")
        self.assertEqual(response.json()["photographer"], "alice")
        response = self.b.post(self.url(), {"image": upload_file()}, format="multipart")
        self.assertEqual(response.json()["code"], "LOCKED")
        # Locking again is fine for the one who has it
        self.lock(self.a)

    def test_lock_expires_and_the_other_can_start(self):
        self.lock(self.a)
        self.upload(self.a)
        cache.delete(meet_photos.lock_key(self.slug))  # 3 minutes later: the app was killed
        state = self.lock(self.b)
        self.assertEqual(state["taking"]["username"], "bob")
        stale = MeetPhoto.objects.get(photographer=self.alice)
        self.assertEqual(stale.status, Status.EXPIRED)
        self.assertIsNotNone(stale.purged_at)  # never sent: gone right away
        self.upload(self.b)
        self.send(self.b)
        self.assertEqual(MeetPhoto.objects.get(status=Status.PENDING).subject, self.alice)

    def test_cancel_releases_the_meet(self):
        self.lock(self.a)
        self.upload(self.a)
        self.assertEqual(self.a.post(self.url("cancel")).status_code, 200)
        self.assertEqual(MeetPhoto.objects.get().status, Status.EXPIRED)
        self.assertIn(([self.bob.user_id], {"type": "meet_photo", "slug": self.slug, "status": "released"}), self.events)
        self.assertTrue(self.b.get(self.url()).json()["can_start"])

    def test_three_retakes(self):
        self.lock()
        first = self.upload()["photo"]["preview_url"]
        for left in (2, 1, 0):
            self.assertEqual(self.upload()["photo"]["retakes_left"], left)
        response = self.a.post(self.url(), {"image": upload_file()}, format="multipart")
        self.assertEqual((response.status_code, response.json()["code"]), (409, "NO_MORE_RETAKES"))
        photo = MeetPhoto.objects.get()
        self.assertEqual(photo.retakes, 3)
        # Retakes replace the photo; the old files are deleted
        self.assertEqual(len(self.private_files()), 3)
        self.assertNotEqual(self.a.get(self.url()).json()["photo"]["preview_url"], first)

    def test_upload_rate_limit(self):
        MeetPhotoView.get_throttles = lambda view: [MeetPhotoUploadThrottle()] if view.request.method == "POST" else []
        other_slug = self.tap(self.alice, self.carol)
        self.lock()
        for _ in range(4):
            self.upload()
        client = self.a
        response = client.post(f"/api/v1/meet/{other_slug}/photo/lock")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.post(f"/api/v1/meet/{other_slug}/photo", {"image": upload_file()},
                                     format="multipart").status_code, 201)
        response = client.post(f"/api/v1/meet/{other_slug}/photo", {"image": upload_file()}, format="multipart")
        self.assertEqual(response.status_code, 429)

    def test_one_selfie_per_meet_and_a_new_meet_gets_its_own(self):
        self.live_photo()
        self.assertEqual(self.a.post(self.url("lock")).json()["code"], "PHOTO_EXISTS")
        self.assertEqual(self.b.post(self.url("lock")).json()["code"], "PHOTO_EXISTS")
        tomorrow = self.tap(self.alice, self.bob, when=timezone.now() + timedelta(days=1))
        self.assertNotEqual(tomorrow, self.slug)
        self.assertEqual(self.b.post(f"/api/v1/meet/{tomorrow}/photo/lock").status_code, 200)


class ModerationTests(MeetPhotoTestCase):
    def test_flagged_upload_never_reaches_the_subject(self):
        self.lock()
        self.image_check.return_value = False
        response = self.a.post(self.url(), {"image": upload_file()}, format="multipart")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"error": "This photo can't be used — try another one.",
                                           "code": "MODERATION_FAILED"})
        photo = MeetPhoto.objects.get()
        self.assertEqual((photo.status, photo.active_slug), (Status.MODERATION_FAILED, None))
        self.assertEqual(self.b.get(self.url()).json()["status"], "none")
        self.assertEqual(self.pushes, [])
        # Raw kept 24 h for review, then deleted
        meet_photos.sweep()
        self.assertEqual(len(self.private_files()), 1)
        meet_photos.sweep(now=timezone.now() + timedelta(hours=25))
        self.assertEqual(self.private_files(), [])
        # Try another one
        self.image_check.return_value = True
        self.upload()

    def test_flagged_at_approval(self):
        self.sent_photo()
        self.image_check.return_value = False
        response = self.b.post(self.url("decision"), {"approve": True}, format="json")
        self.assertEqual((response.status_code, response.json()["code"]), (422, "MODERATION_FAILED"))
        photo = MeetPhoto.objects.get()
        self.assertEqual(photo.status, Status.MODERATION_FAILED)
        self.assertEqual(self.enqueued, [])
        self.assertFalse(default_storage.exists(public_key(self.slug, "story")))
        self.assertIn(([self.alice.user_id, self.bob.user_id],
                       {"type": "meet_photo", "slug": self.slug, "status": "moderation_failed", "photo_id": photo.pk}),
                      self.events)

    def test_moderation_outage_is_not_a_failure(self):
        self.lock()
        self.image_check.side_effect = moderation.ModerationUnavailable()
        response = self.a.post(self.url(), {"image": upload_file()}, format="multipart")
        self.assertEqual((response.status_code, response.json()["code"]), (503, "MODERATION_UNAVAILABLE"))
        self.assertFalse(MeetPhoto.objects.exists())
        self.assertEqual(self.private_files(), [])
        self.image_check.side_effect = None
        self.upload()
        self.send()
        self.image_check.side_effect = moderation.ModerationUnavailable()
        response = self.b.post(self.url("decision"), {"approve": True}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(MeetPhoto.objects.get().status, Status.PENDING)

    def test_go_service_results(self):
        def answer(passed, category=""):
            response = mock.Mock()
            response.raise_for_status.return_value = None
            response.json.return_value = {"passed": passed, "files": [{"passed": passed, "category": category}],
                                          "text": {"passed": True}}
            return response

        with mock.patch("posts.src.moderation.requests.post", return_value=answer(True)) as post:
            self.assertTrue(REAL_IMAGE_PASSES("https://r2/signed.jpg", ref=self.slug))
            self.assertEqual(post.call_args.kwargs["json"], {
                "id": f"meet-photo-{self.slug}", "content": "", "media_urls": ["https://r2/signed.jpg"]})
        with mock.patch("posts.src.moderation.requests.post", return_value=answer(False, "sexual, violence")):
            self.assertFalse(REAL_IMAGE_PASSES("https://r2/signed.jpg", ref=self.slug))
        for category in ("network_error", "api_error", "api_key_missing"):
            with mock.patch("posts.src.moderation.requests.post", return_value=answer(False, category)):
                with self.assertRaises(moderation.ModerationUnavailable):
                    REAL_IMAGE_PASSES("https://r2/signed.jpg", ref=self.slug)
        with mock.patch("posts.src.moderation.requests.post", side_effect=ConnectionError()):
            with self.assertRaises(moderation.ModerationUnavailable):
                REAL_IMAGE_PASSES("https://r2/signed.jpg", ref=self.slug)

    def test_callback_ignores_photo_checks(self):
        response = APIClient().post("/api/v1/posts/moderation-callback/", {"id": "meet-photo-AbC", "files": []},
                                    format="json")
        self.assertEqual(response.json(), {"status": "ignored"})


class MintTests(MeetPhotoTestCase):
    def fake_nft_service(self):
        """The real _mint_leaf against a stubbed nft-service; returns the bodies it gets."""
        bodies = []
        assets = iter([PHOTOGRAPHER_ASSET, SUBJECT_ASSET])

        def post(url, json, timeout):
            bodies.append(json)
            response = mock.Mock(status_code=200)
            response.json.return_value = {"success": True, "assetId": next(assets), "signature": "sig"}
            return response

        self.mint_leaf.side_effect = REAL_MINT_LEAF
        patcher = mock.patch("posts.src.meet_photos.requests.post", side_effect=post)
        patcher.start()
        self.addCleanup(patcher.stop)
        return bodies

    def test_every_leaf_lists_both_wallets(self):
        bodies = self.fake_nft_service()
        self.live_photo()
        alice, bob = self.alice.wallet_address, self.bob.wallet_address
        # alice is the meet's A (she confirmed the tap): the same order on both leaves
        self.assertEqual([(body["recipient"], body["coAuthors"]) for body in bodies],
                         [(alice, [alice, bob]), (bob, [alice, bob])])

    def test_a_late_wallet_is_on_its_own_leaf_and_in_the_json(self):
        bodies = self.fake_nft_service()
        User.objects.filter(pk=self.bob.pk).update(wallet_address=None)
        photo = self.approved_photo()
        meet_photos.mint(photo.pk)
        alice = self.alice.wallet_address
        self.assertEqual([(body["recipient"], body["coAuthors"]) for body in bodies], [(alice, [alice])])

        def wallets():
            data = APIClient().get(f"/meta/meet/{self.slug}.json").json()
            return {t["trait_type"]: t["value"] for t in data["attributes"] if t["trait_type"].endswith("wallet")}

        self.assertEqual(wallets(), {"Participant A wallet": alice})
        # He connects one: his leaf names both, alice's stays as minted
        User.objects.filter(pk=self.bob.pk).update(wallet_address="B0bNew111111111111111111111111111111111111")
        meet_photos.mint_for_user(self.bob.user_id)
        bob = "B0bNew111111111111111111111111111111111111"
        self.assertEqual(bodies[1]["recipient"], bob)
        self.assertEqual(bodies[1]["coAuthors"], [alice, bob])
        self.assertEqual(wallets(), {"Participant A wallet": alice, "Participant B wallet": bob})

    def test_co_author_wallets(self):
        photo = self.approved_photo()
        meet = meets.load_meet(self.slug)
        alice, bob = self.alice.wallet_address, self.bob.wallet_address
        self.assertEqual(meet_photos.co_author_wallets(photo, meet), [alice, bob])
        # The wallet a leaf went to wins over one connected later
        photo.wallet_photographer = "A1iceOld11111111111111111111111111111111111"
        self.assertEqual(meet_photos.co_author_wallets(photo, meet), ["A1iceOld11111111111111111111111111111111111", bob])
        # A wallet is listed once, even if it moved between the two accounts
        photo.wallet_photographer = bob
        self.assertEqual(meet_photos.co_author_wallets(photo, meet), [bob])
        photo.wallet_photographer = ""
        # Nobody lists a banned person's wallet on a new leaf, or a deleted account's ever
        photo.subject.is_baned = True
        self.assertEqual(meet_photos.co_author_wallets(photo, meet), [alice])
        photo.subject.is_baned = False
        photo.wallet_subject = bob
        photo.subject.auth_provider = "deleted"
        self.assertEqual(meet_photos.co_author_wallets(photo, meet), [alice])

    def test_lazy_mint_for_someone_without_a_wallet(self):
        self.bob.wallet_address = None  # the test client holds this very object
        self.bob.save(update_fields=["wallet_address"])
        photo = self.approved_photo()
        meet_photos.mint(photo.pk)
        photo.refresh_from_db()
        # Live with alice's leaf; bob's lands when he connects a wallet
        self.assertEqual(photo.status, Status.MINTED)
        self.assertEqual((photo.asset_id_photographer, photo.asset_id_subject), (PHOTOGRAPHER_ASSET, ""))
        state = self.b.get(self.url()).json()
        self.assertTrue(state["photo"]["waiting_for_wallet"])
        with mock.patch("posts.tasks.mint_meet_photos_for_user.delay", side_effect=meet_photos.mint_for_user) as delay, \
                mock.patch("user.views_pac.save_wallet_address.verify_seeker_in_background"):
            response = self.b.post("/api/v1/users/save-wallet/",
                                   {"walletAddress": "B0bNew111111111111111111111111111111111111"}, format="json")
            self.assertEqual(response.status_code, 200)
            delay.assert_called_once_with(self.bob.user_id)
        photo.refresh_from_db()
        self.assertEqual(photo.asset_id_subject, SUBJECT_ASSET)
        self.assertEqual(photo.wallet_subject, "B0bNew111111111111111111111111111111111111")
        self.assertEqual(Post.objects.filter(meet_slug=self.slug).count(), 1)

    def test_no_wallets_waits(self):
        User.objects.filter(pk__in=[self.alice.pk, self.bob.pk]).update(wallet_address=None)
        photo = self.approved_photo()
        meet_photos.mint(photo.pk)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.APPROVED)
        self.assertFalse(Post.objects.filter(meet_slug=self.slug).exists())

    def test_failed_mint_is_retried_by_the_sweep(self):
        photo = self.approved_photo()
        self.mint_leaf.side_effect = meet_photos.MintError("MINT_SEND_FAILED")
        meet_photos.mint(photo.pk)
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.APPROVED)
        self.assertTrue(self.a.get(self.url()).json()["photo"]["minting"])
        self.mint_leaf.side_effect = lambda p, m, w: next(self.leaves)
        meet_photos.sweep()
        photo.refresh_from_db()
        self.assertEqual(photo.status, Status.MINTED)

    def test_mints_never_overlap(self):
        photo = self.approved_photo()
        cache.add(f"meet_photo_mint:{photo.pk}", 1, 300)
        meet_photos.mint(photo.pk)
        self.assertEqual(self.mint_leaf.call_count, 0)

    def test_taken_down_before_the_mint_finished(self):
        photo = self.approved_photo()
        self.b.post(self.url("takedown"))
        meet_photos.mint(photo.pk)
        self.assertEqual(self.mint_leaf.call_count, 0)
        self.assertFalse(Post.all_objects.filter(meet_slug=self.slug).exists())

    def test_nft_service_request(self):
        photo = self.approved_photo()
        meet = meets.load_meet(self.slug)
        response = mock.Mock(status_code=200)
        response.json.return_value = {"success": True, "assetId": "Asset111", "signature": "sig"}
        with mock.patch("posts.src.meet_photos.requests.post", return_value=response) as post:
            self.assertEqual(REAL_MINT_LEAF(photo, meet, "W"), "Asset111")
        self.assertTrue(post.call_args.args[0].endswith("/mint/meet"))
        self.assertEqual(post.call_args.kwargs["json"], {
            "recipient": "W", "slug": self.slug, "name": meet_photos.onchain_name(meet),
            "uri": f"https://api.nextvibe.io/meta/meet/{self.slug}.json",
            "coAuthors": [self.alice.wallet_address, self.bob.wallet_address],
        })
        response.json.return_value = {"success": False, "error": "MEET_COLLECTION_NOT_CONFIGURED"}
        response.status_code = 503
        with mock.patch("posts.src.meet_photos.requests.post", return_value=response):
            with self.assertRaisesRegex(meet_photos.MintError, "MEET_COLLECTION_NOT_CONFIGURED"):
                REAL_MINT_LEAF(photo, meet, "W")


class RenderTests(TestCase):
    """Cards for every shape of meet (no database: the Meet is built by hand)."""

    def meet(self, **overrides):
        from datetime import datetime, timezone as dt_timezone
        from zoneinfo import ZoneInfo

        def person(uid, name, seeker=False, number=1):
            return meets.MeetPerson(user_id=uid, username=name, avatar_name="", seeker=seeker, official=False,
                                    deleted=False, points=1, number=number)

        values = dict(
            slug="AbCdEfGhIjKl", source="irl", tier="in_person",
            met_at=datetime(2026, 9, 23, 15, 10, tzinfo=dt_timezone.utc),
            people=(person(1, "danklepar", number=14), person(2, "toji")),
            event_id=None, event_name=None, city="Lviv", tz=ZoneInfo("Europe/Kyiv"), pair_count=1,
            pair_first_at=datetime(2026, 9, 23, 15, 10, tzinfo=dt_timezone.utc), asset_id=None,
        )
        values.update(overrides)
        return meets.Meet(**values)

    def check(self, meet, photo):
        for variant, size in (("story", (1080, 1350)), ("og", (1200, 630))):
            data = meet_photo_card.render_jpeg(meet, photo, variant)
            img = Image.open(io.BytesIO(data))
            self.assertEqual((img.format, img.size), ("JPEG", size))

    def test_shapes(self):
        from datetime import datetime, timezone as dt_timezone
        portrait = Image.new("RGB", (1536, 2048), (200, 150, 120))
        landscape = Image.new("RGB", (2048, 1365), (90, 120, 200))
        both_seeker = (meets.MeetPerson(1, "danklepar", "", True, False, False, 1, 14),
                       meets.MeetPerson(2, "toji", "", True, False, False, 1, 3))
        cases = [
            self.meet(),
            self.meet(city=None, tz=None),
            self.meet(people=(meets.MeetPerson(1, "a" * 40, "", True, False, False, 1, 2),
                              meets.MeetPerson(2, "другий_користувач_довгий_нік", "", False, False, False, 1, 1))),
            self.meet(source="event", tier="organizer_verified", event_id=5,
                      event_name="Superteam Ukraine Vibeathon — a very long event name that goes on", people=both_seeker,
                      pair_count=3, pair_first_at=datetime(2026, 9, 21, 10, tzinfo=dt_timezone.utc),
                      asset_id=PHOTOGRAPHER_ASSET),
        ]
        for meet in cases:
            for photo in (portrait, landscape):
                self.check(meet, photo)

    def test_text(self):
        from datetime import datetime, timezone as dt_timezone
        text = meet_photo_card.selfie_text(self.meet())
        self.assertEqual(text.when_line, "Lviv · Wed, Sep 23, 2026 · 18:10")
        self.assertEqual(text.history, "#14 for @danklepar · #1 for @toji")
        self.assertEqual(text.proof, "recorded on NextVibe")
        again = meet_photo_card.selfie_text(self.meet(
            pair_count=3, pair_first_at=datetime(2026, 9, 21, 10, tzinfo=dt_timezone.utc), asset_id=PHOTOGRAPHER_ASSET))
        self.assertEqual(again.history, "3rd time meeting · first: Sep 21")
        self.assertEqual(again.proof, "verified on Solana · 8xK…3fQ")
        self.assertEqual(meet_photo_card.selfie_text(self.meet(city=None, tz=None)).when_line,
                         "In person · Wed, Sep 23, 2026 · 15:10 UTC")
