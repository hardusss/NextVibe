"""
Templates (YAML under nvcli/templates) and placeholder rendering.

Placeholders are ``{name}``. Per-user ones come from :func:`user_context`;
anything else has to be supplied by the caller (the wizard prompts for
them). Unresolved placeholders raise :class:`UnresolvedPlaceholder` — the
send is blocked, never a half-rendered message.
"""
import html as html_lib
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from nvcli import EMAIL_TEMPLATES_DIR, TEMPLATES_DIR

PLACEHOLDER_RE = re.compile(r"\{([a-z_][a-z0-9_]*)\}")
USER_PLACEHOLDERS = ("username", "first_name", "rep", "joined", "events", "met", "seeker", "seeker_total")
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
    title: str
    body: str
    deeplink: str | None = None
    data: dict = field(default_factory=dict)
    cta_label: str | None = None
    path: Path | None = None

    def placeholders(self) -> set[str]:
        return find_placeholders(self.title) | find_placeholders(self.body) | find_placeholders(self.deeplink or "")

    def extra_placeholders(self) -> set[str]:
        return self.placeholders() - set(USER_PLACEHOLDERS)

    def to_yaml(self) -> str:
        doc = {"name": self.name, "channel": self.channel, "title": self.title, "body": self.body}
        if self.deeplink:
            doc["deeplink"] = self.deeplink
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
        for key in ("name", "channel", "title", "body"):
            if not doc.get(key):
                raise TemplateError(f"{path.name}: missing '{key}'")
        if doc["channel"] not in CHANNELS:
            raise TemplateError(f"{path.name}: channel must be one of {CHANNELS}")
        data = doc.get("data") or {}
        if not isinstance(data, dict):
            raise TemplateError(f"{path.name}: 'data' must be a mapping")
        return cls(
            name=str(doc["name"]), channel=doc["channel"], title=str(doc["title"]).strip(),
            body=str(doc["body"]).strip(), deeplink=(doc.get("deeplink") or None),
            data=data, cta_label=doc.get("cta_label"), path=path,
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
    }


def render_text(text: str, ctx: dict) -> str:
    missing = [n for n in find_placeholders(text) if n not in ctx or ctx[n] is None]
    if missing:
        raise UnresolvedPlaceholder(missing)
    return PLACEHOLDER_RE.sub(lambda m: str(ctx[m.group(1)]), text or "")


def render(template: Template, ctx: dict) -> Rendered:
    return Rendered(
        title=render_text(template.title, ctx),
        body=render_text(template.body, ctx),
        deeplink=render_text(template.deeplink, ctx) if template.deeplink else None,
        data={k: render_text(str(v), ctx) if isinstance(v, str) else v for k, v in template.data.items()},
        channel=template.channel,
        template=template.name,
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
        '<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#2b2140;">%s</p>'
        % html_lib.escape(p).replace("\n", "<br>")
        for p in _paragraphs(rendered.body)
    )
    _, external = app_path(rendered.deeplink)
    cta_url = external or ""
    cta = ""
    if cta_url:
        cta = (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px 0;"><tr>'
            '<td style="border-radius:12px;background:#7c3aed;">'
            '<a href="%s" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;'
            'color:#ffffff;text-decoration:none;border-radius:12px;">%s</a></td></tr></table>'
            % (html_lib.escape(cta_url, quote=True), html_lib.escape(cta_label or "Open NextVibe"))
        )
    return (
        base.replace("{{title}}", html_lib.escape(rendered.title))
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
