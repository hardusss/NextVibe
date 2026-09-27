"""
Email codes: an email + password account confirms its email once (while
EMAIL_VERIFICATION_REQUIRED is on), and anyone with the inbox can reset the
password. Google, Apple and wallet accounts never get a code.
"""
import re
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from verification import email_codes
from verification.accounts import is_email_verified, mark_email_verified
from verification.email_codes import RESET, VERIFY, check_code, send_code

User = get_user_model()
PASSWORD = "Password123!"


def last_code() -> str:
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].subject).group(1)


class EmailCodeTestCase(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        throttle = patch.object(ScopedRateThrottle, "allow_request", return_value=True)
        throttle.start()
        self.addCleanup(throttle.stop)
        self.client = APIClient()

    def account(self, email="ana@example.com", username="ana", provider="email"):
        user = User.objects.create_user(email=email, username=username, password=PASSWORD)
        user.auth_provider = provider
        user.save(update_fields=["auth_provider"])
        return user

    def post(self, path, body):
        return self.client.post(f"/api/v1/users/{path}", body, format="json")


class CodeStoreTests(EmailCodeTestCase):
    def test_a_code_works_once_and_only_for_its_purpose(self):
        self.assertEqual(send_code(VERIFY, "Ana@Example.com", "ana@example.com"), (None, 60))
        code = last_code()
        self.assertEqual(mail.outbox[-1].to, ["ana@example.com"])
        self.assertIn(code, mail.outbox[-1].body)
        self.assertEqual(check_code(RESET, "ana@example.com", code), "CODE_EXPIRED")
        self.assertIsNone(check_code(VERIFY, "ana@example.com", code))
        self.assertEqual(check_code(VERIFY, "ana@example.com", code), "CODE_EXPIRED")

    def test_five_wrong_tries_end_the_code(self):
        send_code(RESET, "ana@example.com", "ana@example.com")
        code = last_code()
        wrong = "000000" if code != "000000" else "111111"
        results = [check_code(RESET, "ana@example.com", wrong) for _ in range(5)]
        self.assertEqual(results, ["INVALID_CODE"] * 4 + ["TOO_MANY_ATTEMPTS"])
        self.assertEqual(check_code(RESET, "ana@example.com", code), "CODE_EXPIRED")

    def test_malformed_codes_are_wrong(self):
        for bad in (None, "", "12345", "abcdef", 123456, "1234567"):
            cache.clear()
            send_code(RESET, "ana@example.com", "ana@example.com")
            self.assertEqual(check_code(RESET, "ana@example.com", bad), "INVALID_CODE", bad)

    def test_sending_is_limited(self):
        self.assertIsNone(send_code(VERIFY, "ana@example.com", "ana@example.com")[0])
        error, retry_in = send_code(VERIFY, "ana@example.com", "ana@example.com")
        self.assertEqual(error, "COOLDOWN")
        self.assertTrue(0 < retry_in <= 61)
        cache.delete(email_codes._base(VERIFY, "ana@example.com") + ":next")
        with patch.object(email_codes, "RESEND_AFTER", 0):
            results = [send_code(VERIFY, "ana@example.com", "ana@example.com")[0] for _ in range(5)]
        self.assertEqual(results, [None] * 4 + ["TOO_MANY_CODES"])
        self.assertEqual(len(mail.outbox), 5)

    def test_a_failed_send_can_be_retried_at_once(self):
        with patch.object(email_codes, "send_mail", side_effect=RuntimeError("down")):
            self.assertEqual(send_code(VERIFY, "ana@example.com", "ana@example.com"), ("SEND_FAILED", 0))
        self.assertIsNone(send_code(VERIFY, "ana@example.com", "ana@example.com")[0])

    def test_only_a_digest_is_stored(self):
        send_code(VERIFY, "ana@example.com", "ana@example.com")
        stored = cache.get(email_codes._base(VERIFY, "ana@example.com"))
        self.assertNotIn(last_code(), stored)


@override_settings(EMAIL_VERIFICATION_REQUIRED=True)
class ConfirmEmailTests(EmailCodeTestCase):
    def register(self, **extra):
        return self.post("register/", {"email": "new@example.com", "username": "newbie", "password": PASSWORD, **extra})

    def test_registration_asks_for_the_code_instead_of_signing_in(self):
        response = self.register()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["verification_required"])
        self.assertEqual(response.data["email"], "new@example.com")
        self.assertNotIn("data", response.data)
        self.assertNotIn("token", response.data)
        self.assertEqual(mail.outbox[-1].to, ["new@example.com"])

        response = self.post("email/verify/", {"email": "new@example.com", "password": PASSWORD, "code": last_code()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data["token"])
        self.assertTrue(is_email_verified(User.objects.get(email="new@example.com")))

    def test_login_of_an_unconfirmed_account_sends_a_code(self):
        self.account()
        response = self.post("login/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EMAIL_NOT_VERIFIED")
        self.assertNotIn("token", response.data)
        code = last_code()

        # Asking again within the minute doesn't send another email
        again = self.post("login/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(again.status_code, 403)
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn("sendError", again.data)

        response = self.post("email/verify/", {"email": "ana@example.com", "password": PASSWORD, "code": code})
        self.assertEqual(response.status_code, 200, response.data)
        response = self.post("login/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data["token"])

    def test_a_wrong_password_never_sends_a_code(self):
        self.account()
        response = self.post("login/", {"email": "ana@example.com", "password": "wrong-password"})
        self.assertEqual(response.status_code, 400)
        response = self.post("email/send-code/", {"email": "ana@example.com", "password": "wrong-password"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(mail.outbox, [])

    def test_the_code_needs_the_password_too(self):
        self.account()
        self.post("email/send-code/", {"email": "ana@example.com", "password": PASSWORD})
        response = self.post("email/verify/", {"email": "ana@example.com", "password": "nope", "code": last_code()})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("token", response.data)

    def test_a_wrong_code_is_refused(self):
        self.account()
        self.post("email/send-code/", {"email": "ana@example.com", "password": PASSWORD})
        wrong = "000000" if last_code() != "000000" else "111111"
        response = self.post("email/verify/", {"email": "ana@example.com", "password": PASSWORD, "code": wrong})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "INVALID_CODE")

    def test_resend_waits_a_minute(self):
        self.account()
        first = self.post("email/send-code/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data["resendIn"], 60)
        second = self.post("email/send-code/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "COOLDOWN")

    def test_google_apple_and_confirmed_accounts_sign_in_directly(self):
        for provider in ("google", "apple"):
            self.account(email=f"{provider}@example.com", username=provider, provider=provider)
            response = self.post("login/", {"email": f"{provider}@example.com", "password": PASSWORD})
            self.assertEqual(response.status_code, 200, (provider, response.data))
        confirmed = self.account(email="done@example.com", username="done")
        mark_email_verified(confirmed)
        response = self.post("login/", {"email": "done@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_a_changed_email_needs_confirming_again(self):
        user = self.account()
        mark_email_verified(user)
        user.email = "other@example.com"
        user.save(update_fields=["email"])
        self.assertFalse(is_email_verified(user))

    def test_the_token_endpoint_follows_the_same_rule(self):
        self.account()
        response = self.post("token/", {"email": "ana@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("access", response.data)


class SwitchedOffTests(EmailCodeTestCase):
    def test_nothing_changes_while_the_switch_is_off(self):
        self.assertFalse(settings.EMAIL_VERIFICATION_REQUIRED)
        response = self.post("register/", {"email": "new@example.com", "username": "newbie", "password": PASSWORD})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("access", response.data["data"]["token"])
        response = self.post("login/", {"email": "new@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data["token"])
        response = self.post("token/", {"email": "new@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox, [])

    def test_the_token_endpoint_is_rate_limited(self):
        from user.views_pac.login_view import TokenObtainView
        self.assertIn(ScopedRateThrottle, TokenObtainView.throttle_classes)
        self.assertEqual(TokenObtainView.throttle_scope, "auth")
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        for scope in ("auth", "email_code", "email_code_check"):
            self.assertIn(scope, rates)


class ResetPasswordTests(EmailCodeTestCase):
    def test_reset_with_the_emailed_code(self):
        user = self.account()
        old_session = self.post("login/", {"email": "ana@example.com", "password": PASSWORD}).data["token"]
        response = self.post("password/forgot/", {"email": "ANA@example.com"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(mail.outbox[-1].to, ["ana@example.com"])
        self.assertIn("password reset", mail.outbox[-1].subject)

        response = self.post("password/reset/", {"email": "ana@example.com", "code": last_code(),
                                                  "newPassword": "NewPassword456!"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data["token"])
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPassword456!"))
        self.assertTrue(is_email_verified(user))
        # Other devices are signed out
        refresh = self.post("token/refresh/", {"refresh": old_session["refresh"]})
        self.assertEqual(refresh.status_code, 401)
        # The new session works
        refresh = self.post("token/refresh/", {"refresh": response.data["token"]["refresh"]})
        self.assertEqual(refresh.status_code, 200)

    def test_an_unknown_email_gets_the_same_answer_and_no_email(self):
        response = self.post("password/forgot/", {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"sent": True, "resendIn": 60})
        self.assertEqual(mail.outbox, [])
        response = self.post("password/forgot/", {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 429)

    def test_a_short_password_keeps_the_code(self):
        user = self.account()
        self.post("password/forgot/", {"email": "ana@example.com"})
        code = last_code()
        response = self.post("password/reset/", {"email": "ana@example.com", "code": code, "newPassword": "short"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "WEAK_PASSWORD")
        response = self.post("password/reset/", {"email": "ana@example.com", "code": code, "newPassword": "LongEnough1"})
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password("LongEnough1"))

    def test_wrong_codes_and_bad_input_change_nothing(self):
        user = self.account()
        self.post("password/forgot/", {"email": "ana@example.com"})
        wrong = "000000" if last_code() != "000000" else "111111"
        for body in ({"email": "ana@example.com", "code": wrong, "newPassword": "NewPassword456!"},
                     {"email": "", "code": last_code(), "newPassword": "NewPassword456!"},
                     {"email": "other@example.com", "code": last_code(), "newPassword": "NewPassword456!"}):
            response = self.post("password/reset/", body)
            self.assertEqual(response.status_code, 400, body)
        user.refresh_from_db()
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(self.post("password/forgot/", {"email": "not-an-email"}).status_code, 400)

    def test_deleted_and_banned_accounts_get_no_code(self):
        self.account(provider="deleted")
        banned = self.account(email="banned@example.com", username="banned")
        banned.is_baned = True
        banned.save(update_fields=["is_baned"])
        for email in ("ana@example.com", "banned@example.com"):
            self.assertEqual(self.post("password/forgot/", {"email": email}).status_code, 200)
        self.assertEqual(mail.outbox, [])
