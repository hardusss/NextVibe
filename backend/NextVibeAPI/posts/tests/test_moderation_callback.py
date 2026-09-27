"""
Moderation results: the Celery task applies them and notifies the author;
the service's callback is accepted only with the shared secret.
"""
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from posts.models import Post
from posts.tasks import send_post_for_moderation
from user.models import Notification

User = get_user_model()
URL = "/api/v1/posts/moderation-callback/"


def result(passed):
    return {"id": "x", "passed": passed, "text": {"passed": passed, "details": {}}, "files": []}


class ModerationTest(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(email="a@example.com", username="author", password="Password123!")
        self.post = Post.objects.create(owner=self.author, about="hello", moderation_status="pending")
        self.client = APIClient()

    def callback(self, secret=None, passed=True):
        headers = {"HTTP_X_MODERATION_SECRET": secret} if secret is not None else {}
        return self.client.post(URL, {**result(passed), "id": str(self.post.id)}, format="json", **headers)

    def test_callbacks_are_refused_without_the_configured_secret(self):
        self.assertEqual(self.callback().status_code, 403)
        self.assertEqual(self.callback("anything").status_code, 403)
        with override_settings(MODERATION_CALLBACK_SECRET="s3cret"):
            self.assertEqual(self.callback("wrong").status_code, 403)
            self.assertEqual(self.callback().status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.moderation_status, "pending")
        self.assertFalse(Notification.objects.exists())

    @override_settings(MODERATION_CALLBACK_SECRET="s3cret")
    def test_a_callback_with_the_secret_is_applied_once(self):
        self.assertEqual(self.callback("s3cret").status_code, 200)
        self.assertEqual(self.callback("s3cret").status_code, 200)
        self.post.refresh_from_db()
        self.assertTrue(self.post.is_approved)
        self.assertEqual(Notification.objects.filter(post=self.post, notification_type="moderation_success").count(), 1)

    @patch("posts.tasks.requests.post")
    def test_the_task_applies_the_result_and_notifies_the_author(self, post):
        post.return_value = MagicMock(json=MagicMock(return_value=result(False)), raise_for_status=MagicMock())
        send_post_for_moderation(self.post.id)
        self.post.refresh_from_db()
        self.assertEqual(self.post.moderation_status, "denied")
        note = Notification.objects.get(post=self.post)
        self.assertEqual(note.notification_type, "moderation_fail")
        self.assertEqual(note.text_preview, "Your post was rejected: inappropriate text content")
