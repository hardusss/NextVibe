"""Email and password sign-in (POST /users/login/)."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from user.views_pac.login_view import LoginUserView

User = get_user_model()


class LoginTest(TestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()
        self._throttles = LoginUserView.throttle_classes
        LoginUserView.throttle_classes = []
        User.objects.create_user(email="login@example.com", username="loginuser", password="Password123!")

    def tearDown(self):
        LoginUserView.throttle_classes = self._throttles

    def login(self, email, password):
        request = self.factory.post("/users/login/", {"email": email, "password": password}, format="json")
        return LoginUserView.as_view()(request)

    def test_right_password_signs_in(self):
        response = self.login("login@example.com", "Password123!")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data["token"])

    def test_unknown_email_and_wrong_password_get_the_same_answer(self):
        unknown = self.login("nobody@example.com", "Password123!")
        wrong = self.login("login@example.com", "Wrong-password-1")
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(unknown.status_code, wrong.status_code)
        self.assertEqual(unknown.data, wrong.data)
