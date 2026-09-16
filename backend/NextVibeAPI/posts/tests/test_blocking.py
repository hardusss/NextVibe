"""
Tests for what a block hides on the posts side. Visibility is symmetric:
if Alice blocks Bob, neither sees the other.

Covers:
- posts hidden both ways (feed, profile grid, post details)
- comments and replies hidden both ways; commenting/replying/liking rejected
- taps between the pair rejected with code BLOCKED, in preview and commit,
  for IRL taps and event networking, without naming the other person
- "people you met" lists hide the pair but keep the REP total
- unblock restores visibility and taps
"""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from posts.models import Comment, CommentReply, EventCheckin, Post, Reputation
from user.models import Block, User

BLOCK_URL = "/api/v1/users/block/"
FEED_URL = "/api/v1/posts/recommendation-feed/"
GET_POST_URL = "/api/v1/posts/get-post/"
IRL_TAP_URL = "/api/v1/posts/irl-tap/"
CONNECTIONS_URL = "/api/v1/posts/user-event-connections/"
GENERATE_TOKEN_URL = "/api/v1/posts/proximity/generate-token/"
VERIFY_TOKEN_URL = "/api/v1/posts/proximity/verify-token/"


def make_user(name):
    return User.objects.create_user(username=name, email=f"{name}@test.com", password="pass12345")


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class BlockingTestCase(TestCase):
    def setUp(self):
        # Proximity tokens, feed "seen" sets and throttles all live in locmem
        cache.clear()
        self.alice = make_user("alice")
        self.bob = make_user("bob")
        self.carol = make_user("carol")
        self.alice_client = client_for(self.alice)
        self.bob_client = client_for(self.bob)
        self.carol_client = client_for(self.carol)

    def tearDown(self):
        cache.clear()

    def block(self, blocker_client, blocked):
        res = blocker_client.post(BLOCK_URL, {"user_id": blocked.user_id}, format="json")
        self.assertEqual(res.status_code, 201)

    def unblock(self, blocker_client, blocked):
        res = blocker_client.delete(f"{BLOCK_URL}{blocked.user_id}/")
        self.assertEqual(res.status_code, 204)

    def post_by(self, owner, **extra):
        return Post.objects.create(
            owner=owner, about=f"post by {owner.username}",
            moderation_status="approved", is_approved=True, **extra,
        )


class BlockHidesPostsTests(BlockingTestCase):
    def setUp(self):
        super().setUp()
        self.alice_post = self.post_by(self.alice)
        self.bob_post = self.post_by(self.bob)
        self.carol_post = self.post_by(self.carol)

    def feed_owner_ids(self, client):
        res = client.get(FEED_URL, {"reset": "true"})
        self.assertEqual(res.status_code, 200)
        return {post["owner__user_id"] for post in res.data["results"]}

    def test_feed_hides_posts_both_ways(self):
        self.block(self.alice_client, self.bob)

        self.assertEqual(self.feed_owner_ids(self.alice_client), {self.carol.user_id})
        self.assertEqual(self.feed_owner_ids(self.bob_client), {self.carol.user_id})
        self.assertEqual(self.feed_owner_ids(self.carol_client), {self.alice.user_id, self.bob.user_id})

    def test_profile_posts_hidden_both_ways(self):
        self.block(self.alice_client, self.bob)

        res = self.alice_client.get(f"/api/v1/posts/posts-menu/{self.bob.user_id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["data"], [])
        res = self.bob_client.get(f"/api/v1/posts/posts-menu/{self.alice.user_id}/")
        self.assertEqual(res.data["data"], [])

        res = self.carol_client.get(f"/api/v1/posts/posts-menu/{self.bob.user_id}/")
        self.assertEqual(len(res.data["data"]), 1)

    def test_post_details_hidden_both_ways(self):
        self.block(self.alice_client, self.bob)

        res = self.alice_client.get(GET_POST_URL, {"postId": self.bob_post.id})
        self.assertEqual(res.status_code, 404)
        res = self.bob_client.get(GET_POST_URL, {"postId": self.alice_post.id})
        self.assertEqual(res.status_code, 404)
        res = self.carol_client.get(GET_POST_URL, {"postId": self.bob_post.id})
        self.assertEqual(res.status_code, 200)

    def test_like_rejected_both_ways(self):
        self.block(self.alice_client, self.bob)

        res = self.alice_client.put(f"/api/v1/posts/post-like/{self.alice.user_id}/{self.bob_post.id}/")
        self.assertEqual(res.status_code, 404)
        res = self.bob_client.put(f"/api/v1/posts/post-like/{self.bob.user_id}/{self.alice_post.id}/")
        self.assertEqual(res.status_code, 404)
        self.bob_post.refresh_from_db()
        self.assertEqual(self.bob_post.count_likes, 0)

    def test_unblock_restores_posts(self):
        self.block(self.alice_client, self.bob)
        self.unblock(self.alice_client, self.bob)

        self.assertEqual(self.feed_owner_ids(self.alice_client), {self.bob.user_id, self.carol.user_id})
        self.assertEqual(self.feed_owner_ids(self.bob_client), {self.alice.user_id, self.carol.user_id})
        res = self.alice_client.get(GET_POST_URL, {"postId": self.bob_post.id})
        self.assertEqual(res.status_code, 200)


class BlockHidesCommentsTests(BlockingTestCase):
    def setUp(self):
        super().setUp()
        self.carol_post = self.post_by(self.carol)
        self.alice_comment = Comment.objects.create(owner=self.alice, post=self.carol_post, content="from alice")
        self.bob_comment = Comment.objects.create(owner=self.bob, post=self.carol_post, content="from bob")
        self.carol_comment = Comment.objects.create(owner=self.carol, post=self.carol_post, content="from carol")
        CommentReply.objects.create(owner=self.alice, comment=self.carol_comment, content="alice reply")
        CommentReply.objects.create(owner=self.bob, comment=self.carol_comment, content="bob reply")

    def visible(self, client):
        res = client.get(f"/api/v1/posts/get-comments/{self.carol_post.id}/")
        self.assertEqual(res.status_code, 200)
        comments = {c["content"] for c in res.data["comments"]}
        replies = {r["content"] for c in res.data["comments"] for r in c["replies"]}
        return comments, replies

    def test_comments_and_replies_hidden_both_ways(self):
        self.block(self.alice_client, self.bob)

        self.assertEqual(self.visible(self.alice_client), ({"from alice", "from carol"}, {"alice reply"}))
        self.assertEqual(self.visible(self.bob_client), ({"from bob", "from carol"}, {"bob reply"}))
        self.assertEqual(
            self.visible(self.carol_client),
            ({"from alice", "from bob", "from carol"}, {"alice reply", "bob reply"}),
        )

        res = self.alice_client.get(GET_POST_URL, {"postId": self.carol_post.id})
        self.assertEqual(res.data["data"]["comments_count"], 2)

    def test_comments_on_blocked_persons_post_hidden(self):
        bob_post = self.post_by(self.bob)
        self.block(self.bob_client, self.alice)
        res = self.alice_client.get(f"/api/v1/posts/get-comments/{bob_post.id}/")
        self.assertEqual(res.status_code, 404)

    def test_commenting_replying_and_liking_rejected(self):
        bob_post = self.post_by(self.bob)
        self.block(self.alice_client, self.bob)

        res = self.alice_client.post(
            "/api/v1/posts/comment-create/",
            {"content": "hi", "post": bob_post.id, "owner": self.alice.user_id},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

        res = self.bob_client.post(
            f"/api/v1/posts/comment-reply/{self.alice_comment.id}/",
            {"content": "hi", "comment": self.alice_comment.id, "owner": self.bob.user_id},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

        res = self.alice_client.put(f"/api/v1/posts/comment-like/{self.bob_comment.id}/")
        self.assertEqual(res.status_code, 404)

        self.assertFalse(Comment.objects.filter(post=bob_post).exists())
        self.assertFalse(CommentReply.objects.filter(owner=self.bob, comment=self.alice_comment).exists())

        # A comment under someone else's post still works
        res = self.alice_client.post(
            "/api/v1/posts/comment-create/",
            {"content": "still here", "post": self.carol_post.id, "owner": self.alice.user_id},
            format="json",
        )
        self.assertEqual(res.status_code, 201)

    def test_unblock_restores_comments(self):
        self.block(self.alice_client, self.bob)
        self.unblock(self.alice_client, self.bob)
        comments, replies = self.visible(self.alice_client)
        self.assertIn("from bob", comments)
        self.assertIn("bob reply", replies)


class BlockRejectsTapsTests(BlockingTestCase):
    def tap_token(self, client, interaction_type="irl", event=None):
        body = {"interaction_type": interaction_type}
        if event is not None:
            body["event_id"] = event.id
        res = client.post(GENERATE_TOKEN_URL, body, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["token"]

    def verify(self, client, token, preview):
        return client.post(VERIFY_TOKEN_URL, {"token": token, "preview": preview}, format="json")

    def assertBlocked(self, res):
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(res.data["code"], "BLOCKED")
        # Nothing that says who is on the other side
        self.assertNotIn("scanned_user", res.data)
        self.assertNotIn("alice", str(res.data))
        self.assertNotIn("bob", str(res.data))

    def test_irl_tap_rejected_in_preview_and_commit_both_ways(self):
        self.block(self.alice_client, self.bob)

        token = self.tap_token(self.bob_client)
        self.assertBlocked(self.verify(self.alice_client, token, preview=True))
        self.assertBlocked(self.verify(self.alice_client, token, preview=False))

        token = self.tap_token(self.alice_client)
        self.assertBlocked(self.verify(self.bob_client, token, preview=True))
        self.assertBlocked(self.verify(self.bob_client, token, preview=False))

        res = self.alice_client.post(IRL_TAP_URL, {"scanned_user_id": self.bob.user_id}, format="json")
        self.assertBlocked(res)
        res = self.bob_client.post(IRL_TAP_URL, {"scanned_user_id": self.alice.user_id}, format="json")
        self.assertBlocked(res)

        self.assertFalse(Reputation.objects.exists())

    def test_event_networking_rejected_in_preview_and_commit(self):
        event = Post.objects.create(owner=self.carol, about="Meetup", is_luma_event=True)
        EventCheckin.objects.create(user=self.alice, post=event, is_registered=True)
        EventCheckin.objects.create(user=self.bob, post=event, is_registered=True)
        self.block(self.bob_client, self.alice)

        token = self.tap_token(self.bob_client, "networking", event)
        self.assertBlocked(self.verify(self.alice_client, token, preview=True))
        self.assertBlocked(self.verify(self.alice_client, token, preview=False))

        res = self.alice_client.post(
            "/api/v1/posts/event-nfc-connect/",
            {"event_id": event.id, "scanned_user_id": self.bob.user_id},
            format="json",
        )
        self.assertBlocked(res)
        self.assertFalse(Reputation.objects.filter(event=event, is_checkin=False).exists())

    def test_other_people_can_still_tap(self):
        self.block(self.alice_client, self.bob)
        token = self.tap_token(self.carol_client)
        res = self.verify(self.alice_client, token, preview=True)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["scanned_user"]["username"], "carol")

    def test_unblock_restores_taps(self):
        self.block(self.alice_client, self.bob)
        self.unblock(self.alice_client, self.bob)

        token = self.tap_token(self.bob_client)
        res = self.verify(self.alice_client, token, preview=True)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["scanned_user"]["username"], "bob")
        res = self.verify(self.alice_client, token, preview=False)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])

    def test_people_you_met_hides_the_pair_but_keeps_rep(self):
        # They met before the block
        self.assertEqual(
            self.alice_client.post(IRL_TAP_URL, {"scanned_user_id": self.bob.user_id}, format="json").status_code,
            200,
        )
        before = self.alice_client.get(CONNECTIONS_URL).data
        self.assertEqual(len(before["irl_taps"]), 1)

        self.block(self.alice_client, self.bob)

        for client, other in ((self.alice_client, "bob"), (self.bob_client, "alice")):
            data = client.get(CONNECTIONS_URL).data
            self.assertEqual(data["irl_taps"], [])
            self.assertFalse([i for i in data["reputation_items"] if other in i["title"]])
            self.assertEqual(data["total_reputation"], before["total_reputation"])

        res = self.alice_client.get(CONNECTIONS_URL, {"user_id": self.bob.user_id})
        self.assertEqual(res.status_code, 404)
