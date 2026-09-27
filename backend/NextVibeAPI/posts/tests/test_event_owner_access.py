"""Organizer-only event data: top attendees (with wallets) and the tap map."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from posts.models import Post

User = get_user_model()


class EventOwnerAccessTest(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="org@example.com", username="organizer", password="Password123!")
        self.guest = User.objects.create_user(email="guest@example.com", username="guest", password="Password123!")
        self.event = Post.objects.create(owner=self.owner, about="Meetup", is_luma_event=True,
                                         is_approved=True, moderation_status="approved")

    def get(self, user, path):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get(path)

    def test_only_the_owner_sees_top_attendees_and_taps(self):
        for path in (f"/api/v1/posts/event-top-users/{self.event.id}/", f"/api/v1/posts/event-taps/{self.event.id}/"):
            self.assertEqual(self.get(self.guest, path).status_code, 403, path)
            self.assertEqual(self.get(self.owner, path).status_code, 200, path)
