"""Refresh tokens: rotation never signs anyone out; a password change or account deletion revokes them."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
REFRESH_URL = "/api/v1/users/token/refresh/"


class SessionTest(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="s@example.com", username="sessions", password="Password123!")
        self.user.secret_2fa = "JBSWY3DPEHPK3PXP"
        self.user.save()
        self.client = APIClient()

    def refresh(self, token):
        return self.client.post(REFRESH_URL, {"refresh": str(token)}, format="json")

    def test_the_same_refresh_token_can_be_used_twice_at_once(self):
        token = RefreshToken.for_user(self.user)
        self.assertEqual(self.refresh(token).status_code, 200)
        self.assertEqual(self.refresh(token).status_code, 200)

    @patch("user.views_pac.reset_password.TwoFA.auth", return_value=True)
    def test_a_password_change_revokes_other_sessions(self, _auth):
        other_device = RefreshToken.for_user(self.user)
        self.client.force_authenticate(user=self.user)
        changed = self.client.put("/api/v1/users/reset-password/?verifyCode=123456",
                                  {"newPassword": "NewPassword123!"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.refresh(other_device).status_code, 401)

    def test_deleting_the_account_revokes_its_sessions(self):
        token = RefreshToken.for_user(self.user)
        self.client.force_authenticate(user=self.user)
        self.assertIn(self.client.delete("/api/v1/users/delete-account/").status_code, (200, 204))
        self.client.force_authenticate(user=None)
        self.assertEqual(self.refresh(token).status_code, 401)
