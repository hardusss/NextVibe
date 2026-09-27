"""
Give old chat photos and videos unguessable names.

Chat media sit in the public media bucket. Files sent inline used to be
named chat_media/message_<id>_<n>.<ext>, which anyone could count through;
new files are chat_media/chat_<chat>_<32 random hex>.<ext>. For every
attachment with an old name this command copies the file to a new random
name, points the attachment at it, then deletes the old file. Chat
messages keep their photos: the app reads the links from the attachment
rows (message lists are cached for 30 seconds, then the new links show).
Old-style files that no attachment uses any more (deleted messages) are
deleted too.

    python manage.py rename_chat_media            # dry run: count only
    python manage.py rename_chat_media --apply    # rename and delete
    python manage.py rename_chat_media --apply --limit 500

Safe to run again: attachments already renamed are skipped.
"""
import re
import uuid

from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand

from chat.models import MediaAttachment
from user.src.cloudflare_save_media import get_s3_client

PREFIX = "chat_media/"
RANDOM_NAME = re.compile(r"^chat_media/chat_\d+_[0-9a-f]{32}(_preview)?\.[A-Za-z0-9]{1,8}$")
EXTENSION = re.compile(r"\.([A-Za-z0-9]{1,8})$")


def key_of(value) -> str:
    """The storage key of a FileField value or a plain column."""
    return getattr(value, "name", value) or ""


def is_random(key: str | None) -> bool:
    return bool(key) and bool(RANDOM_NAME.match(key))


def new_name(chat_id: int, old_key: str, preview: bool = False) -> str:
    match = EXTENSION.search(old_key or "")
    ext = match.group(1).lower() if match else "bin"
    return f"{PREFIX}chat_{chat_id}_{uuid.uuid4().hex}{'_preview' if preview else ''}.{ext}"


def _missing(error: ClientError) -> bool:
    return error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound")


class Command(BaseCommand):
    help = "Rename chat media with guessable names to random ones (dry run unless --apply)"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="rename, update the database and delete old files")
        parser.add_argument("--limit", type=int, default=None, help="at most this many attachments")

    def handle(self, *args, apply=False, limit=None, **options):
        self.client = get_s3_client()
        self.bucket = settings.AWS_STORAGE_BUCKET_NAME
        self.apply = apply
        counts = {"renamed": 0, "missing": 0, "failed": 0, "orphans": 0}

        rows = (MediaAttachment.all_objects.select_related("message")
                .order_by("id").only("id", "file", "preview_file", "message__chat_id"))
        todo = [row for row in rows.iterator()
                if self._legacy(key_of(row.file)) or self._legacy(key_of(row.preview_file))]
        if limit is not None:
            todo = todo[:limit]
        self.stdout.write(f"{len(todo)} attachment(s) with old names{'' if apply else ' (dry run)'}")

        for row in todo:
            for field, preview in (("file", False), ("preview_file", True)):
                old = key_of(getattr(row, field))
                if not self._legacy(old):
                    continue
                result = self._rename(row, field, old, preview) if apply else "renamed"
                counts[result] += 1

        counts["orphans"] = self._orphans()
        self.stdout.write(self.style.SUCCESS(
            "{verb} {renamed}, missing in storage {missing}, failed {failed}, old unused files {orphan_verb} {orphans}".format(
                verb="renamed" if apply else "would rename",
                orphan_verb="deleted" if apply else "to delete",
                **counts,
            )
        ))
        if apply and counts["renamed"]:
            self.stdout.write("Chat message lists are cached for 30 seconds; the new links show after that.")

    @staticmethod
    def _legacy(key) -> bool:
        return bool(key) and not is_random(key)

    def _rename(self, row, field, old, preview) -> str:
        new = new_name(row.message.chat_id, old, preview)
        try:
            self.client.copy_object(Bucket=self.bucket, Key=new, MetadataDirective="COPY",
                                    CopySource={"Bucket": self.bucket, "Key": old})
        except ClientError as error:
            if _missing(error):
                self.stdout.write(f"attachment {row.id}: {old} is not in storage, left as is")
                return "missing"
            self.stderr.write(f"attachment {row.id}: copying {old} failed: {error}")
            return "failed"

        # Only if the row still points at the old file
        updated = MediaAttachment.all_objects.filter(id=row.id, **{field: old}).update(**{field: new})
        if not updated:
            self.client.delete_object(Bucket=self.bucket, Key=new)
            self.stderr.write(f"attachment {row.id}: changed while renaming, skipped")
            return "failed"
        self._delete(old)
        return "renamed"

    def _delete(self, key):
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            self.stderr.write(f"deleting {key} failed: {error}")

    def _orphans(self) -> int:
        """Old-style files under chat_media/ that no attachment uses; deleted with --apply."""
        used = set()
        for file, preview in MediaAttachment.all_objects.values_list("file", "preview_file").iterator():
            used.update(k for k in (file, preview) if k)
        orphans = []
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=PREFIX):
            orphans.extend(item["Key"] for item in page.get("Contents", [])
                           if not is_random(item["Key"]) and item["Key"] not in used)
        if self.apply:
            for start in range(0, len(orphans), 1000):
                chunk = orphans[start:start + 1000]
                self.client.delete_objects(Bucket=self.bucket,
                                           Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True})
        return len(orphans)
