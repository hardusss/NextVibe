"""
Tests for chat unread counts.

Covers:
- chats list includes a per-user unread_count (only the other side's unread messages)
- read receipts zero the count for the reader only
- soft-deleted messages don't count
- the global unread-count endpoint sums across chats and excludes own messages
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from user.models import User
from .models import Chat, Message, MessageReceipt

CHATS_URL = "/api/v1/chat/chats/"
UNREAD_COUNT_URL = "/api/v1/chat/unread-count/"


def make_chat(a, b):
    chat = Chat.objects.create()
    chat.participants.set([a, b])
    return chat


class ChatUnreadCountTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@test.com", password="pass12345",
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@test.com", password="pass12345",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)
        self.chat = make_chat(self.alice, self.bob)

    def _msg(self, sender, text="hi", chat=None, deleted=False):
        return Message.objects.create(
            chat=chat or self.chat,
            sender=sender,
            text=text,
            deleted_at=timezone.now() if deleted else None,
        )

    def test_chats_list_includes_unread_count(self):
        self._msg(self.bob)
        self._msg(self.bob)
        self._msg(self.alice)  # own message never counts

        res = self.client.get(CHATS_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["unread_count"], 2)

    def test_read_receipt_clears_unread_for_reader_only(self):
        m1 = self._msg(self.bob)
        m2 = self._msg(self.bob)
        MessageReceipt.objects.create(message=m1, user=self.alice, read_at=timezone.now())
        MessageReceipt.objects.create(message=m2, user=self.alice, read_at=timezone.now())
        # Bob has no receipts on Alice's messages — his side is unaffected.
        self._msg(self.alice)

        res = self.client.get(CHATS_URL)
        self.assertEqual(res.data[0]["unread_count"], 0)

        self.client.force_authenticate(user=self.bob)
        res = self.client.get(CHATS_URL)
        self.assertEqual(res.data[0]["unread_count"], 1)

    def test_unread_ignores_delivered_only_receipts(self):
        m1 = self._msg(self.bob)
        MessageReceipt.objects.create(message=m1, user=self.alice, delivered_at=timezone.now())

        res = self.client.get(CHATS_URL)
        self.assertEqual(res.data[0]["unread_count"], 1)

    def test_deleted_messages_do_not_count(self):
        self._msg(self.bob)
        self._msg(self.bob, deleted=True)

        res = self.client.get(CHATS_URL)
        self.assertEqual(res.data[0]["unread_count"], 1)

        res = self.client.get(UNREAD_COUNT_URL)
        self.assertEqual(res.data["count"], 1)

    def test_global_unread_count_sums_across_chats(self):
        carol = User.objects.create_user(
            username="carol", email="carol@test.com", password="pass12345",
        )
        chat2 = make_chat(self.alice, carol)
        self._msg(self.bob)
        self._msg(self.bob)
        self._msg(carol, chat=chat2)
        self._msg(self.alice, chat=chat2)  # own message never counts

        res = self.client.get(UNREAD_COUNT_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 3)
        self.assertTrue(res.data["status"])

    def test_global_unread_count_zero(self):
        res = self.client.get(UNREAD_COUNT_URL)
        self.assertEqual(res.data["count"], 0)
        self.assertFalse(res.data["status"])


class ChatBlockTests(TestCase):
    """A chat between a blocked pair is hidden and can't be reopened."""

    CREATE_CHAT_URL = "/api/v1/chat/create-chat/"
    BLOCK_URL = "/api/v1/users/block/"

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.alice = User.objects.create_user(
            username="alice", email="alice@test.com", password="pass12345",
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@test.com", password="pass12345",
        )
        self.carol = User.objects.create_user(
            username="carol", email="carol@test.com", password="pass12345",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)
        self.bob_client = APIClient()
        self.bob_client.force_authenticate(user=self.bob)

        self.chat = make_chat(self.alice, self.bob)
        Message.objects.create(chat=self.chat, sender=self.bob, text="hi alice")
        self.carol_chat = make_chat(self.alice, self.carol)
        Message.objects.create(chat=self.carol_chat, sender=self.carol, text="hi")

    def chat_ids(self, client):
        res = client.get(CHATS_URL)
        self.assertEqual(res.status_code, 200)
        return {c["chat_id"] for c in res.data}

    def test_blocked_chat_hidden_both_ways(self):
        self.assertEqual(self.client.post(self.BLOCK_URL, {"user_id": self.bob.user_id}, format="json").status_code, 201)

        self.assertEqual(self.chat_ids(self.client), {self.carol_chat.id})
        self.assertEqual(self.chat_ids(self.bob_client), set())
        # Bob's unread message no longer counts on Alice's badge
        self.assertEqual(self.client.get(UNREAD_COUNT_URL).data["count"], 1)

    def test_new_chat_rejected_both_ways(self):
        self.client.post(self.BLOCK_URL, {"user_id": self.bob.user_id}, format="json")

        res = self.client.post(self.CREATE_CHAT_URL, {"user_ids": [self.bob.user_id, self.alice.user_id]}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "BLOCKED")

        res = self.bob_client.post(self.CREATE_CHAT_URL, {"user_ids": [self.alice.user_id, self.bob.user_id]}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertNotIn("chat_id", res.data)

    def test_unblock_restores_chat(self):
        self.client.post(self.BLOCK_URL, {"user_id": self.bob.user_id}, format="json")
        self.client.delete(f"{self.BLOCK_URL}{self.bob.user_id}/")

        self.assertEqual(self.chat_ids(self.client), {self.chat.id, self.carol_chat.id})
        res = self.client.post(self.CREATE_CHAT_URL, {"user_ids": [self.bob.user_id, self.alice.user_id]}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["chat_id"], self.chat.id)
