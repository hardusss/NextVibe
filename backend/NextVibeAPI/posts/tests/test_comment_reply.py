"""Regression test: replying to someone else's comment must succeed.

The comment_reply Notification's post_save signal used to read
`instance.comment.text` (the field is `content`), so every reply to another
user's comment 500'd even though the reply row was already saved.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase, APIClient

from posts.models import Post, Comment
from posts.view_pac import CommentReplyView
from user.models import Notification

User = get_user_model()


class CommentReplyTest(APITestCase):
    def setUp(self):
        self._throttles = CommentReplyView.throttle_classes
        CommentReplyView.throttle_classes = []
        self.author = User.objects.create_user(
            email="author@example.com", username="author", password="pass12345"
        )
        self.replier = User.objects.create_user(
            email="replier@example.com", username="replier", password="pass12345"
        )
        self.post = Post.objects.create(owner=self.author, about="hi")
        self.comment = Comment.objects.create(
            owner=self.author, post=self.post, content="root comment"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.replier)

    def tearDown(self):
        CommentReplyView.throttle_classes = self._throttles

    def _reply(self):
        # Mirrors the frontend createCommentReply payload exactly
        return self.client.post(
            f"/api/v1/posts/comment-reply/{self.comment.id}/",
            {
                "content": "my reply",
                "comment": self.comment.id,
                "owner": str(self.replier.pk),
            },
            format="json",
        )

    def test_reply_to_someone_elses_comment(self):
        resp = self._reply()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIn("reply_id", resp.data)
        self.assertEqual(resp.data["user"]["username"], "replier")
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.author, notification_type="comment_reply"
            ).count(),
            1,
        )

    def test_reply_to_own_comment_creates_no_notification(self):
        self.client.force_authenticate(user=self.author)
        resp = self.client.post(
            f"/api/v1/posts/comment-reply/{self.comment.id}/",
            {
                "content": "self reply",
                "comment": self.comment.id,
                "owner": str(self.author.pk),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Notification.objects.count(), 0)
