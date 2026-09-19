import io
import shutil
import tempfile
from unittest import mock

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from PIL import Image

from posts.models import Post, PostsMedia
from posts.src import post_card
from user.models import User


def _jpeg(size=(1200, 900), color=(200, 120, 60)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


class PostShareTest(TestCase):
    """nextvibe.io/u/post/<id>: share data and link-preview card."""

    def setUp(self):
        cache.clear()
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        overrides = override_settings(
            MEDIA_ROOT=media, PUBLIC_API_URL="https://api.nextvibe.io", AWS_S3_CUSTOM_DOMAIN="media.nextvibe.io",
        )
        overrides.enable()
        self.addCleanup(overrides.disable)
        self.author = User.objects.create_user(
            email="author@example.com", username="author", password="Password123!", seeker_verified=True,
        )
        self.post = self.make_post(about="Sunset after the meetup", status="approved")

    def make_post(self, about="", status="approved", **extra):
        return Post.objects.create(owner=extra.pop("owner", self.author), about=about, moderation_status=status,
                                   is_approved=status == "approved", **extra)

    def add_media(self, post, name, data, preview=None):
        media = PostsMedia(post=post)
        media.file.save(name, ContentFile(data), save=False)
        if preview:
            media.preview.save("preview.jpg", ContentFile(preview), save=False)
        media.save()
        return media

    def share(self, post_id):
        return self.client.get(f"/api/v1/posts/{post_id}/share/")

    def card(self, post_id, **params):
        return self.client.get(f"/api/v1/posts/{post_id}/card.png", params)

    def test_approved_post_is_shared_with_caption_and_media(self):
        self.add_media(self.post, "photo.jpg", _jpeg())
        res = self.share(self.post.id)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Cache-Control"], "public, max-age=60")
        data = res.json()
        self.assertEqual(data["state"], "public")
        self.assertEqual(data["about"], "Sunset after the meetup")
        self.assertEqual(data["owner"]["username"], "author")
        self.assertTrue(data["owner"]["seeker_verified"])
        self.assertEqual(len(data["media"]), 1)
        self.assertEqual(data["media"][0]["kind"], "image")
        self.assertTrue(data["media"][0]["url"].startswith("https://media.nextvibe.io/posts_media/"))
        version = post_card.post_card_version(self.post, "public")
        self.assertEqual(data["card_url"], f"https://api.nextvibe.io/api/v1/posts/{self.post.id}/card.png?v={version}")
        self.assertNotIn("email", data["owner"])

    def test_pending_post_names_only_its_author(self):
        pending = self.make_post(about="not reviewed yet", status="pending")
        self.add_media(pending, "secret.jpg", _jpeg())
        data = self.share(pending.id).json()
        self.assertEqual(data["state"], "pending")
        for key in ("about", "media", "likes_count", "event_url"):
            self.assertNotIn(key, data)
        self.assertEqual(self.card(pending.id).status_code, 200)

    def test_hidden_denied_and_banned_posts_are_404(self):
        hidden = self.make_post(about="deleted", is_hide=True)
        denied = self.make_post(about="denied", status="denied")
        banned = User.objects.create_user(email="b@example.com", username="banned_one", password="x", is_baned=True)
        by_banned = self.make_post(about="banned author", owner=banned)
        for post_id in (hidden.id, denied.id, by_banned.id, 999999):
            res = self.share(post_id)
            self.assertEqual(res.status_code, 404, post_id)
            self.assertEqual(res["Cache-Control"], "no-store")
            self.assertEqual(self.card(post_id).status_code, 404, post_id)

    def test_video_uses_its_preview_frame(self):
        video = self.make_post(about="Behind the scenes")
        self.add_media(video, "clip.mp4", b"\x00\x00\x00\x18ftypmp42", preview=_jpeg((640, 360)))
        item = self.share(video.id).json()["media"][0]
        self.assertEqual(item["kind"], "video")
        self.assertTrue(item["preview"].startswith("https://media.nextvibe.io/posts_previews/"))
        with mock.patch.object(post_card, "render_post_card", wraps=post_card.render_post_card) as render:
            self.assertEqual(self.card(video.id).status_code, 200)
        kwargs = render.call_args.kwargs
        self.assertTrue(kwargs["is_video"])
        self.assertIsNotNone(kwargs["cover"])

    def test_card_is_a_1200x630_png_for_every_layout(self):
        photo = self.make_post(about="")
        self.add_media(photo, "photo.jpg", _jpeg())
        text = self.make_post(about="IRL connections > followers " * 10, is_luma_event=True)
        pending = self.make_post(about="x", status="pending")
        for post in (self.post, photo, text, pending):
            res = self.card(post.id)
            self.assertEqual(res.status_code, 200, post.id)
            self.assertEqual(res["Content-Type"], "image/png")
            self.assertEqual(Image.open(io.BytesIO(res.content)).size, (1200, 630))

    def test_card_is_rendered_once_and_cached_by_version(self):
        version = post_card.post_card_version(self.post, "public")
        with mock.patch.object(post_card, "render_post_card", wraps=post_card.render_post_card) as render:
            first = self.card(self.post.id, v=version)
            second = self.card(self.post.id)
        self.assertEqual(render.call_count, 1)
        self.assertEqual(first.content, second.content)
        self.assertEqual(first["Cache-Control"], "public, max-age=86400, immutable")
        self.assertEqual(second["Cache-Control"], "no-cache")
        self.assertTrue(default_storage.exists(f"og/posts/{self.post.id}-v{version}.png"))

    def test_version_follows_what_the_card_shows(self):
        versions = {post_card.post_card_version(self.post, "public")}
        self.post.about = "edited caption"
        versions.add(post_card.post_card_version(self.post, "public"))
        self.add_media(self.post, "photo.jpg", _jpeg())
        self.post = Post.objects.prefetch_related("media").get(id=self.post.id)
        self.post.about = "edited caption"
        versions.add(post_card.post_card_version(self.post, "public"))
        versions.add(post_card.post_card_version(self.post, "pending"))
        self.assertEqual(len(versions), 4)
        # Likes don't change the card
        self.post.count_likes = 99
        self.assertIn(post_card.post_card_version(self.post, "public"), versions)
