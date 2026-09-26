"""
Invite codes are optional on every sign-up path.

The app's invite sheet sends from_invite_code="" when the person taps Skip
(or closes the sheet). Each path has to create the account with no inviter,
and a real code still has to credit the friend who shared it.
"""
from unittest.mock import patch

import base58
import requests
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from user.models import InviteUser
from user.views_pac.apple_registration import AppleRegisterView
from user.views_pac.google_registration import GoogleRegisterView
from user.views_pac.registration_view import RegisterUserView
from user.views_pac.wallet_singin import WalletSignInView

User = get_user_model()


class SignupWithoutInviteTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        # "auth" is 10/min in one locmem bucket; don't let the test count matter
        self._throttles = {v: v.throttle_classes for v in (AppleRegisterView, GoogleRegisterView, RegisterUserView)}
        for view in self._throttles:
            view.throttle_classes = []
        self.friend = User.objects.create_user(email="friend@example.com", username="friend", password="Password123!")
        self.friend_code = InviteUser.objects.get(owner=self.friend).invite_code

    def tearDown(self):
        for view, throttles in self._throttles.items():
            view.throttle_classes = throttles

    def _post(self, view, path, payload):
        return view.as_view()(self.factory.post(path, payload, format="json"))

    def _apple(self, payload, sub="001234.skip"):
        with patch("user.views_pac.apple_registration.validate", return_value={"sub": sub, "email": f"{sub}@example.com"}):
            return self._post(AppleRegisterView, "/users/apple-sign-in/", {"identityToken": "t", **payload})

    def _google(self, payload, email="skip@gmail.com"):
        # Same body as the app sends (src/api/google.sign.in.ts); the avatar
        # download is stubbed out
        claims = {"email": email, "email_verified": True, "name": "Skip Person"}
        body = {
            "idToken": "t", "username": email.split("@")[0], "email": email,
            "avatar_url": "https://media.nextvibe.io/images/default.png", **payload,
        }
        with patch("user.views_pac.google_registration.validate", return_value=claims), \
                patch("user.serializers_pac.google_registration.requests.get", side_effect=requests.RequestException):
            return self._post(GoogleRegisterView, "/users/google-sign-in/", body)

    def _wallet(self, payload, seed=b"\x07"):
        address = base58.b58encode(seed * 32).decode()
        body = {"wallet_address": address, "username": f"vibe_{address[:6]}.lzr", "is_lazorkit": True, **payload}
        return self._post(WalletSignInView, "/users/wallet-sign-in/", body), address

    def _friend_invites(self):
        return InviteUser.objects.get(owner=self.friend).invited_count or 0

    def test_apple_skip_creates_account_without_inviter(self):
        for i, code in enumerate(["", None]):
            response = self._apple({"from_invite_code": code}, sub=f"001234.skip{i}")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertIn("token", response.data)
            self.assertIsNone(User.objects.get(apple_user_id=f"001234.skip{i}").from_invite_code)
        self.assertEqual(self._friend_invites(), 0)

    def test_google_skip_creates_account_without_inviter(self):
        response = self._google({"from_invite_code": ""})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("token", response.data)
        self.assertIsNone(User.objects.get(email="skip@gmail.com").from_invite_code)

    def test_wallet_skip_creates_account_without_inviter(self):
        response, address = self._wallet({"from_invite_code": ""})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("token", response.data)
        self.assertIsNone(User.objects.get(wallet_address=address).from_invite_code)

    def test_email_signup_needs_no_code(self):
        response = self._post(RegisterUserView, "/users/register/", {
            "email": "plain@example.com", "username": "plain_person", "password": "Password123!",
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(User.objects.get(email="plain@example.com").from_invite_code)

    def test_friend_code_still_credits_the_friend(self):
        self.assertEqual(self._apple({"from_invite_code": self.friend_code}).status_code, 201)
        self.assertEqual(self._google({"from_invite_code": self.friend_code}, email="friendly@gmail.com").status_code, 201)
        response, _ = self._wallet({"from_invite_code": self.friend_code})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self._friend_invites(), 3)

    def test_first_request_without_the_field_asks_the_app_for_the_sheet(self):
        # The app's first call leaves the field out; this answer opens the
        # optional invite sheet. It is not a requirement to have a code.
        self.assertEqual(self._apple({}).data.get("error"), "invite_code_required")
        self.assertEqual(self._google({}).data.get("error"), "invite_code_required")
        response, _ = self._wallet({})
        self.assertEqual(response.data.get("error"), "invite_code_required")
        self.assertEqual(User.objects.count(), 1)
