from django.test import TestCase
from django.contrib.auth import get_user_model
from user.models import InviteUser
from posts.models import Reputation
from user.serializers_pac.registration import UserRegistrationSerializer
from user.src.grant_invite_reward import check_and_grant_invite_rewards

User = get_user_model()


class InviteSystemTest(TestCase):
    def setUp(self):
        self.inviter = User.objects.create_user(
            email="inviter@example.com",
            username="inviter",
            password="Password123!"
        )
        self.invite_profile, _ = InviteUser.objects.get_or_create(owner=self.inviter)

    def test_invite_milestone_reputation_grant(self):
        # 1st invite
        s1 = UserRegistrationSerializer(data={
            "email": "user1@example.com",
            "username": "user1",
            "password": "Password123!",
            "from_invite_code": self.invite_profile.invite_code
        })
        self.assertTrue(s1.is_valid(), s1.errors)
        u1 = s1.save()

        self.invite_profile.refresh_from_db()
        self.assertEqual(self.invite_profile.invited_count, 1)
        self.assertFalse(
            Reputation.objects.filter(user=self.inviter, post_type="invite_reward_lvl2").exists()
        )

        # 2nd invite -> milestone 2 reached
        s2 = UserRegistrationSerializer(data={
            "email": "user2@example.com",
            "username": "user2",
            "password": "Password123!",
            "from_invite_code": self.invite_profile.invite_code
        })
        self.assertTrue(s2.is_valid(), s2.errors)
        u2 = s2.save()

        self.invite_profile.refresh_from_db()
        self.assertEqual(self.invite_profile.invited_count, 2)

        # Verify reputation entry created with random points (20 to 50)
        rep = Reputation.objects.filter(user=self.inviter, post_type="invite_reward_lvl2").first()
        self.assertIsNotNone(rep)
        self.assertGreaterEqual(rep.points, 20)
        self.assertLessEqual(rep.points, 50)

    def test_og_mint_requires_three_invites(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from user.views_pac.mint_og import OgNftMintView

        factory = APIRequestFactory()
        self.inviter.wallet_address = "0x1234567890abcdef1234567890abcdef12345678"
        self.inviter.save()

        request = factory.post("/users/mint-og/")
        force_authenticate(request, user=self.inviter)
        view = OgNftMintView.as_view()

        # 0 invites -> should fail
        response = view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("at least 3 invites", response.data.get("error", ""))

    def test_link_email_grants_reputation(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from user.views_pac.link_email import LinkEmailView

        wallet_user = User.objects.create(
            username="wallet_only_user",
            wallet_address="0x9999999999999999999999999999999999999999",
            auth_provider="wallet"
        )

        factory = APIRequestFactory()
        request = factory.post("/users/link-email/", {"email": "linked@example.com"}, format="json")
        force_authenticate(request, user=wallet_user)
        view = LinkEmailView.as_view()

        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("reputation_earned"), 20)

        wallet_user.refresh_from_db()
        self.assertEqual(wallet_user.email, "linked@example.com")
        self.assertTrue(
            Reputation.objects.filter(user=wallet_user, post_type="link_email_reward", points=20).exists()
        )

        # Trying to link email again should fail
        request2 = factory.post("/users/link-email/", {"email": "another@example.com"}, format="json")
        force_authenticate(request2, user=wallet_user)
        response2 = view(request2)
        self.assertEqual(response2.status_code, 400)


class SaveWalletAddressTest(TestCase):
    """Linking, replacing, and cross-account conflicts for save-wallet."""

    ADDR_A = "So11111111111111111111111111111111111111112"
    ADDR_B = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E"

    def setUp(self):
        from rest_framework.test import APIRequestFactory
        self.factory = APIRequestFactory()
        self.owner = User.objects.create_user(
            email="owner@example.com", username="owner", password="Password123!"
        )
        self.owner.wallet_address = self.ADDR_A
        self.owner.save()
        self.other = User.objects.create_user(
            email="other@example.com", username="other", password="Password123!"
        )

    def _post(self, user, address):
        from rest_framework.test import force_authenticate
        from user.views_pac.save_wallet_address import SaveWalletAddressView
        request = self.factory.post("/users/save-wallet/", {"walletAddress": address}, format="json")
        force_authenticate(request, user=user)
        return SaveWalletAddressView.as_view()(request)

    def test_same_address_is_a_noop_success(self):
        response = self._post(self.owner, self.ADDR_A)
        self.assertEqual(response.status_code, 200)

    def test_user_can_replace_own_linked_wallet(self):
        response = self._post(self.owner, self.ADDR_B)
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.wallet_address, self.ADDR_B)

    def test_address_owned_by_another_account_is_rejected(self):
        response = self._post(self.other, self.ADDR_A)
        self.assertEqual(response.status_code, 400)
        self.assertIn("another account", response.data.get("error", ""))
        self.other.refresh_from_db()
        self.assertNotEqual(self.other.wallet_address, self.ADDR_A)

    def test_address_owned_by_banned_account_is_rejected(self):
        # The default manager hides banned users; the guard must still see them
        # or the unique constraint turns this into a 500.
        self.owner.is_baned = True
        self.owner.save(update_fields=["is_baned"])
        response = self._post(self.other, self.ADDR_A)
        self.assertEqual(response.status_code, 400)
        self.assertIn("another account", response.data.get("error", ""))
        self.other.refresh_from_db()
        self.assertNotEqual(self.other.wallet_address, self.ADDR_A)


class AppleSignInTest(TestCase):
    """Signup, login, Private Relay, and banned-account paths for Apple Sign-In."""

    SUB = "001234.abcdef1234567890.1234"

    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from user.views_pac.apple_registration import AppleRegisterView
        self.factory = APIRequestFactory()
        self.view_cls = AppleRegisterView
        # ScopedRateThrottle ("auth": 10/min) shares one locmem bucket across
        # the whole class — disable it so test count doesn't matter
        self._orig_throttles = AppleRegisterView.throttle_classes
        AppleRegisterView.throttle_classes = []
        self.inviter = User.objects.create_user(
            email="apple_inviter@example.com", username="apple_inviter", password="Password123!"
        )
        self.invite_code = InviteUser.objects.get(owner=self.inviter).invite_code

    def tearDown(self):
        self.view_cls.throttle_classes = self._orig_throttles

    def _post(self, payload, token_payload):
        from unittest.mock import patch
        request = self.factory.post("/users/apple-sign-in/", payload, format="json")
        with patch("user.views_pac.apple_registration.validate", return_value=token_payload):
            return self.view_cls.as_view()(request)

    def test_new_signup_with_invite_creates_user(self):
        # Regression: this returned 400 (avatar_url=None failed URLField validation)
        response = self._post(
            {"identityToken": "t", "from_invite_code": self.invite_code, "username": "apple_joe"},
            {"sub": self.SUB, "email": "joe@example.com"},
        )
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="joe@example.com")
        self.assertEqual(user.apple_user_id, self.SUB)
        self.assertEqual(user.auth_provider, "apple")
        self.assertIn("token", response.data)

    def test_new_user_without_invite_gets_invite_required(self):
        response = self._post({"identityToken": "t"}, {"sub": self.SUB, "email": "new@example.com"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("error"), "invite_code_required")

    def test_unknown_invite_code_is_rejected(self):
        response = self._post(
            {"identityToken": "t", "from_invite_code": "ZZZZZZ"},
            {"sub": self.SUB, "email": "new@example.com"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("error"), "invalid_invite_code")

    def test_login_by_apple_user_id_without_email(self):
        # Apple omits the email on every sign-in after the first
        user = User.objects.create_user(email="joe@example.com", username="joe")
        user.apple_user_id = self.SUB
        user.save(update_fields=["apple_user_id"])
        response = self._post({"identityToken": "t"}, {"sub": self.SUB})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("user_id"), user.user_id)

    def test_email_fallback_backfills_apple_user_id(self):
        user = User.objects.create_user(email="pre@example.com", username="pre_apple")
        response = self._post({"identityToken": "t"}, {"sub": self.SUB, "email": "pre@example.com"})
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.apple_user_id, self.SUB)

    def test_banned_user_logs_in_instead_of_500(self):
        # Banned users are hidden by the default manager; the lookup must still
        # find them or creation hits the email unique constraint (500)
        user = User.objects.create_user(email="banned@example.com", username="banned_apple")
        user.apple_user_id = self.SUB
        user.is_baned = True
        user.save(update_fields=["apple_user_id", "is_baned"])
        response = self._post({"identityToken": "t"}, {"sub": self.SUB, "email": "banned@example.com"})
        self.assertEqual(response.status_code, 200)

    def test_username_collision_gets_suffix(self):
        User.objects.create_user(email="taken@example.com", username="joe")
        response = self._post(
            {"identityToken": "t", "from_invite_code": self.invite_code, "username": "joe"},
            {"sub": self.SUB, "email": "joe2@example.com"},
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.get(email="joe2@example.com").username, "joe_1")

    def test_private_relay_placeholder_email_on_signup(self):
        # No email claim at all → deterministic placeholder keeps signup working
        response = self._post(
            {"identityToken": "t", "from_invite_code": self.invite_code},
            {"sub": self.SUB},
        )
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(apple_user_id=self.SUB)
        self.assertEqual(user.email, f"{self.SUB}@privaterelay.appleid.com")
        self.assertTrue(user.username.startswith("apple_"))
