from django.core.cache import cache
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"
RAW_APNS = "8f1c6c0f5f2d4f6c9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f"


class PushTokenTest(TestCase):
    """save-push-token/ and me/push-token/: bind, move between accounts, release, read."""

    SAVE_URL = "/api/v1/users/save-push-token/"
    ME_URL = "/api/v1/users/me/push-token/"

    def setUp(self):
        cache.clear()  # ScopedRateThrottle counts live in the cache
        self.user = User.objects.create_user(email="phone@example.com", username="phone", password="Password123!")
        self.other = User.objects.create_user(email="old@example.com", username="old_owner", password="Password123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _post(self, body, url=None):
        cache.clear()  # these tests aren't about the 5/min write limit
        return self.client.post(url or self.SAVE_URL, body, format="json")

    def _token_of(self, user):
        return User.all_objects.get(user_id=user.user_id).expo_push_token

    def test_saves_token_and_resending_is_a_no_op(self):
        first = self._post({"pushToken": TOKEN_A})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data, {"data": "Token saved"})
        self.assertEqual(self._token_of(self.user), TOKEN_A)

        again = self._post({"pushToken": f"  {TOKEN_A} "})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data, {"data": "Token already saved"})
        self.assertEqual(self._token_of(self.user), TOKEN_A)

    def test_new_token_replaces_the_old_one(self):
        self._post({"pushToken": TOKEN_A})
        self._post({"pushToken": TOKEN_B})
        self.assertEqual(self._token_of(self.user), TOKEN_B)

    def test_token_moves_from_the_previous_account_on_the_same_phone(self):
        self.other.expo_push_token = TOKEN_A
        self.other.save()
        banned = User.objects.create_user(email="banned@example.com", username="banned", password="Password123!")
        banned.expo_push_token = TOKEN_A
        banned.is_baned = True
        banned.save()
        untouched = User.objects.create_user(email="own@example.com", username="own_phone", password="Password123!")
        untouched.expo_push_token = TOKEN_B
        untouched.save()

        response = self._post({"pushToken": TOKEN_A})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._token_of(self.user), TOKEN_A)
        self.assertIsNone(self._token_of(self.other))
        self.assertIsNone(self._token_of(banned))
        self.assertEqual(self._token_of(untouched), TOKEN_B)

    def test_takeover_also_runs_when_this_account_already_has_the_token(self):
        # Both accounts ended up with the token before this fix
        User.all_objects.filter(user_id__in=[self.user.user_id, self.other.user_id]).update(expo_push_token=TOKEN_A)
        self.user.refresh_from_db()

        response = self._post({"pushToken": TOKEN_A})

        self.assertEqual(response.data, {"data": "Token already saved"})
        self.assertEqual(self._token_of(self.user), TOKEN_A)
        self.assertIsNone(self._token_of(self.other))

    def test_rejects_raw_device_tokens_and_bad_input(self):
        self._post({"pushToken": TOKEN_A})
        for body in (
            {"pushToken": RAW_APNS},
            {"pushToken": "ExponentPushToken[" + "x" * 90 + "]"},  # longer than the column
            {"pushToken": "ExponentPushToken[unterminated"},
            {"pushToken": ""},
            {"pushToken": 42},
            {},
        ):
            with self.subTest(body=body):
                self.assertEqual(self._post(body).status_code, 400)
        self.assertEqual(self._token_of(self.user), TOKEN_A)

    def test_accepts_the_newer_expo_token_prefix(self):
        self.assertEqual(self._post({"pushToken": "ExpoPushToken[cccccccccccccccccccccc]"}).status_code, 200)

    def test_sign_out_clears_the_token(self):
        self._post({"pushToken": TOKEN_A})
        response = self._post({"pushToken": None, "releaseToken": TOKEN_A})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"data": "Token cleared"})
        self.assertIsNone(self._token_of(self.user))

        # Nothing left to clear: still fine
        self.assertEqual(self._post({"pushToken": None}).data, {"data": "No token saved"})

    def test_sign_out_without_release_token_clears_whatever_is_stored(self):
        self._post({"pushToken": TOKEN_A})
        self.assertEqual(self._post({"pushToken": None}).status_code, 200)
        self.assertIsNone(self._token_of(self.user))

    def test_sign_out_on_an_old_phone_keeps_the_newer_phones_token(self):
        self._post({"pushToken": TOKEN_B})  # the newer phone registered last
        response = self._post({"pushToken": None, "releaseToken": TOKEN_A})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._token_of(self.user), TOKEN_B)

    def test_get_returns_this_accounts_token_on_both_urls(self):
        self.assertEqual(self.client.get(self.ME_URL).data, {"token": None})
        self._post({"pushToken": TOKEN_A}, url=self.ME_URL)
        self.assertEqual(self.client.get(self.ME_URL).data, {"token": TOKEN_A})
        self.assertEqual(self.client.get(self.SAVE_URL).data, {"token": TOKEN_A})

    def test_requires_authentication(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(self.ME_URL).status_code, 401)
        self.assertEqual(anonymous.post(self.SAVE_URL, {"pushToken": TOKEN_A}, format="json").status_code, 401)

    def test_banned_account_cannot_bind_but_can_release(self):
        self.user.expo_push_token = TOKEN_A
        self.user.is_baned = True
        self.user.save()
        self.client.force_authenticate(user=User.all_objects.get(user_id=self.user.user_id))

        self.assertEqual(self._post({"pushToken": TOKEN_B}).status_code, 404)
        self.assertEqual(self._token_of(self.user), TOKEN_A)
        self.assertEqual(self._post({"pushToken": None, "releaseToken": TOKEN_A}).status_code, 200)
        self.assertIsNone(self._token_of(self.user))

    def test_reads_are_not_rate_limited_but_writes_are(self):
        for _ in range(8):
            self.assertEqual(self.client.get(self.ME_URL).status_code, 200)
        codes = [
            self.client.post(self.SAVE_URL, {"pushToken": TOKEN_A}, format="json").status_code
            for _ in range(6)
        ]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5], 429)
