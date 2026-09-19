"""Shared fixtures: a temp logs dir and a few users with different channels."""
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from nvcli import log

User = get_user_model()


class NvTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.logs = Path(tempfile.mkdtemp(prefix="nvlogs-"))
        self.addCleanup(shutil.rmtree, self.logs, ignore_errors=True)
        patcher = mock.patch.object(log, "LOGS_DIR", self.logs)
        patcher.start()
        self.addCleanup(patcher.stop)

    @staticmethod
    def user(username, *, email=True, push=True, wallet=None, seeker=False, source=None,
             last_login=None, active=True, banned=False):
        u = User.all_objects.create(
            username=username,
            email=f"{username}@example.com" if email else None,
            expo_push_token=f"ExponentPushToken[{username}]" if push else None,
            wallet_address=wallet,
            seeker_verified=seeker,
            seeker_verified_source=source,
            is_active=active,
            is_baned=banned,
        )
        if last_login is not None:
            u.last_login = timezone.now() - timedelta(days=last_login)
            u.save(update_fields=["last_login"])
        return u
