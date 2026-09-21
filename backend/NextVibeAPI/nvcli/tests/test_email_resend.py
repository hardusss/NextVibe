"""
Email over Resend's HTTP API, with Resend faked at the HTTP-client level
(the SDK's `default_http_client`), so the SDK's own request building and
error mapping run too. Sleeps are patched out.
"""
import base64
import hashlib
import hmac
import json as jsonlib
import time
from collections import Counter
from unittest import mock

import resend
from django.core.mail import EmailMultiAlternatives, send_mail
from django.test import Client, override_settings

from nvcli import log, menu, render, send_email
from nvcli.resend_api import ResendFailure
from nvcli.tests._base import NvTestCase
from user.views_pac.optout import make_token

API = "https://api.resend.com"
SECRET = "whsec_" + base64.b64encode(b"k" * 32).decode()
FROM = "Danylo from NextVibe <danylo@nextvibe.io>"


def error(status, name, message):
    return status, {"statusCode": status, "name": name, "message": message}


LIMITED = error(429, "rate_limit_exceeded", "Too many requests. Please limit the number of requests per second.")
UNVERIFIED = error(403, "validation_error",
                   "The nextvibe.io domain is not verified. Please, add and verify your domain on https://resend.com/domains")


class FakeResend(resend.HTTPClient):
    """Resend's API in a box: records every call and answers from a script
    ((status, body), an exception to raise, or None = accept and issue ids)."""

    def __init__(self, *replies):
        self.calls = []
        self.replies = list(replies)
        self.issued = 0

    def request(self, method, url, headers, json=None, files=None, data=None):
        self.calls.append({"method": method, "url": url, "headers": dict(headers), "json": json})
        reply = self.replies.pop(0) if self.replies else None
        if isinstance(reply, Exception):
            raise reply
        status, body = reply or (200, self.accept(json))
        return jsonlib.dumps(body).encode(), status, {"content-type": "application/json"}

    def accept(self, body):
        if isinstance(body, list):
            return {"data": [{"id": self.new_id()} for _ in body]}
        return {"id": self.new_id()}

    def new_id(self):
        self.issued += 1
        return f"em_{self.issued}"


def signed(body: bytes, secret=SECRET, msg_id="msg_1", ts=None) -> dict:
    ts = str(int(time.time()) if ts is None else ts)
    key = base64.b64decode(secret.removeprefix("whsec_"))
    sig = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    return {"svix-id": msg_id, "svix-timestamp": ts, "svix-signature": f"v1,{sig}"}


@override_settings(RESEND_API_KEY="re_test_123", RESEND_WEBHOOK_SECRET=SECRET, DEFAULT_FROM_EMAIL=FROM,
                   PUBLIC_API_URL="https://api.nextvibe.io")
class ResendTestCase(NvTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch("nvcli.send_email.time.sleep")  # the time module's sleep, for every caller
        self.sleep = patcher.start()
        self.addCleanup(patcher.stop)

    def fake(self, *replies) -> FakeResend:
        fake = FakeResend(*replies)
        patcher = mock.patch.object(resend, "default_http_client", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    @staticmethod
    def jobs(users, variant="A", template=None):
        template = template or render.get_template("seeker-badge-email")
        out = []
        for u in users:
            ctx = {"first_name": render.first_name(u.username), "username": u.username,
                   "unsubscribe": render.unsubscribe_url(u.user_id)}
            out.append(menu.Delivery(u, "email", variant, render.render(template, ctx)))
        return out

    def sleeps(self):
        return [c.args[0] for c in self.sleep.call_args_list]


class CampaignSendTest(ResendTestCase):
    def test_250_emails_go_in_three_batches_in_order(self):
        users = [self.user(f"u{i:03d}") for i in range(250)]
        fake = self.fake()
        run = send_email.send_campaign("sep21-seeker", 1, self.jobs(users))
        self.assertEqual(len(fake.calls), 3)
        self.assertTrue(all(c["url"] == f"{API}/emails/batch" for c in fake.calls))
        self.assertEqual([len(c["json"]) for c in fake.calls], [100, 100, 50])
        self.assertTrue(all(c["headers"]["x-batch-validation"] == "permissive" for c in fake.calls))
        self.assertEqual(len({c["headers"]["Idempotency-Key"] for c in fake.calls}), 3)
        self.assertEqual([m["to"] for c in fake.calls for m in c["json"]], [[u.email] for u in users])
        rows = log.read("sep21-seeker")
        self.assertEqual([r["user_id"] for r in rows], [u.user_id for u in users])
        self.assertEqual([r["ticket"] for r in rows], [f"em_{i}" for i in range(1, 251)])
        self.assertTrue(all((r["status"], r["channel"], r["wave"]) == ("sent", "email", 1) for r in rows))
        self.assertEqual(run.counts(), Counter(sent=250))
        self.assertEqual(self.sleeps(), [0.6, 0.6])  # Resend allows ~2 requests a second

    def test_message_shape(self):
        alice = self.user("alice")
        fake = self.fake()
        template = render.get_template("seeker-badge-email").with_subject_b()
        send_email.send_campaign("sep21.seeker", 2, self.jobs([alice], variant="B", template=template))
        m = fake.calls[0]["json"][0]
        unsubscribe = render.unsubscribe_url(alice.user_id)
        self.assertEqual((m["from"], m["to"], m["reply_to"]), (FROM, ["alice@example.com"], "danylo@nextvibe.io"))
        self.assertEqual(m["subject"], "alice, your Seeker badge is live")
        self.assertIn("<!doctype html>", m["html"].lower())
        self.assertIn(f'href="{unsubscribe}"', m["html"])
        self.assertTrue(m["text"].startswith("Hi alice,"))
        self.assertEqual(m["headers"], {
            "List-Unsubscribe": f"<{unsubscribe}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "X-Entity-Ref-ID": f"sep21.seeker:{alice.user_id}",
        })
        # tag values allow only letters, digits, _ and -
        self.assertEqual(m["tags"], [{"name": "campaign", "value": "sep21_seeker"},
                                     {"name": "variant", "value": "B"}, {"name": "wave", "value": "2"}])
        row = log.read("sep21.seeker")[0]
        self.assertEqual((row["variant"], row["wave"], row["title"]), ("B", 2, "alice, your Seeker badge is live"))

    def test_footer_and_header_share_the_unsubscribe_link(self):
        alice = self.user("alice")
        rendered = render.render(render.Template(name="x", channel="email", title="Hi", body="Body"), {})
        m = send_email.build_message(alice, rendered, "c")
        url = render.unsubscribe_url(alice.user_id)
        self.assertEqual(m["headers"]["List-Unsubscribe"], f"<{url}>")
        self.assertIn(f'href="{url}"', m["html"])
        self.assertIn(f"Unsubscribe: {url}", m["text"])

    def test_rejected_address_fails_only_that_user(self):
        users = [self.user(f"u{i}") for i in range(3)]
        self.fake((200, {"data": [{"id": "em_a"}, {"id": "em_c"}], "errors": [{"index": 1, "message": (
            "Invalid `to` field. The email address needs to follow the `email@example.com` "
            "or `Name <email@example.com>` format.")}]}))
        run = send_email.send_campaign("c", 1, self.jobs(users))
        rows = {r["username"]: r for r in log.read("c")}
        self.assertEqual((rows["u0"]["status"], rows["u0"]["ticket"]), ("sent", "em_a"))
        self.assertEqual((rows["u1"]["status"], rows["u1"]["ticket"]), ("failed", None))
        self.assertIn("Resend rejected the `to` field", rows["u1"]["error"])
        self.assertEqual((rows["u2"]["status"], rows["u2"]["ticket"]), ("sent", "em_c"))
        self.assertIsNone(run.fatal)

    def test_rate_limit_is_retried_then_succeeds(self):
        fake = self.fake(LIMITED, LIMITED, None)
        run = send_email.send_campaign("c", 1, self.jobs([self.user("a"), self.user("b")]))
        self.assertEqual(len(fake.calls), 3)
        self.assertEqual(self.sleeps(), [2.0, 2.0])
        self.assertEqual(len({c["headers"]["Idempotency-Key"] for c in fake.calls}), 1)  # a retry can't double-send
        self.assertEqual(run.counts(), Counter(sent=2))
        self.assertEqual([r["ticket"] for r in log.read("c")], ["em_1", "em_2"])

    def test_rate_limit_gives_up_after_three_retries(self):
        fake = self.fake(LIMITED, LIMITED, LIMITED, LIMITED)
        run = send_email.send_campaign("c", 1, self.jobs([self.user("a")]))
        self.assertEqual(len(fake.calls), 4)
        self.assertEqual(run.counts(), Counter(failed=1))
        self.assertIsNone(run.fatal)  # the next batch may go through
        self.assertIn("rate limit", log.read("c")[0]["error"])

    def test_fatal_error_stops_the_campaign_and_a_rerun_recovers(self):
        users = [self.user(f"u{i:03d}") for i in range(150)]
        fake = self.fake(UNVERIFIED)
        run = send_email.send_campaign("c", 1, self.jobs(users))
        self.assertEqual(len(fake.calls), 1)  # the second batch is never tried
        self.assertEqual(run.fatal.line, "nextvibe.io not verified in Resend → dashboard → Domains")
        rows = log.read("c")
        self.assertEqual(len(rows), 100)
        self.assertTrue(all(r["status"] == "failed" and "not verified" in r["error"] for r in rows))
        self.fake()
        run = send_email.send_campaign("c", 2, self.jobs(users))  # failed isn't "sent": everyone goes now
        self.assertEqual(run.counts(), Counter(sent=150))

    def test_rerun_same_campaign_makes_no_api_calls(self):
        users = [self.user(f"u{i}") for i in range(5)]
        self.fake()
        send_email.send_campaign("c", 1, self.jobs(users))
        fake = self.fake()
        run = send_email.send_campaign("c", 2, self.jobs(users))
        self.assertEqual(fake.calls, [])
        self.assertEqual((run.already, len(run.results)), (5, 0))
        self.assertEqual(len(log.read("c")), 5)

    def test_skip_rules(self):
        fine = self.user("fine")
        no_email = self.user("noemail", email=False)
        bad = self.user("bad")
        bad.email = "not-an-address"
        bad.save(update_fields=["email"])
        out = self.user("out")
        log.add_optout("email", out.user_id)
        gone = self.user("gone", active=False)
        banned = self.user("banned", banned=True)
        fake = self.fake()
        run = send_email.send_campaign("c", 1, self.jobs([fine, no_email, bad, out, gone, banned]))
        self.assertEqual([m["to"] for c in fake.calls for m in c["json"]], [["fine@example.com"]])
        self.assertEqual(run.skipped, Counter({"no email": 1, "invalid email": 1, "unsubscribed": 1,
                                               "inactive account": 1, "banned": 1}))
        self.assertEqual([r["username"] for r in log.read("c")], ["fine"])

    def test_dry_run_logs_without_calling_resend(self):
        users = [self.user("a"), self.user("b")]
        fake = self.fake()
        run = send_email.send_campaign("c", 1, self.jobs(users), dry=True)
        self.assertEqual(fake.calls, [])
        self.assertEqual([(r["status"], r["ticket"]) for r in log.read("c")], [("dry", None), ("dry", None)])
        self.assertEqual(run.counts(), Counter(dry=2))
        self.assertEqual(log.next_wave("c"), 1)  # a dry run opens no wave and reaches nobody
        self.assertEqual(send_email.send_campaign("c", 1, self.jobs(users)).counts(), Counter(sent=2))


class SingleSendTest(ResendTestCase):
    def test_idempotency_key_and_ref(self):
        alice = self.user("alice")
        rendered = self.jobs([alice])[0].rendered
        fake = self.fake()
        r = send_email.send_one(alice, rendered, "sep21")
        self.assertEqual((r.status, r.message_id), ("sent", "em_1"))
        call = fake.calls[0]
        self.assertEqual(call["url"], f"{API}/emails")
        self.assertEqual(call["headers"]["Idempotency-Key"], f"sep21:{alice.user_id}")
        self.assertEqual(call["headers"]["Authorization"], "Bearer re_test_123")
        # one-off sends pass a unique ref, so a deliberate second send isn't deduplicated
        ref = send_email.unique_ref("direct", alice.user_id)
        send_email.send_one(alice, rendered, "direct", ref=ref)
        self.assertEqual(fake.calls[1]["headers"]["Idempotency-Key"], ref)
        self.assertEqual(fake.calls[1]["json"]["headers"]["X-Entity-Ref-ID"], ref)
        self.assertNotEqual(ref, send_email.unique_ref("direct", alice.user_id))

    def test_network_error_is_retried_with_the_same_key(self):
        alice = self.user("alice")
        fake = self.fake(RuntimeError("Request failed: read timeout"), None)
        r = send_email.send_one(alice, self.jobs([alice])[0].rendered, "direct", ref="direct:1:x")
        self.assertEqual((r.status, r.message_id), ("sent", "em_1"))
        self.assertEqual([c["headers"]["Idempotency-Key"] for c in fake.calls], ["direct:1:x", "direct:1:x"])

    def test_error_lines(self):
        alice = self.user("alice")
        rendered = self.jobs([alice])[0].rendered
        cases = (
            (error(401, "missing_api_key", "Missing API key in the authorization header."), "RESEND_API_KEY invalid"),
            (error(403, "invalid_api_key", "API key is invalid"), "RESEND_API_KEY invalid"),
            (UNVERIFIED, "nextvibe.io not verified in Resend → dashboard → Domains"),
            (error(422, "validation_error", "Invalid `from` field. The email address needs to follow the "
                                            "`email@example.com` or `Name <email@example.com>` format."),
             "Resend rejected the `from` field: Invalid `from` field."),
            (error(429, "daily_quota_exceeded", "You have exceeded your daily email sending quota."), "quota"),
        )
        for reply, expected in cases:
            self.fake(reply)
            r = send_email.send_one(alice, rendered, "direct", ref="x")
            self.assertEqual(r.status, "failed")
            self.assertIn(expected, r.error)

    def test_opted_out_user_is_skipped(self):
        alice = self.user("alice")
        log.add_optout("email", alice.user_id)
        fake = self.fake()
        r = send_email.send_one(alice, self.jobs([alice])[0].rendered, "direct")
        self.assertEqual((r.status, r.error), ("skipped", "unsubscribed"))
        self.assertEqual(fake.calls, [])


class PreflightTest(ResendTestCase):
    DOMAIN = {"id": "d1", "name": "nextvibe.io", "status": "verified", "open_tracking": True,
              "click_tracking": True, "capabilities": {"sending": "enabled", "receiving": "disabled"}}

    def test_verified_domain(self):
        fake = self.fake((200, {"object": "list", "has_more": False, "data": [self.DOMAIN]}))
        check = send_email.preflight()
        self.assertTrue(check.ok, check.line)
        self.assertEqual((check.line, check.warnings), ("nextvibe.io verified in Resend", []))
        self.assertTrue(fake.calls[0]["url"].startswith(f"{API}/domains"))
        self.assertEqual(fake.calls[0]["method"], "get")

    def test_unverified_domain_lists_the_dns_records(self):
        records = [
            {"record": "SPF", "name": "send", "type": "MX", "ttl": "Auto", "status": "not_started",
             "value": "feedback-smtp.us-east-1.amazonses.com", "priority": 10},
            {"record": "SPF", "name": "send", "type": "TXT", "ttl": "Auto", "status": "not_started",
             "value": '"v=spf1 include:amazonses.com ~all"'},
            {"record": "DKIM", "name": "resend._domainkey", "type": "TXT", "ttl": "Auto", "status": "verified", "value": "p=MIGf"},
        ]
        fake = self.fake((200, {"data": [{**self.DOMAIN, "status": "pending"}]}),
                         (200, {"object": "domain", **self.DOMAIN, "status": "pending", "records": records}))
        check = send_email.preflight()
        self.assertFalse(check.ok)
        self.assertIn("nextvibe.io not verified in Resend (status: pending)", check.line)
        self.assertEqual([(r["record"], r["type"]) for r in check.records], [("SPF", "MX"), ("SPF", "TXT")])
        self.assertEqual(fake.calls[1]["url"], f"{API}/domains/d1")

    def test_missing_domain(self):
        self.fake((200, {"data": [{**self.DOMAIN, "name": "other.io"}]}))
        check = send_email.preflight()
        self.assertFalse(check.ok)
        self.assertIn("nextvibe.io isn't added in Resend", check.line)

    def test_key_must_be_set_and_look_right(self):
        fake = self.fake()
        with self.settings(RESEND_API_KEY=""):
            self.assertIn("RESEND_API_KEY is not set", send_email.preflight().line)
        with self.settings(RESEND_API_KEY="sk_live_123"):
            check = send_email.preflight()
        self.assertFalse(check.ok)
        self.assertIn("start with re_", check.line)
        self.assertEqual(fake.calls, [])

    def test_invalid_key(self):
        self.fake(error(401, "missing_api_key", "Missing API key in the authorization header."))
        check = send_email.preflight()
        self.assertFalse(check.ok)
        self.assertIn("RESEND_API_KEY invalid", check.line)

    def test_warns_when_opens_or_the_webhook_would_be_missing(self):
        self.fake((200, {"data": [{**self.DOMAIN, "open_tracking": False}]}))
        with self.settings(RESEND_WEBHOOK_SECRET=""):
            check = send_email.preflight()
        self.assertTrue(check.ok)
        self.assertEqual(len(check.warnings), 2)
        self.assertIn("open tracking is off", check.warnings[0])
        self.assertIn("RESEND_WEBHOOK_SECRET", check.warnings[1])
        self.assertIn("https://api.nextvibe.io/api/v1/nv/resend-webhook/", check.warnings[1])

    def test_sending_only_key_skips_the_domain_check(self):
        self.fake(error(401, "restricted_api_key", "This API key is restricted to only send emails."))
        check = send_email.preflight()
        self.assertTrue(check.ok)
        self.assertIn("sending-only", check.line)


class WebhookTest(ResendTestCase):
    URL = "/api/v1/nv/resend-webhook/"

    def post(self, payload, headers=None):
        body = jsonlib.dumps(payload).encode()
        return self.client.post(self.URL, data=body, content_type="application/json",
                                headers=signed(body) if headers is None else headers)

    @staticmethod
    def event(kind, email_id="em_1", **data):
        base = {"email_id": email_id, "to": ["alice@example.com"], "subject": "Hi",
                "tags": {"campaign": "sep21", "variant": "B", "wave": "1"}}
        return {"type": kind, "created_at": "2026-09-21T10:00:00.000Z", "data": {**base, **data}}

    def test_bad_signature_is_rejected_and_nothing_logged(self):
        body = jsonlib.dumps(self.event("email.opened")).encode()
        other = "whsec_" + base64.b64encode(b"z" * 32).decode()
        forged = {**signed(body), "svix-signature": "v1," + base64.b64encode(b"x" * 32).decode()}
        for headers in (forged, signed(body, secret=other), signed(body, ts=int(time.time()) - 3600), {}):
            res = self.client.post(self.URL, data=body, content_type="application/json", headers=headers)
            self.assertEqual(res.status_code, 400)
        res = self.client.post(self.URL, data=body + b" ", content_type="application/json", headers=signed(body))
        self.assertEqual(res.status_code, 400)  # body changed after signing
        with self.settings(RESEND_WEBHOOK_SECRET=""):
            res = self.client.post(self.URL, data=body, content_type="application/json", headers=signed(body))
        self.assertEqual(res.status_code, 400)
        self.assertFalse(log.events_path().exists())

    def test_opened_event_is_logged(self):
        res = self.post(self.event("email.opened"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(log.read_events(), [{"ts": "2026-09-21T10:00:00.000Z", "email_id": "em_1",
                                              "event": "email.opened", "campaign": "sep21", "variant": "B", "wave": 1}])
        self.assertEqual(log.read_optout()["email"], set())

    def test_rotated_secret_signatures(self):
        """During a secret rotation Svix sends several space-separated signatures."""
        body = jsonlib.dumps(self.event("email.delivered")).encode()
        headers = signed(body)
        headers["svix-signature"] = "v1,bm90LXRoaXMtb25l " + headers["svix-signature"]
        res = self.client.post(self.URL, data=body, content_type="application/json", headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_bounce_and_complaint_opt_the_user_out(self):
        alice = self.user("alice")
        bob = self.user("bob")
        log.append("sep21", log.entry(campaign="sep21", wave=1, user_id=alice.user_id, username="alice",
                                      channel="email", variant="B", status="sent", ticket="em_1"))
        bounce = {"type": "Permanent", "subType": "General", "message": "mailbox does not exist"}
        self.assertEqual(self.post(self.event("email.bounced", to=["someone-else@example.com"], bounce=bounce)).status_code, 200)
        self.assertEqual(log.read_optout()["email"], {alice.user_id})  # found by the email id, not the address
        # an email no log knows about is matched by its recipient
        self.post(self.event("email.complained", email_id="em_unknown", to=["bob@example.com"], tags={}))
        self.assertEqual(log.read_optout()["email"], {alice.user_id, bob.user_id})
        self.assertEqual([e["event"] for e in log.read_events()], ["email.bounced", "email.complained"])

    def test_transient_bounce_keeps_the_user(self):
        alice = self.user("alice")
        log.append("sep21", log.entry(campaign="sep21", user_id=alice.user_id, channel="email", status="sent", ticket="em_1"))
        self.post(self.event("email.bounced", bounce={"type": "Transient", "subType": "MailboxFull"}))
        self.assertEqual(log.read_optout()["email"], set())
        self.assertEqual(len(log.read_events()), 1)

    def test_other_events_are_acknowledged_not_logged(self):
        res = self.post({"type": "email.sent", "created_at": "2026-09-21T10:00:00Z", "data": {"email_id": "em_1"}})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(log.events_path().exists())


class CampaignStatusTest(ResendTestCase):
    def test_events_join_the_campaign_log_per_variant(self):
        rows = [
            log.entry(campaign="c", user_id=1, channel="email", variant="A", status="sent", ticket="em_1"),
            log.entry(campaign="c", user_id=2, channel="email", variant="A", status="sent", ticket="em_2"),
            log.entry(campaign="c", user_id=3, channel="email", variant="B", status="sent", ticket="em_3"),
            log.entry(campaign="c", user_id=9, channel="email", variant="A", status="test", ticket="em_9"),
            log.entry(campaign="c", user_id=4, channel="email", variant="B", status="failed"),
        ]
        for email_id, kind in (("em_1", "delivered"), ("em_1", "opened"), ("em_1", "opened"), ("em_2", "delivered"),
                               ("em_3", "delivered"), ("em_3", "clicked"), ("em_9", "opened"), ("em_x", "opened")):
            log.append_event({"ts": "t", "email_id": email_id, "event": f"email.{kind}"})
        eng = log.engagement(rows, log.read_events())
        self.assertEqual(eng["A"], Counter(sent=2, delivered=2, opened=1))  # the test send isn't counted
        self.assertEqual(eng["B"], Counter(sent=1, delivered=1, clicked=1))

    def test_one_email_then_webhook_shows_delivered(self):
        """Send to one user → Resend's email.delivered webhook → Campaign status says delivered 1."""
        alice = self.user("alice")
        self.fake()
        rendered = self.jobs([alice])[0].rendered
        r = menu.deliver_email(alice, rendered, menu.DIRECT_CAMPAIGN, "A", 1)
        menu.log_result(menu.DIRECT_CAMPAIGN, 1, alice, "email", "A", rendered, r.status, r.message_id, r.error)
        rows = log.read(menu.DIRECT_CAMPAIGN)
        with menu.console.capture() as before:
            menu.email_engagement(rows)
        self.assertIn("no events yet", before.get())
        body = jsonlib.dumps({"type": "email.delivered", "created_at": "2026-09-21T10:00:00Z",
                              "data": {"email_id": r.message_id, "to": [alice.email],
                                       "tags": {"campaign": "direct", "variant": "A", "wave": "1"}}}).encode()
        res = self.client.post(WebhookTest.URL, data=body, content_type="application/json", headers=signed(body))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(log.engagement(rows, log.read_events())["A"]["delivered"], 1)
        with menu.console.capture() as after:
            menu.email_engagement(rows)
        self.assertIn("delivered", after.get())

    def test_dry_run_from_the_wizard_calls_nothing(self):
        a, b = self.user("a"), self.user("b", push=False)
        fake = self.fake()
        template = render.Template(name="t", channel="both", title="Hi {first_name}", body="b", deeplink="nextvibe://home")
        plan = menu.Plan(name="c", wave=1, channel="both", include=["email"], exclude=[],
                         variants={"A": template}, split_a=1.0, share_label="all")
        plan.deliveries = menu.build_deliveries(plan, [a, b], set())
        with mock.patch("nvcli.send_push.requests.post") as expo, menu.console.capture():
            stats, email_run = menu.run_campaign(plan, dry=True)
        self.assertEqual((fake.calls, expo.call_count), ([], 0))
        self.assertEqual(sorted((r["username"], r["channel"], r["status"]) for r in log.read("c")),
                         [("a", "email", "dry"), ("a", "push", "dry"), ("b", "email", "dry")])
        self.assertEqual(stats[("email", "A")]["dry"], 2)
        self.assertEqual(email_run.counts(), Counter(dry=2))


class DjangoBackendTest(ResendTestCase):
    @override_settings(EMAIL_BACKEND="nvcli.email_backend.ResendBackend")
    def test_send_mail_goes_through_resend(self):
        fake = self.fake()
        msg = EmailMultiAlternatives(subject="Reset your password", body="plain body", to=["a@example.com"],
                                     reply_to=["help@nextvibe.io"], headers={"X-Thing": "1"})
        msg.attach_alternative("<p>html body</p>", "text/html")
        self.assertEqual(msg.send(), 1)
        call = fake.calls[0]
        self.assertEqual(call["url"], f"{API}/emails")
        self.assertEqual(call["json"], {"from": FROM, "to": ["a@example.com"], "subject": "Reset your password",
                                        "text": "plain body", "html": "<p>html body</p>",
                                        "reply_to": ["help@nextvibe.io"], "headers": {"X-Thing": "1"}})
        self.assertTrue(call["headers"]["Idempotency-Key"].startswith("django:"))

    @override_settings(EMAIL_BACKEND="nvcli.email_backend.ResendBackend")
    def test_errors_raise_unless_silenced(self):
        self.fake(UNVERIFIED)
        with self.assertRaises(ResendFailure) as cm:
            send_mail("s", "b", None, ["a@example.com"])
        self.assertIn("not verified", cm.exception.line)
        self.fake(UNVERIFIED)
        self.assertEqual(send_mail("s", "b", None, ["a@example.com"], fail_silently=True), 0)

    def test_it_is_the_configured_backend(self):
        import os

        from NextVibeAPI import settings as project_settings

        if "EMAIL_BACKEND" not in os.environ:
            self.assertEqual(project_settings.EMAIL_BACKEND, "nvcli.email_backend.ResendBackend")


class OptoutTest(ResendTestCase):
    def test_one_click_unsubscribe_post_needs_no_csrf_token(self):
        alice = self.user("alice")
        res = Client(enforce_csrf_checks=True).post(f"/u/e/{make_token(alice.user_id)}", data="List-Unsubscribe=One-Click",
                                                    content_type="application/x-www-form-urlencoded")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(log.read_optout()["email"], {alice.user_id})

    def test_wording_guard_on_what_is_sent(self):
        t = render.get_template("seeker-badge-email")
        ctx = {"first_name": "gusyk", "username": "gusyk", "unsubscribe": "https://api.nextvibe.io/u/e/T"}
        for template in (t, t.with_subject_b()):
            r = render.render(template, ctx)
            html, text = r.email_parts()
            self.assertEqual(render.wording_violations(" ".join((r.title, r.preheader, html, text))), [])
