import re
import tempfile
from pathlib import Path
from unittest import mock

from nvcli import TEMPLATES_DIR, render
from nvcli.render import Template, UnresolvedPlaceholder
from nvcli.tests._base import NvTestCase

SHIPPED = {"seeker-badge", "seeker-badge-b", "seeker-badge-email", "tap-to-meet", "free-collect", "update-required", "event-invite"}


class TemplateFilesTest(NvTestCase):
    def test_shipped_templates_load(self):
        templates = render.load_templates()
        self.assertTrue(SHIPPED <= set(templates))
        for t in templates.values():
            self.assertIn(t.channel, render.CHANNELS)
            self.assertTrue(t.title and t.body)

    def test_wording_guard(self):
        """No template may contain reward / earn / SKR / farm / points for."""
        offenders = {}
        for path in TEMPLATES_DIR.glob("*.yaml"):
            found = render.wording_violations(path.read_text(encoding="utf-8"))
            if found:
                offenders[path.name] = found
        for path in (TEMPLATES_DIR / "email").glob("*.html"):
            found = render.wording_violations(path.read_text(encoding="utf-8"))
            if found:
                offenders[path.name] = found
        self.assertEqual(offenders, {})

    def test_wording_violations_detector(self):
        self.assertEqual(render.wording_violations("Learn to tap. Confirmed."), [])
        self.assertEqual(sorted(render.wording_violations("Earn rewards, farm SKR, points for taps")),
                         ["Earn", "SKR", "farm", "points for", "rewards"])

    def test_every_template_renders_for_a_user(self):
        user = self.user("danklepar.skr", seeker=True, source="skr")
        ctx = {**render.user_context(user), "event": "Solana Meetup", "date": "Fri Sep 25, 19:00", "id": "42"}
        for t in render.load_templates().values():
            r = render.render(t, ctx)
            self.assertNotIn("{", r.title + r.body, t.name)
            self.assertNotIn("{", r.deeplink or "", t.name)

    def test_save_and_reload_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(render, "TEMPLATES_DIR", Path(tmp)):
            t = Template(name="hello", channel="push", title="Hi {first_name}", body="Line one\n\nLine two",
                         deeplink="nextvibe://home", data={"type": "hello"})
            path = render.save_template(t)
            self.assertEqual(path.name, "hello.yaml")
            loaded = render.get_template("hello")
            self.assertEqual((loaded.title, loaded.body, loaded.deeplink, loaded.data), (t.title, t.body, t.deeplink, t.data))
            self.assertEqual(loaded.placeholders(), {"first_name"})

    def test_bad_template_files_raise(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(render, "TEMPLATES_DIR", Path(tmp)):
            (Path(tmp) / "x.yaml").write_text("name: x\nchannel: sms\ntitle: t\nbody: b\n")
            with self.assertRaises(render.TemplateError):
                render.load_templates()


class RenderTest(NvTestCase):
    def test_user_context_and_first_name(self):
        user = self.user("vibe_B8KkPq.lzr", seeker=True, source="onchain")
        ctx = render.user_context(user, seeker_total=415)
        self.assertEqual(ctx["username"], "vibe_B8KkPq.lzr")
        self.assertEqual(ctx["first_name"], "vibe")
        self.assertEqual(ctx["seeker"], "on-chain")
        self.assertEqual(ctx["seeker_total"], 415)
        self.assertEqual((ctx["rep"], ctx["events"], ctx["met"]), (0, 0, 0))
        self.assertRegex(ctx["joined"], r"^[A-Z][a-z]{2} \d{4}$")
        self.assertEqual(render.first_name("danklepar.skr"), "danklepar")
        self.assertEqual(render.first_name("plain"), "plain")
        self.assertEqual(render.first_name("john.doe.eth"), "john")

    def test_unresolved_placeholder_blocks(self):
        t = Template(name="x", channel="push", title="Hi {first_name}", body="See {event} on {date}")
        self.assertEqual(t.extra_placeholders(), {"event", "date"})
        with self.assertRaises(UnresolvedPlaceholder) as cm:
            render.render(t, {"first_name": "a", "event": "e"})
        self.assertEqual(cm.exception.names, ["date"])
        self.assertIn("{date}", str(cm.exception))

    def test_render_substitutes_everywhere_including_data(self):
        t = Template(name="x", channel="push", title="{event}", body="{event} is on {date}",
                     deeplink="nextvibe://event/{id}", data={"type": "event_invite", "post_id": "{id}", "n": 3})
        r = render.render(t, {"event": "Meetup", "date": "Fri", "id": "7"})
        self.assertEqual((r.title, r.body, r.deeplink), ("Meetup", "Meetup is on Fri", "nextvibe://event/7"))
        self.assertEqual(r.data, {"type": "event_invite", "post_id": "7", "n": 3})

    def test_push_data_carries_campaign_and_deep_link(self):
        t = render.get_template("seeker-badge")
        r = render.render(t, {"first_name": "gusyk"})
        data = r.push_data("sep20-seeker", "B", 2)
        self.assertEqual(data["type"], "seeker_verified")
        self.assertEqual((data["campaign"], data["variant"], data["wave"]), ("sep20-seeker", "B", 2))
        self.assertEqual(data["url"], "/profile?open=seeker")
        self.assertEqual(data["deeplink"], "nextvibe://profile?open=seeker")
        self.assertNotIn("external_url", data)

    def test_app_path_mapping(self):
        self.assertEqual(render.app_path("nextvibe://profile?open=seeker"), ("/profile?open=seeker", None))
        self.assertEqual(render.app_path("nextvibe://event/12"), ("/post-details?id=12", None))
        self.assertEqual(render.app_path("nextvibe://profile/gusyk"), ("/u/verified/gusyk", None))
        self.assertEqual(render.app_path("/(tabs)/profile"), ("/(tabs)/profile", None))
        self.assertEqual(render.app_path("solanadappstore://details?id=com.nextvibe.app"),
                         (None, "solanadappstore://details?id=com.nextvibe.app"))
        self.assertEqual(render.app_path("https://nextvibe.io/u/verified/a"), (None, "https://nextvibe.io/u/verified/a"))
        self.assertEqual(render.app_path(None), (None, None))

    def test_email_html_and_text(self):
        t = render.get_template("seeker-badge-email")
        r = render.render(t, {"first_name": "gusyk", "username": "gusyk"})
        html = render.email_html(r, "https://api.nextvibe.io/u/e/TOKEN", cta_label=t.cta_label)
        self.assertIn("<!doctype html>", html.lower())
        self.assertIn("https://api.nextvibe.io/u/e/TOKEN", html)
        self.assertIn("https://nextvibe.io/u/verified/gusyk", html)
        self.assertIn("See your badge", html)
        self.assertEqual(html.count("font-size:16px;line-height:24px"), 3)  # three body paragraphs
        self.assertNotIn("{{", html)
        text = render.email_text(r, "https://api.nextvibe.io/u/e/TOKEN")
        self.assertTrue(text.startswith(r.title))
        self.assertIn("Unsubscribe: https://api.nextvibe.io/u/e/TOKEN", text)

    def test_email_html_escapes_user_text(self):
        t = Template(name="x", channel="email", title="<b>{first_name}</b>", body="a & b")
        html = render.email_html(render.render(t, {"first_name": "<script>"}), "https://x/u")
        self.assertIn("&lt;b&gt;&lt;script&gt;&lt;/b&gt;", html)
        self.assertIn("a &amp; b", html)
        self.assertNotIn("<script>", html)
