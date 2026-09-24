"""
Connect-a-wallet reminders (posts/src/wallet_reminders.py): when each step is
due, quiet hours in the person's time zone, one push every 3 days at most,
several steps due at once, never the same step twice, stop on connect and
on the settings toggle, the day-7 email, and dead tokens from receipts.
"""
import hashlib
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest import mock

import base58
from django.core.cache import cache
from django.test import TestCase

from nvcli import render
from nvcli.send_email import EmailResult
from nvcli.send_push import PushResult
from posts.models import Collectible, CollectibleReminder, ReminderPreference, Reputation
from posts.src import collectibles, meets, wallet_reminders
from user.models import User

UTC = dt_timezone.utc
# 12:00 in Kyiv (UTC+3 in September)
T0 = datetime(2026, 9, 26, 9, 0, tzinfo=UTC)


def wallet(name):
    return base58.b58encode(hashlib.sha256(name.encode()).digest()).decode()


def make_user(name, **extra):
    return User.objects.create_user(username=name, email=f"{name}@test.com", password="pass12345", **extra)


class WalletRemindersTest(TestCase):
    def setUp(self):
        cache.clear()

        def patch(target, **kwargs):
            patcher = mock.patch(target, **kwargs)
            started = patcher.start()
            self.addCleanup(patcher.stop)
            return started

        patch("django.db.transaction.on_commit", side_effect=lambda func, using=None, robust=False: func())
        patch("posts.src.collectibles.enqueue")
        patch("posts.src.collectibles.enqueue_user")
        patch("posts.src.realtime.publish", return_value=True)
        patch("posts.src.geocode.lookup", return_value=("Kyiv", "UA"))
        self.pushes = []

        def send(user, title, body, data):
            self.pushes.append((getattr(user, "user_id", user), title, body, data))
            return PushResult("sent", f"ticket-{len(self.pushes)}", None)

        self.push = patch("posts.src.push.send", side_effect=send)
        self.emails = []

        def send_one(user, rendered, campaign, ref=None, **kwargs):
            self.emails.append((user.username, rendered, campaign, ref))
            return EmailResult("sent", "email-id", None)

        patch("nvcli.send_email.send_one", side_effect=send_one)

        self.alice = make_user("alice", wallet_address=wallet("alice"))
        self.bob = make_user("bob", expo_push_token="ExponentPushToken[bob]")
        self.meet(self.alice, self.bob)

    def tearDown(self):
        cache.clear()

    def meet(self, a, b, saved_at=T0):
        slug = meets.tap_slug(a.user_id, b.user_id, "irl", when=saved_at)
        Reputation.objects.create(user=a, given_by=b, points=1, source="irl", meet_slug=slug)
        Reputation.objects.create(user=b, given_by=a, points=1, source="irl", meet_slug=slug)
        collectibles.record_meet(slug, a, b, when=saved_at)
        Collectible.objects.filter(source_id=slug).update(created_at=saved_at)
        return slug

    def run_at(self, when):
        return wallet_reminders.run(now=when)

    def steps(self, channel="push", status="sent"):
        return list(CollectibleReminder.objects.filter(user=self.bob, channel=channel, status=status)
                    .order_by("id").values_list("step", flat=True))

    def test_the_schedule(self):
        self.run_at(T0 + timedelta(hours=23))
        self.assertEqual(self.pushes, [])
        self.run_at(T0 + timedelta(hours=24))
        self.assertEqual(self.pushes[-1][1:3], ("Your Proof of Meet with @alice is saved",
                                                "Connect a wallet to put it on Solana. It’s free."))
        self.assertEqual(self.pushes[-1][3], {"type": "wallet_reminder", "url": "/u/wallet", "step": "24h"})
        # +3 d is only two days after the first push: the 3-day gap moves it to day 4
        self.run_at(T0 + timedelta(days=3))
        self.assertEqual(len(self.pushes), 1)
        self.run_at(T0 + timedelta(days=4))
        self.assertEqual(self.pushes[-1][1:3], ("You have 1 collectible waiting to go on-chain", "It takes 10 seconds."))
        self.run_at(T0 + timedelta(days=7))
        self.assertEqual(self.pushes[-1][1], "Your Proof of Meet with @alice is still off-chain")
        self.assertEqual([(name, campaign) for name, _, campaign, _ in self.emails], [("bob", "claim-reminder")])
        self.assertEqual(self.emails[0][1].title, "Your Proof of Meet with @alice is still off-chain")
        for days in (14, 21, 28, 35, 42, 49):
            self.run_at(T0 + timedelta(days=days))
        self.assertEqual(self.steps(), ["24h", "3d", "7d", "w1", "w2", "w3", "w4"])
        self.assertEqual(len(self.pushes), 7)  # the schedule ends after four weekly ones

    def test_counts_are_fresh(self):
        carol = make_user("carol")
        self.meet(carol, self.bob, saved_at=T0 + timedelta(hours=1))
        self.run_at(T0 + timedelta(days=4, hours=2))
        self.assertEqual(self.pushes[-1][1], "You have 2 collectibles waiting to go on-chain")

    def test_quiet_hours_in_the_persons_time_zone(self):
        night_in_kyiv = T0 + timedelta(hours=24 + 11)  # 20:00 UTC = 23:00 in Kyiv
        self.run_at(night_in_kyiv)
        self.assertEqual(self.pushes, [])
        ReminderPreference.objects.create(user=self.bob, timezone="America/New_York")  # 16:00 there
        self.run_at(night_in_kyiv)
        self.assertEqual(len(self.pushes), 1)
        self.assertFalse(wallet_reminders.in_send_window(datetime(2026, 9, 27, 21, 0)))
        self.assertTrue(wallet_reminders.in_send_window(datetime(2026, 9, 27, 10, 0)))

    def test_one_push_every_three_days(self):
        self.run_at(T0 + timedelta(days=2))  # 24h goes out on day 2
        self.run_at(T0 + timedelta(days=3))  # 3d is due, but the last push was a day ago
        self.assertEqual(self.steps(), ["24h"])
        self.run_at(T0 + timedelta(days=5))
        self.assertEqual(self.steps(), ["24h", "3d"])

    def test_several_due_at_once_sends_only_the_latest(self):
        self.run_at(T0 + timedelta(days=8))
        self.assertEqual(self.steps(), ["7d"])
        self.assertEqual(self.steps(status="skipped"), ["24h", "3d"])
        self.run_at(T0 + timedelta(days=12))
        self.assertEqual(len(self.pushes), 1)

    def test_never_the_same_step_twice(self):
        when = T0 + timedelta(days=1)
        self.run_at(when)
        cache.clear()
        self.run_at(when + timedelta(minutes=5))
        self.assertEqual(len(self.pushes), 1)

    def test_they_stop_on_connect(self):
        User.objects.filter(pk=self.bob.pk).update(wallet_address=wallet("bob"))
        self.run_at(T0 + timedelta(days=1))
        self.assertEqual(self.pushes, [])

    def test_they_stop_once_nothing_is_off_chain(self):
        Collectible.objects.filter(user=self.bob).update(status="minted")
        self.run_at(T0 + timedelta(days=1))
        self.assertEqual(self.pushes, [])

    def test_the_settings_toggle(self):
        ReminderPreference.objects.create(user=self.bob, wallet_reminders=False)
        self.run_at(T0 + timedelta(days=7))
        self.assertEqual((self.pushes, self.emails), ([], []))

    def test_items_saved_before_this_existed_start_at_deploy(self):
        """Backfilled rows: recorded weeks ago, saved (created) today."""
        dave = make_user("dave", expo_push_token="ExponentPushToken[dave]")
        slug = self.meet(self.alice, dave, saved_at=T0)
        Collectible.objects.filter(source_id=slug).update(recorded_at=T0 - timedelta(days=40))
        self.run_at(T0 + timedelta(hours=2))
        self.assertEqual(self.pushes, [])

    def test_no_token_still_gets_the_email(self):
        User.objects.filter(pk=self.bob.pk).update(expo_push_token=None)
        self.run_at(T0 + timedelta(days=7))
        self.assertEqual(self.pushes, [])
        self.assertEqual(self.steps(status="skipped"), ["24h", "3d", "7d"])
        self.assertEqual(self.steps(channel="email"), ["7d"])

    def test_dead_tokens_from_receipts_are_cleared(self):
        self.run_at(T0 + timedelta(days=1))
        receipt = {"ticket-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        with mock.patch("nvcli.receipts.fetch_receipts", return_value=receipt):
            wallet_reminders.check_receipts(now=T0 + timedelta(days=1, minutes=20))
        self.assertIsNone(User.objects.get(pk=self.bob.pk).expo_push_token)
        self.assertEqual(self.steps(status="unregistered"), ["24h"])

    def test_a_new_token_isnt_cleared_by_an_old_receipt(self):
        self.run_at(T0 + timedelta(days=1))
        User.objects.filter(pk=self.bob.pk).update(expo_push_token="ExponentPushToken[new-phone]")
        receipt = {"ticket-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        with mock.patch("nvcli.receipts.fetch_receipts", return_value=receipt):
            wallet_reminders.check_receipts(now=T0 + timedelta(days=1, minutes=20))
        self.assertEqual(User.objects.get(pk=self.bob.pk).expo_push_token, "ExponentPushToken[new-phone]")

    def test_the_email_template(self):
        template = render.get_template("claim-reminder")
        rendered = render.render(template, render.user_context(self.bob, needs=template.placeholders()))
        html, text = rendered.email_parts()
        self.assertEqual(rendered.title, "Your Proof of Meet with @alice is still off-chain")
        self.assertEqual(rendered.deeplink, "https://nextvibe.io/u/wallet")
        self.assertIn('href="https://nextvibe.io/u/wallet"', html)
        self.assertIn("Saved off-chain (1 collectible): Proof of Meet with @alice.", text)
        self.assertIn("/u/e/", text)  # the unsubscribe link
        self.assertEqual(render.wording_violations(html + text), [])
        # Nothing saved off-chain: the template is skipped for that person
        ctx = render.user_context(self.alice, needs=template.placeholders())
        self.assertEqual(render.skip_reason(ctx), render.NOTHING_OFFCHAIN)

    def test_push_texts_use_no_forbidden_words(self):
        carol = make_user("carol")
        self.meet(carol, self.bob, saved_at=T0)
        texts = wallet_reminders.claim_texts(User.objects.get(pk=self.bob.pk))
        for key in ("latest", "count", "still"):
            self.assertEqual(render.wording_violations(" ".join(texts[key])), [])
