from unittest import mock

from django.core import mail
from django.test import override_settings

from nvcli import log, receipts, render, send_email, send_push
from nvcli.render import Template
from nvcli.tests._base import NvTestCase


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = str(self._payload)

    def json(self):
        return self._payload


class LogTest(NvTestCase):
    def test_slug(self):
        self.assertEqual(log.slug(" Sep 20 / Seeker! "), "sep-20-seeker")
        self.assertEqual(log.slug("---"), "")

    def test_append_read_rewrite_and_waves(self):
        self.assertEqual(log.read("c"), [])
        self.assertEqual(log.next_wave("c"), 1)
        log.append("c", log.entry(campaign="c", wave=1, user_id=1, username="a", channel="push", variant="A", status="sent", ticket="T1"))
        log.append("c", log.entry(campaign="c", wave=1, user_id=2, username="b", channel="push", variant="B", status="failed", error="boom"))
        log.append("c", log.entry(campaign="c", wave=1, user_id=9, username="op", channel="push", variant="A", status="test"))
        rows = log.read("c")
        self.assertEqual(len(rows), 3)
        self.assertEqual(set(rows[0]), set(log.FIELDS))
        self.assertEqual(log.next_wave("c"), 2)
        self.assertEqual(log.sent_keys("c"), {(1, "push")})
        rows[1]["status"] = "sent"
        log.rewrite("c", rows)
        self.assertEqual(log.sent_user_ids("c"), {1, 2})
        self.assertEqual(log.counts(log.read("c")), {"sent": 2, "delivered": 0, "failed": 0, "unregistered": 0, "test": 1})

    def test_read_skips_a_torn_line(self):
        log.append("c", log.entry(campaign="c", user_id=1, channel="push", status="sent"))
        with log.campaign_path("c").open("a") as fh:
            fh.write('{"ts": "2026-09-19T10:00:00", "user_id": 2, "cha')
        self.assertEqual(len(log.read("c")), 1)

    def test_summary_and_index(self):
        for uid, variant, wave, status in ((1, "A", 1, "sent"), (2, "B", 1, "sent"), (3, "A", 2, "unregistered"), (4, "A", 1, "delivered")):
            log.append("c", log.entry(campaign="c", wave=wave, user_id=uid, channel="push", variant=variant, status=status))
        s = log.summarize(log.read("c"))
        self.assertEqual(s[("A", "push", 1)]["sent"], 1)
        self.assertEqual(s[("A", "push", 1)]["delivered"], 1)
        self.assertEqual(s[("A", "push", 2)]["unregistered"], 1)
        self.assertEqual(s[("B", "push", 1)]["sent"], 1)
        info = log.update_index("c", channel="push", segments="seeker AND push")
        self.assertEqual(info["counts"]["sent"], 2)
        self.assertEqual(info["waves"], 2)
        self.assertEqual(log.read_index()["c"]["segments"], "seeker AND push")
        self.assertEqual(log.list_campaigns(), ["c"])

    def test_deliveries_for_user_spans_campaigns(self):
        log.append("a", log.entry(campaign="a", user_id=5, channel="push", status="sent"))
        log.append("b", log.entry(campaign="b", user_id=5, channel="email", status="failed"))
        log.append("b", log.entry(campaign="b", user_id=6, channel="email", status="sent"))
        self.assertEqual(sorted(r["campaign"] for r in log.deliveries_for_user(5)), ["a", "b"])

    def test_optout_roundtrip(self):
        self.assertTrue(log.add_optout("email", 7))
        self.assertFalse(log.add_optout("email", 7))
        self.assertTrue(log.add_optout("push", 8))
        self.assertEqual(log.read_optout(), {"email": {7}, "push": {8}})
        with self.assertRaises(ValueError):
            log.add_optout("sms", 1)


class OptoutEndpointTest(NvTestCase):
    def test_signed_links_record_optouts(self):
        from user.views_pac.optout import make_token

        u = self.user("alice")
        res = self.client.get(f"/u/e/{make_token(u.user_id)}")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"won't get emails", res.content)
        res = self.client.get(f"/u/p/{make_token(u.user_id)}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(log.read_optout(), {"email": {u.user_id}, "push": {u.user_id}})

    def test_bad_token_is_rejected(self):
        res = self.client.get("/u/e/not-a-token")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(log.read_optout(), {"email": set(), "push": set()})


class PushSendTest(NvTestCase):
    def rendered(self):
        t = Template(name="t", channel="push", title="Hi {first_name}", body="b", deeplink="nextvibe://home", data={"type": "x"})
        return render.render(t, {"first_name": "a"})

    def test_batch_maps_tickets_to_results(self):
        payload = {"data": [
            {"status": "ok", "id": "T1"},
            {"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}},
            {"status": "error", "message": "too big", "details": {"error": "MessageTooBig"}},
        ]}
        msgs = [send_push.build_message(f"tok{i}", self.rendered(), "c", "A", 1) for i in range(3)]
        self.assertEqual(msgs[0]["data"], {"type": "x", "url": "/home", "deeplink": "nextvibe://home", "campaign": "c", "variant": "A", "wave": 1})
        with mock.patch("nvcli.send_push.requests.post", return_value=FakeResponse(200, payload)) as post:
            results = send_push.send_batch(msgs)
        self.assertEqual(post.call_count, 1)
        self.assertEqual([r.status for r in results], ["sent", "unregistered", "failed"])
        self.assertEqual(results[0].ticket, "T1")
        self.assertEqual(results[2].error, "MessageTooBig: too big")

    def test_retries_on_429_then_succeeds(self):
        responses = [FakeResponse(429), FakeResponse(503), FakeResponse(200, {"data": [{"status": "ok", "id": "T"}]})]
        with mock.patch("nvcli.send_push.requests.post", side_effect=responses) as post, \
                mock.patch("nvcli.send_push.time.sleep") as sleep:
            r = send_push.send_one("tok", self.rendered())
        self.assertEqual((r.status, r.ticket), ("sent", "T"))
        self.assertEqual(post.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_whole_batch_fails_after_retries(self):
        with mock.patch("nvcli.send_push.requests.post", return_value=FakeResponse(500)), \
                mock.patch("nvcli.send_push.time.sleep"):
            results = send_push.send_batch([send_push.build_message("t", self.rendered())] * 2)
        self.assertEqual([r.status for r in results], ["failed", "failed"])
        self.assertIn("gave up", results[0].error)

    def test_ping_message_is_data_only(self):
        m = send_push.ping_message("tok")
        self.assertEqual(m["data"], {"type": "ping"})
        self.assertNotIn("title", m)
        self.assertNotIn("body", m)


class ReceiptsTest(NvTestCase):
    def test_receipts_update_log_and_clear_dead_tokens(self):
        alive = self.user("alive")
        dead = self.user("dead")
        for u, ticket in ((alive, "T-ok"), (dead, "T-dead")):
            log.append("c", log.entry(campaign="c", wave=1, user_id=u.user_id, username=u.username, channel="push", variant="A", status="sent", ticket=ticket))
        log.append("c", log.entry(campaign="c", wave=1, user_id=alive.user_id, channel="email", status="sent", ticket="msg-1"))
        payload = {"data": {
            "T-ok": {"status": "ok"},
            "T-dead": {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
        }}
        with mock.patch("nvcli.receipts.requests.post", return_value=FakeResponse(200, payload)) as post:
            summary = receipts.apply_to_campaign("c")
        self.assertEqual(post.call_args.kwargs["json"], {"ids": ["T-ok", "T-dead"]})
        self.assertEqual((summary["checked"], summary["delivered"], summary["unregistered"], summary["cleared_tokens"]), (2, 1, 1, 1))
        by_user = {(r["user_id"], r["channel"]): r for r in log.read("c")}
        self.assertEqual(by_user[(alive.user_id, "push")]["status"], "delivered")
        self.assertEqual(by_user[(dead.user_id, "push")]["status"], "unregistered")
        self.assertEqual(by_user[(alive.user_id, "email")]["status"], "sent")  # untouched
        dead.refresh_from_db()
        alive.refresh_from_db()
        self.assertIsNone(dead.expo_push_token)
        self.assertTrue(alive.expo_push_token)
        # the dead device no longer counts as reached → wave 2 may retry it
        self.assertEqual(log.sent_keys("c"), {(alive.user_id, "push"), (alive.user_id, "email")})

    def test_receipts_batches_of_300(self):
        for i in range(650):
            log.append("c", log.entry(campaign="c", wave=1, user_id=i, channel="push", status="sent", ticket=f"T{i}"))
        with mock.patch("nvcli.receipts.requests.post", return_value=FakeResponse(200, {"data": {}})) as post:
            summary = receipts.apply_to_campaign("c")
        self.assertEqual(post.call_count, 3)
        self.assertEqual([len(c.kwargs["json"]["ids"]) for c in post.call_args_list], [300, 300, 50])
        self.assertEqual(summary["pending"], 650)

    def test_validate_tokens_finds_dead_ones(self):
        ok_user = self.user("ok")
        bad_user = self.user("bad")
        later_dead = self.user("later")
        send_payload = {"data": [
            {"status": "ok", "id": "T-ok"},
            {"status": "error", "message": "x", "details": {"error": "DeviceNotRegistered"}},
            {"status": "ok", "id": "T-later"},
        ]}
        receipt_payload = {"data": {"T-ok": {"status": "ok"}, "T-later": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}}
        def post(url, **kw):  # send_push and receipts share the one requests module
            return FakeResponse(200, send_payload if url == send_push.EXPO_SEND_URL else receipt_payload)

        with mock.patch("nvcli.send_push.requests.post", side_effect=post), \
                mock.patch("nvcli.receipts.time.sleep"):
            dead, checked = receipts.validate_tokens()
        self.assertEqual(checked, 3)
        self.assertEqual(sorted(d["username"] for d in dead), ["bad", "later"])
        self.assertEqual(receipts.clear_tokens([d["user_id"] for d in dead]), 2)
        ok_user.refresh_from_db()
        self.assertTrue(ok_user.expo_push_token)
        self.assertIsNone(type(ok_user).all_objects.get(pk=bad_user.pk).expo_push_token)
        self.assertIsNone(type(ok_user).all_objects.get(pk=later_dead.pk).expo_push_token)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailTest(NvTestCase):
    def test_locmem_backend_is_not_bulk_safe(self):
        info = send_email.backend_info()
        self.assertEqual(info.kind, "console")
        self.assertFalse(info.bulk_ok)

    def test_backend_classification(self):
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp.gmail.com"):
            self.assertEqual(send_email.backend_info().kind, "consumer")
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST=""):
            self.assertEqual(send_email.backend_info().kind, "unconfigured")
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp.resend.com"):
            info = send_email.backend_info()
            self.assertEqual((info.kind, info.bulk_ok), ("smtp", True))
        with mock.patch.dict("os.environ", {"RESEND_API_KEY": "re_x"}):
            self.assertEqual(send_email.backend_info().kind, "resend")

    def test_django_send_has_html_alternative_and_unsubscribe_header(self):
        r = send_email.send_email("a@example.com", "Subject", "plain", "<p>html</p>", unsubscribe_url="https://api/u/e/T")
        self.assertEqual(r.status, "sent")
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Subject")
        self.assertEqual(msg.body, "plain")
        self.assertEqual(msg.alternatives[0][1], "text/html")
        self.assertEqual(msg.extra_headers["List-Unsubscribe"], "<https://api/u/e/T>")

    def test_resend_path(self):
        with mock.patch.dict("os.environ", {"RESEND_API_KEY": "re_x", "NV_EMAIL_FROM": "NextVibe <hi@nextvibe.io>"}), \
                mock.patch("nvcli.send_email.requests.post", return_value=FakeResponse(200, {"id": "em_1"})) as post:
            r = send_email.send_email("a@example.com", "S", "t", "<p>h</p>", unsubscribe_url="https://u")
        self.assertEqual((r.status, r.message_id), ("sent", "em_1"))
        body = post.call_args.kwargs["json"]
        self.assertEqual((body["from"], body["to"], body["headers"]), ("NextVibe <hi@nextvibe.io>", ["a@example.com"], {"List-Unsubscribe": "<https://u>"}))
        with mock.patch.dict("os.environ", {"RESEND_API_KEY": "re_x"}), \
                mock.patch("nvcli.send_email.requests.post", return_value=FakeResponse(422, {"message": "bad from"})):
            r = send_email.send_email("a@example.com", "S", "t", "<p>h</p>")
        self.assertEqual(r.status, "failed")
        self.assertIn("bad from", r.error)

    def test_rate_limiter_spacing(self):
        limiter = send_email.RateLimiter(120)  # 0.5 s apart
        with mock.patch("nvcli.send_email.time.monotonic", side_effect=[100.0, 100.0, 100.1, 100.6]), \
                mock.patch("nvcli.send_email.time.sleep") as sleep:
            limiter.wait()
            limiter.wait()
        self.assertEqual(sleep.call_count, 1)
        self.assertAlmostEqual(sleep.call_args.args[0], 0.4, places=3)


class IdempotentSendTest(NvTestCase):
    """The wizard's delivery builder skips (user, channel) pairs already sent."""

    def test_build_deliveries_skips_already_sent_pairs(self):
        from nvcli import menu

        a = self.user("a")
        b = self.user("b", push=False)
        c = self.user("c", email=False)
        log.append("camp", log.entry(campaign="camp", wave=1, user_id=a.user_id, channel="push", status="sent", ticket="T"))
        log.append("camp", log.entry(campaign="camp", wave=1, user_id=b.user_id, channel="email", status="failed"))
        plan = menu.Plan(name="camp", wave=2, channel="both", include=["email"], exclude=[],
                         variants={"A": Template(name="t", channel="both", title="Hi {first_name}", body="b")},
                         split_a=1.0, share_label="all")
        plan.extra = {}
        deliveries = menu.build_deliveries(plan, [a, b, c], log.sent_keys("camp"))
        pairs = sorted((d.user.username, d.channel) for d in deliveries)
        # a: push already sent → only email; b: failed email is retried; c: push only
        self.assertEqual(pairs, [("a", "email"), ("b", "email"), ("c", "push")])
        self.assertTrue(all(d.variant == "A" for d in deliveries))
        self.assertEqual(deliveries[0].rendered.title, "Hi a")
