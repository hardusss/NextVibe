import io
import shutil
import tempfile
from unittest import mock
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from user.src import seeker_card

User = get_user_model()


def _image_bytes(fmt="PNG", size=(400, 300), color=(200, 60, 90)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, fmt)
    return buf.getvalue()


class SeekerShareTest(TestCase):
    """Seeker Verified card image, share-page data and username lookup."""

    def setUp(self):
        cache.clear()  # scoped throttles live in locmem across tests
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        overrides = override_settings(MEDIA_ROOT=media, PUBLIC_API_URL="https://api.nextvibe.io")
        overrides.enable()
        self.addCleanup(overrides.disable)
        self.alice = self.verified("alice")
        self.bob = User.objects.create_user(email="bob@example.com", username="bob", password="Password123!")

    def verified(self, username, source="onchain", **extra):
        return User.objects.create_user(
            email=f"{abs(hash(username))}@example.com", username=username, password="Password123!",
            seeker_verified=True, seeker_verified_source=source, **extra,
        )

    def card(self, username, **params):
        return self.client.get(f"/api/v1/users/{quote(username, safe='')}/seeker-card.png", params)

    def share(self, username, **headers):
        return self.client.get(f"/api/v1/users/{quote(username, safe='')}/seeker-share/", **headers)

    # ── Card image ─────────────────────────────────────────────────────

    def test_card_is_a_1200x630_png(self):
        res = self.card("alice")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(Image.open(io.BytesIO(res.content)).size, (1200, 630))

    def test_card_renders_once_then_comes_from_storage(self):
        version = seeker_card.card_version(self.alice)
        with mock.patch.object(seeker_card, "render_card", wraps=seeker_card.render_card) as render:
            first = self.card("alice")
            second = self.card("alice")
        self.assertEqual(render.call_count, 1)
        self.assertEqual(first.content, second.content)
        self.assertTrue(default_storage.exists(f"seeker-cards/{self.alice.user_id}-v{version}.png"))

    def test_card_cache_headers(self):
        version = seeker_card.card_version(self.alice)
        self.assertEqual(self.card("alice", v=version)["Cache-Control"], "public, max-age=86400, immutable")
        # The app's "Share image" asks without a version and must see the latest card
        self.assertEqual(self.card("alice")["Cache-Control"], "no-cache")
        self.assertEqual(self.card("alice", v="0000000000")["Cache-Control"], "no-cache")

    def test_card_404_unless_verified(self):
        self.verified("banned", is_baned=True)
        self.verified("gone", is_active=False)
        for username in ("bob", "nobody", "banned", "gone"):
            res = self.card(username)
            self.assertEqual(res.status_code, 404, username)
            self.assertEqual(res["Cache-Control"], "no-store")

    def test_version_follows_avatar_username_and_source(self):
        versions = {seeker_card.card_version(self.alice)}
        self.alice.avatar = "images/new.png"
        versions.add(seeker_card.card_version(self.alice))
        self.alice.username = "alice_2"
        versions.add(seeker_card.card_version(self.alice))
        self.alice.seeker_verified_source = "skr"
        versions.add(seeker_card.card_version(self.alice))
        self.assertEqual(len(versions), 4)
        self.assertIn(seeker_card.card_version(self.alice), versions)  # stable for the same input

    def test_new_avatar_renders_a_new_card(self):
        self.card("alice")
        default_storage.save("images/new.png", ContentFile(_image_bytes()))
        self.alice.avatar = "images/new.png"
        self.alice.save()
        with mock.patch.object(seeker_card, "render_card", wraps=seeker_card.render_card) as render:
            self.assertEqual(self.card("alice").status_code, 200)
        self.assertEqual(render.call_count, 1)
        self.assertEqual(len(default_storage.listdir("seeker-cards")[1]), 2)

    def test_stored_avatar_is_drawn(self):
        default_storage.save("images/photo.jpg", ContentFile(_image_bytes("JPEG", (900, 700))))
        self.alice.avatar = "images/photo.jpg"
        self.assertIsNotNone(seeker_card.load_avatar(self.alice))

    def test_missing_or_broken_avatar_falls_back_to_default(self):
        default_storage.save("images/broken.jpg", ContentFile(b"not an image"))
        for name in ("images/broken.jpg", "images/does-not-exist.png", ""):
            self.alice.avatar = name
            self.alice.save()
            self.assertIsNone(seeker_card.load_avatar(self.alice), name)
            self.assertEqual(self.card("alice").status_code, 200, name)

    def test_absolute_avatar_urls_only_from_known_hosts(self):
        for url, allowed in (
            ("https://lh3.googleusercontent.com/a/photo", True),
            ("https://res.cloudinary.com/demo/image/upload/a.jpg", True),
            ("http://lh3.googleusercontent.com/a/photo", False),
            ("https://169.254.169.254/latest/meta-data/", False),
            ("https://googleusercontent.com.evil.example/a.png", False),
            ("https://localhost/admin/", False),
        ):
            self.assertEqual(seeker_card._is_avatar_host(url), allowed, url)

        self.alice.avatar = "https://169.254.169.254/latest/meta-data/"
        with mock.patch.object(seeker_card.requests, "get") as get:
            self.assertIsNone(seeker_card.load_avatar(self.alice))
        get.assert_not_called()

    def test_huge_avatar_is_rejected_before_decoding(self):
        buf = io.BytesIO()
        Image.new("1", (7000, 7000)).save(buf, "PNG")  # tiny file, 49M pixels
        default_storage.save("images/bomb.png", ContentFile(buf.getvalue()))
        self.alice.avatar = "images/bomb.png"
        self.assertIsNone(seeker_card.load_avatar(self.alice))

    def test_renders_long_skr_and_non_latin_usernames(self):
        for username in ("x" * 150, "vibes.skr", "іван_петренко", "emoji😀name", "中文用户"):
            png = seeker_card.render_card(username, None, "skr")
            self.assertEqual(Image.open(io.BytesIO(png)).size, (1200, 630), username)

    def test_long_username_shrinks_then_gets_an_ellipsis(self):
        font, text, _ = seeker_card._fit_username("@alice", 800)
        self.assertEqual((text, font.size), ("@alice", 46))

        font, text, badge = seeker_card._fit_username("@" + "x" * 150, 800)
        self.assertTrue(text.endswith("…"))
        self.assertEqual(font.size, 26)
        self.assertLessEqual(font.getlength(text) + badge * 1.3, 800)

    def test_subline_matches_how_the_badge_was_granted(self):
        self.assertEqual(seeker_card.card_subline("onchain"), "Genesis Token confirmed on-chain")
        self.assertEqual(seeker_card.card_subline(None), "Genesis Token confirmed on-chain")
        self.assertEqual(seeker_card.card_subline("skr"), "Seeker ID (.skr) confirmed")

    # ── Share data for nextvibe.io/u/verified/<username> ────────────────────────

    def test_share_data_for_verified_user(self):
        res = self.share("alice")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "public, max-age=60")
        self.assertEqual(res.json(), {
            "username": "alice",
            "source": "onchain",
            "subline": "Genesis Token confirmed on-chain",
            "card_url": (
                "https://api.nextvibe.io/api/v1/users/alice/seeker-card.png"
                f"?v={seeker_card.card_version(self.alice)}"
            ),
        })

    def test_share_data_is_public_even_with_a_stale_token(self):
        res = self.share("alice", HTTP_AUTHORIZATION="Bearer expired.or.garbage")
        self.assertEqual(res.status_code, 200)

    def test_unknown_and_unverified_get_the_same_404(self):
        self.verified("banned", is_baned=True)
        responses = [self.share(name) for name in ("nobody", "bob", "banned")]
        for res in responses:
            self.assertEqual(res.status_code, 404)
            self.assertEqual(res["Cache-Control"], "no-store")
        self.assertEqual(len({res.content for res in responses}), 1)

    def test_skr_username_gets_its_own_subline(self):
        self.verified("vibes.skr", source="skr")
        data = self.share("vibes.skr").json()
        self.assertEqual(data["username"], "vibes.skr")
        self.assertEqual(data["source"], "skr")
        self.assertEqual(data["subline"], "Seeker ID (.skr) confirmed")
        self.assertIn("/users/vibes.skr/seeker-card.png?v=", data["card_url"])

    def test_odd_usernames_round_trip(self):
        for username in ('x"><script>alert(1)</script>', "іван_петренко", "a/b"):
            self.verified(username)
            res = self.share(username)
            self.assertEqual(res.status_code, 200, username)
            self.assertEqual(res.json()["username"], username)
            self.assertIn(f"/users/{quote(username, safe='')}/seeker-card.png", res.json()["card_url"])

    # ── Lookup + avatar names ──────────────────────────────────────────

    def test_lookup_by_username(self):
        api = APIClient()
        self.assertEqual(api.get("/api/v1/users/lookup/", {"username": "alice"}).status_code, 401)
        api.force_authenticate(user=self.bob)
        res = api.get("/api/v1/users/lookup/", {"username": "alice"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"user_id": self.alice.user_id})
        self.assertEqual(api.get("/api/v1/users/lookup/", {"username": "nobody"}).status_code, 404)
        self.assertEqual(api.get("/api/v1/users/lookup/").status_code, 404)

    def test_every_avatar_upload_gets_its_own_name(self):
        api = APIClient()
        api.force_authenticate(user=self.alice)
        names = []
        for filename in (f"avatar_{self.alice.user_id}.jpg", f"avatar_{self.alice.user_id}.jpg", "page.html"):
            upload = SimpleUploadedFile(filename, _image_bytes("JPEG"), content_type="image/jpeg")
            res = api.put("/api/v1/users/update/user-avatar/", {"avatar": upload}, format="multipart")
            self.assertEqual(res.status_code, 200)
            self.alice.refresh_from_db()
            names.append(self.alice.avatar.name)
        self.assertEqual(len(set(names)), 3)
        for name in names:
            self.assertRegex(name, rf"^images/avatar_{self.alice.user_id}_[0-9a-f]{{12}}\.jpg$")
