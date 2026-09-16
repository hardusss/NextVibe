from django.test import TestCase
from django.contrib.auth import get_user_model
from user.models import InviteUser, Block
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


class DeleteAccountTest(TestCase):
    """Anonymizing soft delete: PII scrub, hidden state, token rejection."""

    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from user.views_pac.delete_account import DeleteAccountView
        self.factory = APIRequestFactory()
        self._orig_throttles = DeleteAccountView.throttle_classes
        DeleteAccountView.throttle_classes = []
        self.user = User.objects.create_user(
            email="doomed@example.com", username="doomed", password="Password123!"
        )
        self.user.about = "bio"
        self.user.wallet_address = "So11111111111111111111111111111111111111112"
        self.user.secret_2fa = "SECRET"
        self.user.is2FA = True
        self.user.expo_push_token = "ExponentPushToken[x]"
        self.user.apple_user_id = "001111.deadbeef.1111"
        self.user.save()

    def tearDown(self):
        from user.views_pac.delete_account import DeleteAccountView
        DeleteAccountView.throttle_classes = self._orig_throttles

    def _delete(self, user):
        from rest_framework.test import force_authenticate
        from user.views_pac.delete_account import DeleteAccountView
        request = self.factory.delete("/users/delete-account/")
        force_authenticate(request, user=user)
        return DeleteAccountView.as_view()(request)

    def test_delete_scrubs_pii_and_hides_account(self):
        response = self._delete(self.user)
        self.assertEqual(response.status_code, 200)

        scrubbed = User.all_objects.get(user_id=self.user.user_id)
        self.assertEqual(scrubbed.username, f"deleted_user_{self.user.user_id}")
        self.assertIsNone(scrubbed.email)
        self.assertEqual(scrubbed.about, "")
        self.assertIsNone(scrubbed.wallet_address)
        self.assertIsNone(scrubbed.secret_2fa)
        self.assertFalse(scrubbed.is2FA)
        self.assertIsNone(scrubbed.expo_push_token)
        self.assertIsNone(scrubbed.apple_user_id)
        self.assertEqual(scrubbed.auth_provider, "deleted")
        self.assertTrue(scrubbed.is_baned)
        self.assertFalse(scrubbed.is_active)
        # Hidden from the default (banned-filtering) manager
        self.assertFalse(User.objects.filter(user_id=self.user.user_id).exists())

    def test_existing_token_rejected_after_delete(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import AuthenticationFailed
        from user.auth import CustomJWTAuthentication

        token = str(RefreshToken.for_user(self.user).access_token)
        self._delete(self.user)

        request = self.factory.get(
            "/users/invite-info/", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        with self.assertRaises(AuthenticationFailed):
            CustomJWTAuthentication().authenticate(request)

    def test_deleted_email_and_wallet_are_reusable(self):
        self._delete(self.user)
        fresh = User.objects.create_user(
            email="doomed@example.com", username="doomed", password="Password123!"
        )
        fresh.wallet_address = "So11111111111111111111111111111111111111112"
        fresh.save()
        self.assertEqual(fresh.email, "doomed@example.com")


class BlockUserTest(TestCase):
    """Block / unblock / blocked list, and what a block hides on the user side."""

    BLOCK_URL = "/api/v1/users/block/"
    BLOCKED_URL = "/api/v1/users/blocked/"

    def setUp(self):
        from django.core.cache import cache
        from rest_framework.test import APIClient
        # Scoped throttles and list pages live in locmem across tests
        cache.clear()
        self.alice = User.objects.create_user(email="alice@example.com", username="alice", password="Password123!")
        self.bob = User.objects.create_user(email="bob@example.com", username="bob", password="Password123!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.alice)
        self.bob_client = APIClient()
        self.bob_client.force_authenticate(user=self.bob)

    def block(self, user, client=None):
        return (client or self.client).post(self.BLOCK_URL, {"user_id": user.user_id}, format="json")

    def unblock(self, user, client=None):
        return (client or self.client).delete(f"{self.BLOCK_URL}{user.user_id}/")

    def follow(self, client, user):
        return client.put(f"/api/v1/users/follow/{user.user_id}/")

    def test_self_block_rejected(self):
        response = self.block(self.alice)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Block.objects.exists())

    def test_double_block_is_idempotent(self):
        self.assertEqual(self.block(self.bob).status_code, 201)
        self.assertEqual(self.block(self.bob).status_code, 204)
        self.assertEqual(Block.objects.filter(blocker=self.alice, blocked=self.bob).count(), 1)

    def test_unknown_user_404(self):
        response = self.client.post(self.BLOCK_URL, {"user_id": 999999}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.post(self.BLOCK_URL, {}, format="json").status_code, 400)

    def test_block_removes_follows_both_ways(self):
        self.assertEqual(self.follow(self.client, self.bob).status_code, 200)
        self.assertEqual(self.follow(self.bob_client, self.alice).status_code, 200)

        self.assertEqual(self.block(self.bob).status_code, 201)

        for user in (self.alice, self.bob):
            user.refresh_from_db()
            self.assertEqual(user.follow_for, [])
            self.assertEqual(user.readers, [])
            self.assertEqual(user.follows_count, 0)
            self.assertEqual(user.readers_count, 0)

        # Neither side can follow again while the block stands
        self.assertEqual(self.follow(self.client, self.bob).status_code, 404)
        self.assertEqual(self.follow(self.bob_client, self.alice).status_code, 404)

    def test_block_keeps_other_follows(self):
        carol = User.objects.create_user(email="carol@example.com", username="carol", password="Password123!")
        self.follow(self.client, carol)
        self.follow(self.client, self.bob)

        self.block(self.bob)

        self.alice.refresh_from_db()
        carol.refresh_from_db()
        self.assertEqual(self.alice.follow_for, [carol.user_id])
        self.assertEqual(self.alice.follows_count, 1)
        self.assertEqual(carol.readers, [self.alice.user_id])

    def test_unblock_is_idempotent_and_only_for_the_blocker(self):
        self.block(self.bob)

        # Bob can't lift Alice's block
        self.assertEqual(self.unblock(self.alice, client=self.bob_client).status_code, 204)
        self.assertTrue(Block.objects.filter(blocker=self.alice, blocked=self.bob).exists())

        self.assertEqual(self.unblock(self.bob).status_code, 204)
        self.assertEqual(self.unblock(self.bob).status_code, 204)
        self.assertFalse(Block.objects.exists())

    def test_blocked_list_newest_first(self):
        carol = User.objects.create_user(email="carol@example.com", username="carol", password="Password123!")
        self.block(self.bob)
        self.block(carol)

        response = self.client.get(self.BLOCKED_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([u["username"] for u in response.data["data"]], ["carol", "bob"])
        self.assertTrue(response.data["end"])
        for key in ("user_id", "avatar", "official", "seeker_verified"):
            self.assertIn(key, response.data["data"][0])

        # Being blocked doesn't put anyone on your own list
        self.assertEqual(self.bob_client.get(self.BLOCKED_URL).data["data"], [])

    def test_blocked_list_paginates(self):
        for i in range(13):
            other = User.objects.create_user(email=f"u{i}@example.com", username=f"u{i}", password="Password123!")
            self.block(other)

        first = self.client.get(self.BLOCKED_URL)
        self.assertEqual(len(first.data["data"]), 12)
        self.assertFalse(first.data["end"])

        second = self.client.get(self.BLOCKED_URL, {"index": 12})
        self.assertEqual(len(second.data["data"]), 1)
        self.assertTrue(second.data["end"])
        self.assertEqual(second.data["data"][0]["username"], "u0")

    def test_profile_flags_both_directions(self):
        self.block(self.bob)

        mine = self.client.get(f"/api/v1/users/user-detail/{self.bob.user_id}/", {"isProfile": "true"})
        self.assertEqual(mine.status_code, 200)
        self.assertTrue(mine.data["is_blocked"])
        self.assertFalse(mine.data["is_blocked_by"])
        self.assertEqual(mine.data["username"], "bob")
        # Only the minimal blocked state, no bio/stats/lists
        for key in ("about", "readers_count", "follow_for", "liked_posts", "reputation"):
            self.assertNotIn(key, mine.data)

        theirs = self.bob_client.get(f"/api/v1/users/user-detail/{self.alice.user_id}/", {"isProfile": "true"})
        self.assertFalse(theirs.data["is_blocked"])
        self.assertTrue(theirs.data["is_blocked_by"])
        self.assertNotIn("about", theirs.data)

        self.unblock(self.bob)
        restored = self.client.get(f"/api/v1/users/user-detail/{self.bob.user_id}/", {"isProfile": "true"})
        self.assertFalse(restored.data["is_blocked"])
        self.assertFalse(restored.data["is_blocked_by"])
        self.assertIn("about", restored.data)

    def test_search_and_follower_lists_hide_blocked_people(self):
        from rest_framework.test import APIClient
        carol = User.objects.create_user(email="carol@example.com", username="carol", password="Password123!")
        carol_client = APIClient()
        carol_client.force_authenticate(user=carol)
        self.follow(self.client, carol)
        self.follow(self.bob_client, carol)

        def listed(client, url, params):
            data = client.get(url, params).data["data"]
            return sorted(u["username"] for u in data) if isinstance(data, list) else []

        readers_url = "/api/v1/users/get-readers/"
        # Carol (no blocks) warms the shared page cache first
        self.assertEqual(listed(carol_client, readers_url, {"user_id": carol.user_id}), ["alice", "bob"])

        self.block(self.bob)

        self.assertEqual(listed(self.client, readers_url, {"user_id": carol.user_id}), ["alice"])
        self.assertEqual(listed(self.bob_client, readers_url, {"user_id": carol.user_id}), ["bob"])
        self.assertEqual(listed(carol_client, readers_url, {"user_id": carol.user_id}), ["alice", "bob"])
        # The blocked person's own lists are empty for the other side
        self.assertEqual(listed(self.bob_client, "/api/v1/users/get-follows/", {"user_id": self.alice.user_id}), [])

        self.assertEqual(listed(self.client, "/api/v1/users/search/", {"searchName": "bo"}), [])
        self.assertEqual(listed(self.bob_client, "/api/v1/users/search/", {"searchName": "ali"}), [])
        self.assertEqual(listed(carol_client, "/api/v1/users/search/", {"searchName": "bo"}), ["bob"])

    def test_notifications_from_blocked_people_hidden(self):
        # Bob following Alice leaves a notification for her
        self.follow(self.bob_client, self.alice)
        count_url = "/api/v1/users/count-unread-notifications/"
        self.assertEqual(self.client.get(count_url).data["count"], 1)

        self.block(self.bob)

        self.assertEqual(self.client.get(count_url).data["count"], 0)
        notifications = self.client.get("/api/v1/users/notifications/").data["data"]["notify"]
        self.assertEqual(notifications, [])

        self.unblock(self.bob)
        self.assertEqual(self.client.get(count_url).data["count"], 1)
