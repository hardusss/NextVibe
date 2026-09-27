"""
Delete the old 2FA QR codes from the public media bucket.

They were uploaded as qrcodes/<email>_qr_code.png, and each one holds a 2FA
secret. The API now returns the QR code inline and never stores it.

    python manage.py purge_2fa_qr_codes --dry-run        # count what would go
    python manage.py purge_2fa_qr_codes                  # delete the files
    python manage.py purge_2fa_qr_codes --reset-secrets  # also clear stored 2FA secrets (2FA is set up again)
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from user.src.cloudflare_save_media import get_s3_client

PREFIX = "qrcodes/"


class Command(BaseCommand):
    help = "Delete the 2FA QR codes stored in the public media bucket"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="only count")
        parser.add_argument("--reset-secrets", action="store_true",
                            help="also clear every stored 2FA secret and turn 2FA off, so people set it up again")

    def handle(self, *args, dry_run=False, reset_secrets=False, **options):
        client = get_s3_client()
        bucket = settings.AWS_STORAGE_BUCKET_NAME
        keys = []
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
            keys.extend(item["Key"] for item in page.get("Contents", []))
        self.stdout.write(f"{len(keys)} QR code file(s) under {PREFIX}")
        if not dry_run:
            for start in range(0, len(keys), 1000):
                chunk = keys[start:start + 1000]
                client.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True})
            self.stdout.write(f"Deleted {len(keys)}.")
        if reset_secrets:
            users = get_user_model().all_objects.exclude(secret_2fa__isnull=True).exclude(secret_2fa="")
            count = users.count()
            if not dry_run:
                users.update(secret_2fa=None, is2FA=False)
            self.stdout.write(f"{'Would reset' if dry_run else 'Reset'} 2FA for {count} account(s).")
