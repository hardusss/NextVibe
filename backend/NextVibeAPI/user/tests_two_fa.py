"""2FA setup returns the QR code inline; old QR files can be purged from the bucket."""
from io import StringIO
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

User = get_user_model()


class TwoFaSetupTest(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="tfa@example.com", username="tfa", password="Password123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("boto3.client")
    def test_the_qr_code_comes_back_inline_and_is_never_uploaded(self, boto_client):
        first = self.client.get("/api/v1/users/2fa/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertTrue(first.data["data"]["qrcode"].startswith("data:image/png;base64,"))
        again = self.client.get("/api/v1/users/2fa/")
        self.assertEqual(again.data["data"]["code"], first.data["data"]["code"])
        self.assertTrue(again.data["data"]["qrcode"].startswith("data:image/png;base64,"))
        boto_client.assert_not_called()


@override_settings(AWS_STORAGE_BUCKET_NAME="media")
class PurgeQrCodesTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="old@example.com", username="old", password="Password123!")
        self.user.secret_2fa = "JBSWY3DPEHPK3PXP"
        self.user.is2FA = True
        self.user.save()
        self.client = MagicMock()
        pages = [{"Contents": [{"Key": "qrcodes/a@example.com_qr_code.png"}, {"Key": "qrcodes/b@example.com_qr_code.png"}]}]
        self.client.get_paginator.return_value.paginate.return_value = pages

    def run_command(self, *args):
        out = StringIO()
        with patch("user.management.commands.purge_2fa_qr_codes.get_s3_client", return_value=self.client):
            call_command("purge_2fa_qr_codes", *args, stdout=out)
        return out.getvalue()

    def test_dry_run_only_counts(self):
        output = self.run_command("--dry-run", "--reset-secrets")
        self.assertIn("2 QR code file(s)", output)
        self.client.delete_objects.assert_not_called()
        self.user.refresh_from_db()
        self.assertTrue(self.user.is2FA)

    def test_deletes_the_files_and_can_reset_secrets(self):
        self.run_command("--reset-secrets")
        keys = [o["Key"] for o in self.client.delete_objects.call_args.kwargs["Delete"]["Objects"]]
        self.assertEqual(len(keys), 2)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is2FA)
        self.assertIsNone(self.user.secret_2fa)
