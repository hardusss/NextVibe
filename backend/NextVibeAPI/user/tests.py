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
