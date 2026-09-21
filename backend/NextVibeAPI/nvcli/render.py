"""
Templates (YAML under nvcli/templates) and placeholder rendering.

Placeholders are ``{name}``. Per-user ones come from :func:`user_context`;
anything else has to be supplied by the caller (the wizard prompts for
them). Unresolved placeholders raise :class:`UnresolvedPlaceholder` — the
send is blocked, never a half-rendered message.

Email templates come in two shapes. A full one carries its own `html`
(inline CSS, sent as-is) and `text` part plus `subject`, optional
`subject_b` (the A/B subject), `preheader`, `link`, `from` and `reply_to`;
in those, ``{link}`` and ``{preheader}`` are the template's own rendered
values and ``{unsubscribe}`` the user's opt-out link. A short one (`title`
+ `body`, or written in the console) is wrapped in email/base.html.
"""
import html as html_lib
import re
from dataclasses import dataclass, field, replace
from pathlib import Path

import yaml

from nvcli import EMAIL_TEMPLATES_DIR, TEMPLATES_DIR

PLACEHOLDER_RE = re.compile(r"\{([a-z_][a-z0-9_]*)\}")
USER_PLACEHOLDERS = ("username", "first_name", "rep", "joined", "events", "met", "seeker", "seeker_total", "unsubscribe")
# Filled from the template itself, never asked for.
TEMPLATE_PLACEHOLDERS = ("link", "preheader")
CHANNELS = ("push", "email", "both")
APP_SCHEME = "nextvibe://"

# Words that never appear in user-facing copy (hackathon rule); the guard
# test fails on any template containing them, the wizard warns on ad-hoc text.
FORBIDDEN_WORDS = ("reward", "earn", "farm", "points for")
FORBIDDEN_RE = re.compile(r"\b(?:" + "|".join(re.escape(w) for w in FORBIDDEN_WORDS) + r")\w*", re.IGNORECASE)
FORBIDDEN_CASE_RE = re.compile(r"\bSKR\b")


class UnresolvedPlaceholder(ValueError):
    def __init__(self, names):
        self.names = sorted(set(names))
        super().__init__("unresolved placeholders: " + ", ".join("{%s}" % n for n in self.names))


class TemplateError(ValueError):
    pass


@dataclass
class Template:
    name: str
    channel: str
    title: str                  # push title / email subject
    body: str                   # push body / email plain-text part
    deeplink: str | None = None  # push deep link / email `link`
    data: dict = field(default_factory=dict)
    cta_label: str | None = None
    path: Path | None = None
    # email only
    subject_b: str | None = None
    preheader: str | None = None
    html: str | None = None
    sender: str | None = None    # YAML `from`
    reply_to: str | None = None

    def placeholders(self) -> set[str]:
        parts = (self.title, self.body, self.deeplink, self.subject_b, self.preheader, self.html)
        return set().union(*(find_placeholders(p) for p in parts))

    def extra_placeholders(self) -> set[str]:
        return self.placeholders() - set(USER_PLACEHOLDERS) - set(TEMPLATE_PLACEHOLDERS)

    def with_subject_b(self) -> "Template":
        """Variant B of an A/B subject test: the same email under `subject_b`."""
        return replace(self, name=f"{self.name} (subject B)", title=self.subject_b, subject_b=None)

    def to_yaml(self) -> str:
        email = self.html is not None
        doc = {"name": self.name, "channel": self.channel}
        if self.sender:
            doc["from"] = self.sender
        if self.reply_to:
            doc["reply_to"] = self.reply_to
        doc["subject" if email else "title"] = self.title
        if self.subject_b:
            doc["subject_b"] = self.subject_b
        if self.preheader:
            doc["preheader"] = self.preheader
        if self.deeplink:
            doc["link" if email else "deeplink"] = self.deeplink
        doc["text" if email else "body"] = self.body
        if email:
            doc["html"] = self.html
        if self.data:
            doc["data"] = dict(self.data)
        if self.cta_label:
            doc["cta_label"] = self.cta_label
        return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=1000)

    @classmethod
    def from_yaml(cls, path: Path) -> "Template":
        try:
            doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            raise TemplateError(f"{path.name}: {e}") from e
        title = doc.get("title") or doc.get("subject")
        body = doc.get("body") or doc.get("text")
        for key, value in (("name", doc.get("name")), ("channel", doc.get("channel")),
                           ("title' or 'subject", title), ("body' or 'text", body)):
            if not value:
                raise TemplateError(f"{path.name}: missing '{key}'")
        if doc["channel"] not in CHANNELS:
            raise TemplateError(f"{path.name}: channel must be one of {CHANNELS}")
        data = doc.get("data") or {}
        if not isinstance(data, dict):
            raise TemplateError(f"{path.name}: 'data' must be a mapping")
        html = doc.get("html") or None
        if html is not None:
            if doc["channel"] != "email":
                raise TemplateError(f"{path.name}: an 'html' template must be channel: email")
            for part, text in (("html", html), ("text", body)):
                if "{unsubscribe}" not in str(text):
                    raise TemplateError(f"{path.name}: '{part}' needs an {{unsubscribe}} link")
        return cls(
            name=str(doc["name"]), channel=doc["channel"], title=str(title).strip(),
            body=str(body).strip(), deeplink=(doc.get("deeplink") or doc.get("link") or None),
            data=data, cta_label=doc.get("cta_label"), path=path,
            subject_b=doc.get("subject_b") or None, preheader=doc.get("preheader") or None,
            html=str(html) if html is not None else None,
            sender=doc.get("from") or None, reply_to=doc.get("reply_to") or None,
        )


@dataclass
class Rendered:
    """Exactly what goes on the wire: render once, send the rendered string."""
    title: str
    body: str
    deeplink: str | None
    data: dict
    channel: str
    template: str
    # email
    html: str | None = None
    preheader: str | None = None
    sender: str | None = None
    reply_to: str | None = None
    unsubscribe: str | None = None
    cta_label: str | None = None

    def email_parts(self) -> tuple[str, str]:
        """(html, text) as sent: the template's own html as-is, or the body wrapped in base.html."""
        if self.html is not None:
            return self.html, self.body
        url = self.unsubscribe or ""
        return email_html(self, url, self.cta_label), email_text(self, url)

    def push_data(self, campaign: str | None = None, variant: str | None = None, wave: int | None = None) -> dict:
        data = dict(self.data)
        internal, external = app_path(self.deeplink)
        if internal:
            data["url"] = internal
        if external:
            data["external_url"] = external
        if self.deeplink:
            data["deeplink"] = self.deeplink
        if campaign:
            data.update({"campaign": campaign, "variant": variant or "A", "wave": wave or 1})
        return data


# ── template files ─────────────────────────────────────────────────────

def template_path(name: str) -> Path:
    return TEMPLATES_DIR / f"{name}.yaml"


def load_templates() -> dict[str, Template]:
    out: dict[str, Template] = {}
    for path in sorted(TEMPLATES_DIR.glob("*.yaml")):
        t = Template.from_yaml(path)
        out[t.name] = t
    return out


def get_template(name: str) -> Template:
    templates = load_templates()
    if name not in templates:
        raise TemplateError(f"no template named {name!r}")
    return templates[name]


def save_template(t: Template) -> Path:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    path = template_path(t.name)
    path.write_text(t.to_yaml(), encoding="utf-8")
    t.path = path
    return path


# ── placeholders ───────────────────────────────────────────────────────

def find_placeholders(text: str | None) -> set[str]:
    return set(PLACEHOLDER_RE.findall(text or ""))


def first_name(username: str) -> str:
    """'danklepar.skr' → 'danklepar', 'vibe_B8KkPq.lzr' → 'vibe'."""
    name = username or ""
    head, dot, tail = name.rpartition(".")
    if dot and 1 <= len(tail) <= 4:
        name = head
    for sep in ("_", ".", "-"):
        name = name.split(sep, 1)[0] if name.split(sep, 1)[0] else name
    return name or username


def seeker_label(user) -> str:
    if not getattr(user, "seeker_verified", False):
        return "no"
    return ".skr" if user.seeker_verified_source == "skr" else "on-chain"


def unsubscribe_url(user_id: int) -> str:
    """The user's email opt-out link. It stays on the API host: the app claims
    every nextvibe.io path (iOS "*", Android /u/*, and /u/e is the tap link),
    so a nextvibe.io link would open the app instead of this page."""
    from django.conf import settings
    from user.views_pac.optout import make_token

    return f"{settings.PUBLIC_API_URL.rstrip('/')}/u/e/{make_token(user_id)}"


def user_context(user, seeker_total: int | None = None) -> dict:
    from nvcli import audience

    stats = audience.user_stats(user)
    return {
        "username": user.username,
        "first_name": first_name(user.username),
        "rep": stats["rep"],
        "joined": stats["joined"].strftime("%b %Y") if stats["joined"] else "",
        "events": stats["events"],
        "met": stats["met"],
        "seeker": seeker_label(user),
        "seeker_total": audience.seeker_total() if seeker_total is None else seeker_total,
        "unsubscribe": unsubscribe_url(user.user_id),
    }


def render_text(text: str, ctx: dict, escape: bool = False) -> str:
    """Fill placeholders; `escape` HTML-escapes the values (for the html part)."""
    missing = [n for n in find_placeholders(text) if n not in ctx or ctx[n] is None]
    if missing:
        raise UnresolvedPlaceholder(missing)
    value = (lambda v: html_lib.escape(str(v), quote=True)) if escape else str
    return PLACEHOLDER_RE.sub(lambda m: value(ctx[m.group(1)]), text or "")


def render(template: Template, ctx: dict) -> Rendered:
    link = render_text(template.deeplink, ctx) if template.deeplink else None
    preheader = render_text(template.preheader, ctx) if template.preheader else None
    full = {**ctx, "link": link, "preheader": preheader}
    return Rendered(
        title=render_text(template.title, full),
        body=render_text(template.body, full),
        deeplink=link,
        data={k: render_text(str(v), full) if isinstance(v, str) else v for k, v in template.data.items()},
        channel=template.channel,
        template=template.name,
        html=render_text(template.html, full, escape=True) if template.html is not None else None,
        preheader=preheader,
        sender=template.sender,
        reply_to=template.reply_to,
        unsubscribe=ctx.get("unsubscribe"),
        cta_label=template.cta_label,
    )


def wording_violations(text: str) -> list[str]:
    found = [m.group(0) for m in FORBIDDEN_RE.finditer(text or "")]
    found += FORBIDDEN_CASE_RE.findall(text or "")
    return found


# ── deep links ─────────────────────────────────────────────────────────

# Events are posts in the app; keep the template wording ("event/<id>")
# and map it to the route that exists.
_ALIASES = (
    (re.compile(r"^event/(\d+)$"), r"/post-details?id=\1"),
    (re.compile(r"^profile/([^/?]+)$"), r"/u/verified/\1"),
)


def app_path(deeplink: str | None) -> tuple[str | None, str | None]:
    """(internal router path, external url) for push `data`."""
    if not deeplink:
        return None, None
    link = deeplink.strip()
    if link.startswith(APP_SCHEME):
        rest = link[len(APP_SCHEME):]
        for pattern, repl in _ALIASES:
            if pattern.match(rest):
                return pattern.sub(repl, rest), None
        return "/" + rest.lstrip("/"), None
    if link.startswith("/"):
        return link, None
    return None, link  # https://…, solanadappstore://…


# ── email ──────────────────────────────────────────────────────────────

def _paragraphs(body: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]


def email_html(rendered: Rendered, unsubscribe_url: str, cta_label: str | None = None) -> str:
    base = (EMAIL_TEMPLATES_DIR / "base.html").read_text(encoding="utf-8")
    paragraphs = "".join(
        '<p style="margin:0 0 16px 0;font-size:16px;line-height:25px;color:#CDCAD9;">%s</p>'
        % html_lib.escape(p).replace("\n", "<br>")
        for p in _paragraphs(rendered.body)
    )
    _, external = app_path(rendered.deeplink)
    cta_url = external or ""
    cta = ""
    if cta_url:
        cta = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 4px 0;"><tr>'
            '<td bgcolor="#7C3AED" style="background-color:#7C3AED;border-radius:12px;">'
            '<a href="%s" style="display:inline-block;padding:14px 26px;font-size:15px;line-height:20px;'
            'font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px;">%s</a></td></tr></table>'
            % (html_lib.escape(cta_url, quote=True), html_lib.escape(cta_label or "Open NextVibe"))
        )
    return (
        base.replace("{{title}}", html_lib.escape(rendered.title))
        .replace("{{preheader}}", html_lib.escape(rendered.preheader or ""))
        .replace("{{paragraphs}}", paragraphs)
        .replace("{{cta}}", cta)
        .replace("{{unsubscribe_url}}", html_lib.escape(unsubscribe_url, quote=True))
    )


def email_text(rendered: Rendered, unsubscribe_url: str) -> str:
    _, external = app_path(rendered.deeplink)
    parts = [rendered.title, "", rendered.body]
    if external:
        parts += ["", external]
    parts += ["", "—", f"Unsubscribe: {unsubscribe_url}"]
    return "\n".join(parts)
