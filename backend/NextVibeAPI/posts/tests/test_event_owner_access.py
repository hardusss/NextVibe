"""Organizer-only event data: top attendees (with wallets) and the tap map.
Admins (User.is_admin) see it for any event, read-only."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from posts.models import EventRequest, Post

User = get_user_model()


class EventOwnerAccessTest(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="org@example.com", username="organizer", password="Password123!")
        self.guest = User.objects.create_user(email="guest@example.com", username="guest", password="Password123!")
        self.admin = User.objects.create_user(email="admin@example.com", username="admin", password="Password123!",
                                              is_admin=True)
        self.event = Post.objects.create(owner=self.owner, about="Meetup", is_luma_event=True,
                                         is_approved=True, moderation_status="approved")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def get(self, user, path):
        return self.client_for(user).get(path)

    def organizer_paths(self):
        return (
            f"/api/v1/posts/event-top-users/{self.event.id}/",
            f"/api/v1/posts/event-taps/{self.event.id}/",
            f"/api/v1/posts/event-analytics/{self.event.id}/",
            f"/api/v1/posts/event-social-graph/{self.event.id}/",
            f"/api/v1/posts/event-requests/attendees/{self.event.id}/",
            f"/api/v1/posts/event-checkin/list/{self.event.id}/",
        )

    def test_only_the_owner_sees_top_attendees_and_taps(self):
        for path in (f"/api/v1/posts/event-top-users/{self.event.id}/", f"/api/v1/posts/event-taps/{self.event.id}/"):
            self.assertEqual(self.get(self.guest, path).status_code, 403, path)
            self.assertEqual(self.get(self.owner, path).status_code, 200, path)

    def test_an_admin_sees_any_events_organizer_data(self):
        for path in self.organizer_paths():
            self.assertEqual(self.get(self.guest, path).status_code, 403, path)
            self.assertEqual(self.get(self.admin, path).status_code, 200, path)
            self.assertEqual(self.get(self.owner, path).status_code, 200, path)

    def test_an_admin_cannot_change_someone_elses_event(self):
        admin = self.client_for(self.admin)
        request = EventRequest.objects.create(user=self.guest, post=self.event)

        broadcast = admin.post(f"/api/v1/posts/event-broadcast/{self.event.id}/", {"message": "Hi"}, format="json")
        self.assertEqual(broadcast.status_code, 403)
        update = admin.patch(f"/api/v1/posts/event-update/{self.event.id}/", {"about": "Taken"}, format="json")
        self.assertEqual(update.status_code, 403)
        action = admin.post(f"/api/v1/posts/event-requests/action/{request.id}/", {"action": "approve"}, format="json")
        self.assertEqual(action.status_code, 404)

        self.event.refresh_from_db()
        request.refresh_from_db()
        self.assertEqual(self.event.about, "Meetup")
        self.assertEqual(request.status, EventRequest.Status.PENDING)


class AllEventsTest(TestCase):
    URL = "/api/v1/posts/all-events/"

    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="org@example.com", username="organizer", password="Password123!")
        self.other = User.objects.create_user(email="other@example.com", username="other_org", password="Password123!")
        self.admin = User.objects.create_user(email="admin@example.com", username="admin", password="Password123!",
                                              is_admin=True)
        self.first = Post.objects.create(owner=self.owner, about="First", is_luma_event=True, moderation_status="approved")
        self.second = Post.objects.create(owner=self.other, about="Second", is_luma_event=True, moderation_status="pending")
        # Not listed: a deleted event, a denied one and a plain post
        Post.objects.create(owner=self.other, about="Deleted", is_luma_event=True, moderation_status="approved", is_hide=True)
        Post.objects.create(owner=self.other, about="Denied", is_luma_event=True, moderation_status="denied")
        Post.objects.create(owner=self.other, about="Just a post", moderation_status="approved")

    def get(self, user, params=None):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get(self.URL, params or {})

    def test_an_admin_gets_every_event_newest_first_with_its_owner(self):
        res = self.get(self.admin)
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e["post_id"] for e in res.data["data"]], [self.second.id, self.first.id])
        self.assertEqual([e["owner"]["username"] for e in res.data["data"]], ["other_org", "organizer"])
        self.assertEqual(res.data["data"][0]["user_id"], self.other.user_id)
        self.assertEqual(res.data["total_posts"], 2)
        self.assertFalse(res.data["more_posts"])

    def test_pages(self):
        res = self.get(self.admin, {"index": 0, "limit": 1})
        self.assertEqual([e["post_id"] for e in res.data["data"]], [self.second.id])
        self.assertTrue(res.data["more_posts"])
        res = self.get(self.admin, {"index": 1, "limit": 1})
        self.assertEqual([e["post_id"] for e in res.data["data"]], [self.first.id])
        self.assertFalse(res.data["more_posts"])
        self.assertEqual(self.get(self.admin, {"limit": "all"}).status_code, 400)

    def test_everyone_else_is_refused(self):
        self.assertEqual(self.get(self.owner).status_code, 403)
        self.assertEqual(APIClient().get(self.URL).status_code, 401)
