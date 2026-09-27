"""
rename_chat_media: old chat media names (chat_media/message_<id>_<n>.<ext>)
become random ones; the attachments follow, old files go away, a dry run
touches nothing.
"""
from io import StringIO
from unittest.mock import patch

from botocore.exceptions import ClientError
from django.core.management import call_command
from django.test import TestCase

from chat.management.commands.rename_chat_media import is_random, new_name
from chat.models import Chat, MediaAttachment, Message
from user.models import User


class FakeBucket:
    """The few S3 calls the command makes, over a dict."""

    def __init__(self, keys):
        self.objects = {key: b"data:" + key.encode() for key in keys}

    def copy_object(self, Bucket, Key, CopySource, MetadataDirective):
        if CopySource["Key"] not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "CopyObject")
        self.objects[Key] = self.objects[CopySource["Key"]]

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def delete_objects(self, Bucket, Delete):
        for item in Delete["Objects"]:
            self.objects.pop(item["Key"], None)

    def get_paginator(self, name):
        bucket = self

        class Paginator:
            def paginate(self, Bucket, Prefix):
                yield {"Contents": [{"Key": k} for k in sorted(bucket.objects) if k.startswith(Prefix)]}
        return Paginator()


class RenameChatMediaTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", email="alice@test.com", password="pass12345")
        self.bob = User.objects.create_user(username="bob", email="bob@test.com", password="pass12345")
        self.chat = Chat.objects.create()
        self.chat.participants.set([self.alice, self.bob])
        self.message = Message.objects.create(chat=self.chat, sender=self.alice, text="look")
        self.random_key = new_name(self.chat.id, "x.jpg")
        self.old = MediaAttachment.objects.create(message=self.message, file=f"chat_media/message_{self.message.id}_0.jpg")
        self.video = MediaAttachment.objects.create(message=self.message, file=f"chat_media/message_{self.message.id}_1.mp4")
        self.new = MediaAttachment.objects.create(message=self.message, file=self.random_key)
        self.bucket = FakeBucket([self.old.file.name, self.video.file.name, self.random_key,
                                  "chat_media/message_999_0.jpg", "images/avatar.png"])

    def run_command(self, *args):
        out = StringIO()
        with patch("chat.management.commands.rename_chat_media.get_s3_client", return_value=self.bucket):
            call_command("rename_chat_media", *args, stdout=out, stderr=StringIO())
        return out.getvalue()

    def test_names(self):
        self.assertTrue(is_random(self.random_key))
        self.assertTrue(self.random_key.startswith(f"chat_media/chat_{self.chat.id}_"))
        self.assertTrue(self.random_key.endswith(".jpg"))
        self.assertFalse(is_random("chat_media/message_1_0.jpg"))
        self.assertFalse(is_random(None))
        self.assertTrue(new_name(1, "no-extension").endswith(".bin"))

    def test_dry_run_changes_nothing(self):
        before = dict(self.bucket.objects)
        output = self.run_command()
        self.assertIn("2 attachment(s) with old names (dry run)", output)
        self.assertIn("would rename 2", output)
        self.assertIn("old unused files to delete 1", output)
        self.assertEqual(self.bucket.objects, before)
        self.old.refresh_from_db()
        self.assertEqual(self.old.file.name, f"chat_media/message_{self.message.id}_0.jpg")

    def test_apply_renames_keeps_the_content_and_deletes_old_files(self):
        old_file, old_video = self.old.file.name, self.video.file.name
        output = self.run_command("--apply")
        self.assertIn("renamed 2", output)
        for row, old_key in ((self.old, old_file), (self.video, old_video)):
            row.refresh_from_db()
            self.assertTrue(is_random(row.file.name), row.file.name)
            self.assertEqual(self.bucket.objects[row.file.name], b"data:" + old_key.encode())
            self.assertNotIn(old_key, self.bucket.objects)
        self.assertTrue(self.video.file.name.endswith(".mp4"))
        # Untouched: files already random, other folders; the unused old file is gone
        self.assertIn(self.random_key, self.bucket.objects)
        self.assertIn("images/avatar.png", self.bucket.objects)
        self.assertNotIn("chat_media/message_999_0.jpg", self.bucket.objects)
        # A second run has nothing left to do
        self.assertIn("0 attachment(s) with old names", self.run_command("--apply"))

    def test_a_file_missing_from_storage_is_left_alone(self):
        del self.bucket.objects[self.old.file.name]
        output = self.run_command("--apply")
        self.assertIn("missing in storage 1", output)
        self.old.refresh_from_db()
        self.assertEqual(self.old.file.name, f"chat_media/message_{self.message.id}_0.jpg")

    def test_previews_are_renamed_too(self):
        self.new.preview_file = "chat_media/preview_5.jpg"
        self.new.save(update_fields=["preview_file"])
        self.bucket.objects["chat_media/preview_5.jpg"] = b"preview"
        self.run_command("--apply")
        self.new.refresh_from_db()
        self.assertTrue(is_random(self.new.preview_file))
        self.assertIn("_preview.jpg", self.new.preview_file)
        self.assertEqual(self.bucket.objects[self.new.preview_file], b"preview")

    def test_limit(self):
        self.assertIn("1 attachment(s) with old names", self.run_command("--apply", "--limit", "1"))
