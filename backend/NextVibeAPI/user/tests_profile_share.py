import io
import shutil
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from PIL import Image

from user.models import OgAvatarMint
from user.src import profile_card

User = get_user_model()

SENSITIVE = (
    "email", "password", "expo_push_token", "wallet_address", "apple_user_id", "follow_for",
    "readers", "liked_posts", "secret_2fa", "seeker_sgt_mint", "auth_provider", "is_baned",
)


class ProfileShareTest(TestCase):
    """nextvibe.io/u/<id>: share data, link-preview card, and the public profile endpoint."""

    def setUp(self):
        cache.clear()  # scoped throttles live in locmem across tests
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        overrides = override_settings(
            MEDIA_ROOT=media, PUBLIC_API_URL="https://api.nextvibe.io", AWS_S3_CUSTOM_DOMAIN="media.nextvibe.io",
        )
        overrides.enable()
        self.addCleanup(overrides.disable)
        self.alice = User.objects.create_user(
            email="alice@example.com", username="alice", password="Password123!",
            about="Tap phones with me", official=True, seeker_verified=True,
            wallet_address="WALLET111", expo_push_token="ExponentPushToken[secret]",
        )

    def share(self, user_id):
        return self.client.get(f"/api/v1/users/{user_id}/share/")

    def card(self, user_id, **params):
        return self.client.get(f"/api/v1/users/{user_id}/card.png", params)

    def test_share_data_has_public_fields_only(self):
        OgAvatarMint.objects.create(user=self.alice, edition=7)
        res = self.share(self.alice.user_id)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["username"], "alice")
        self.assertEqual(data["about"], "Tap phones with me")
        self.assertTrue(data["official"])
        self.assertTrue(data["seeker_verified"])
        self.assertEqual(data["og_edition"], 7)
        self.assertEqual(data["avatar"], "https://media.nextvibe.io/images/default.png")
        version = profile_card.profile_card_version(self.alice)
        self.assertEqual(data["card_url"], f"https://api.nextvibe.io/api/v1/users/{self.alice.user_id}/card.png?v={version}")
        for key in SENSITIVE:
            self.assertNotIn(key, data)

    def test_banned_deleted_and_unknown_are_404(self):
        banned = User.objects.create_user(email="b@example.com", username="banned", password="x", is_baned=True)
        gone = User.objects.create_user(email="g@example.com", username="gone", password="x", is_active=False)
        for user_id in (banned.user_id, gone.user_id, 999999):
            res = self.share(user_id)
            self.assertEqual(res.status_code, 404, user_id)
            self.assertEqual(self.card(user_id).status_code, 404, user_id)

    def test_card_png_and_caching(self):
        version = profile_card.profile_card_version(self.alice)
        with mock.patch.object(profile_card, "render_profile_card", wraps=profile_card.render_profile_card) as render:
            first = self.card(self.alice.user_id, v=version)
            second = self.card(self.alice.user_id)
        self.assertEqual(render.call_count, 1)
        self.assertEqual(Image.open(io.BytesIO(first.content)).size, (1200, 630))
        self.assertEqual(first["Cache-Control"], "public, max-age=86400, immutable")
        self.assertEqual(second["Cache-Control"], "no-cache")
        self.assertTrue(default_storage.exists(f"og/profiles/{self.alice.user_id}-v{version}.png"))

    def test_version_follows_what_the_card_shows(self):
        versions = {profile_card.profile_card_version(self.alice)}
        for field, value in (("about", "New bio"), ("username", "alice2"), ("avatar", "images/new.jpg"),
                             ("official", False), ("seeker_verified", False)):
            setattr(self.alice, field, value)
            versions.add(profile_card.profile_card_version(self.alice))
        self.assertEqual(len(versions), 6)
        self.alice.readers_count = 500  # follower counts aren't drawn
        self.assertIn(profile_card.profile_card_version(self.alice), versions)

    def test_renders_every_variant(self):
        for kwargs in ({}, {"about": "Привіт! " * 30, "seeker": True, "og_number": 3},
                       {"official": True, "seeker": True}):
            png = profile_card.render_profile_card("x" * 60, None, **kwargs)
            self.assertEqual(Image.open(io.BytesIO(png)).size, (1200, 630))

    def test_public_profile_endpoint_no_longer_leaks_private_fields(self):
        res = self.client.get(f"/api/v1/users/public/user/{self.alice.user_id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["username"], "alice")
        for key in ("about", "avatar", "post_count", "readers_count", "follows_count", "official"):
            self.assertIn(key, data)
        for key in SENSITIVE:
            self.assertNotIn(key, data)
