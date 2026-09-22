"""
Proof of Meet card: the image behind nextvibe.io/u/meet/<slug>.

Two sizes with the same content: "og" 1200×630 (X and link previews) and
"story" 1080×1350 (saved image, stories), which stacks it vertically.
Rendered once per version and stored as og/meets/<slug>-<variant>-v<version>.png.
The version hashes everything drawn, so a new avatar, a username change or
a minted asset id re-renders by itself. Bump MEET_DESIGN_VERSION when the
layout changes.

Colors: bg #0B0714, surface #160F26, accent #8B5CF6, teal #2DD4BF,
text #F4F1FA, muted #6E6684. No gradients except the avatar rings (and the
default avatar, a dark gradient with the initial). Shared drawing helpers
(fonts and fallback, masks, badges, storage): user/src/og_image.py.
"""
import math
from dataclasses import dataclass
from datetime import timezone as dt_timezone
from functools import lru_cache

from django.conf import settings
from PIL import Image, ImageChops, ImageDraw

from posts.src.meets import TIER_IN_PERSON
from user.src import og_image as og

MEET_DESIGN_VERSION = 1
VARIANTS = {"og": (1200, 630), "story": (1080, 1350)}
NAME_LIMIT = 18  # usernames past this get an ellipsis when the headline can't fit them

BG = (11, 7, 20)
SURFACE = (22, 15, 38)
ACCENT = (139, 92, 246)
TEAL = (45, 212, 191)
TEXT = (244, 241, 250)
MUTED = (110, 102, 132)
INITIAL_TOP = (52, 34, 92)  # default avatar: deep violet → surface


# ── What's drawn ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CardText:
    """Everything on the card except the avatar pixels (see card_text)."""
    tier: str
    tier_label: str
    a: str
    b: str
    a_seeker: bool
    b_seeker: bool
    when_line: str
    event_name: str | None
    lead: str  # "+1 REP each" / "3rd time meeting @toji"
    detail: str  # "#14 for @a · #1 for @b" / "first: Sep 21"
    proof: str  # "recorded on NextVibe" / "verified on Solana · 8xK…3fQ"
    minted: bool
    url_line: str


def short_name(username: str, limit: int = NAME_LIMIT) -> str:
    return username if len(username) <= limit else username[:limit - 1] + "…"


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def local_time(meet, when=None):
    return (when or meet.met_at).astimezone(meet.tz or dt_timezone.utc)


def when_line(meet) -> str:
    local = local_time(meet)
    stamp = f"{local:%a}, {local:%b} {local.day} · {local:%H:%M}"
    if meet.tz is None:
        stamp += " UTC"
    return f"{meet.city or 'In person'} · {stamp}"


def rep_part(a_points, b_points) -> str:
    if a_points and b_points:
        return f"+{a_points} REP each" if a_points == b_points else f"+{a_points} & +{b_points} REP"
    points = a_points or b_points
    return f"+{points} REP" if points else ""


def history_parts(meet):
    """(lead, detail): the first-meeting REP line, or the pair's history."""
    a, b = meet.people
    if meet.pair_count > 1:
        first = local_time(meet, meet.pair_first_at)
        return (f"{ordinal(meet.pair_count)} time meeting @{short_name(b.username)}",
                f"first: {first:%b} {first.day}")
    detail = f"#{a.number} for @{short_name(a.username)} · #{b.number} for @{short_name(b.username)}"
    return rep_part(a.points, b.points), detail


def short_asset(asset_id: str) -> str:
    return f"{asset_id[:3]}…{asset_id[-3:]}" if len(asset_id) > 8 else asset_id


def proof_text(meet) -> str:
    if meet.asset_id:
        return f"verified on Solana · {short_asset(meet.asset_id)}"
    return "recorded on NextVibe"


def card_text(meet) -> CardText:
    a, b = meet.people
    lead, detail = history_parts(meet)
    return CardText(
        tier=meet.tier,
        tier_label=meet.tier_label,
        a=a.username,
        b=b.username,
        a_seeker=a.seeker,
        b_seeker=b.seeker,
        when_line=when_line(meet),
        event_name=meet.event_name,
        lead=lead,
        detail=detail,
        proof=proof_text(meet),
        minted=bool(meet.asset_id),
        url_line=meet.url.split("://", 1)[1],
    )


def card_version(meet) -> str:
    text = card_text(meet)
    a, b = meet.people
    return og.version_hash(
        MEET_DESIGN_VERSION, meet.slug, *(getattr(text, f) for f in CardText.__dataclass_fields__),
        a.avatar_name, b.avatar_name,
    )


def card_url(slug: str, variant: str, version: str) -> str:
    return f"{settings.PUBLIC_API_URL}/api/v1/meet/{slug}/card.png?v={variant}&rev={version}"


def get_card_png(meet, variant: str):
    """(png_bytes, version); the first request for a version renders and stores it."""
    version = card_version(meet)
    context = f"meet {meet.slug}"

    def render():
        a, b = meet.people
        avatars = [og.load_image(p.avatar_name, context, max_side=512) if p.avatar_name else None for p in (a, b)]
        return render_card(card_text(meet), avatars, variant)

    return og.stored_png(f"og/meets/{meet.slug}-{variant}-v{version}.png", render, context), version


# ── Rendering ────────────────────────────────────────────────────────────

def render_card(text: CardText, avatars, variant: str = "og") -> bytes:
    if variant == "story":
        return og.png_bytes(_render_story(text, avatars))
    return og.png_bytes(_render_og(text, avatars))


def _render_og(t: CardText, avatars):
    width, height = VARIANTS["og"]
    canvas = Image.new("RGB", (width, height), BG)
    margin = 64
    max_width = width - 2 * margin

    _wordmark(canvas, margin, 60, mark=40, size=28)
    _tier_chip(canvas, width - margin, 60, t.tier_label, t.tier != TIER_IN_PERSON, size=19)

    rows = [
        (_headline(t, max_width, range(56, 39, -2)), 74),
        (_single(t.when_line, max_width, (28, 26, 24, 22), TEXT + (225,)), 44),
    ]
    if t.event_name:
        rows.append((_event_runs(t.event_name, max_width, (26, 24, 22)), 40))
    rows.append((_history_runs(t.lead, t.detail, max_width, (25, 24, 22, 20)), 50))
    rows.append((_proof_runs(t, (21, 20, 19), max_width), 36))

    pair = dict(size=132, ring=5, gap=4, check=46, cut=6)
    _compose(canvas, t, avatars, rows, pair, globe=(136, 2), area=(96, height - 66), gap=46)
    _footer_url(canvas, margin, height - 38, t.url_line, 20)
    return canvas


def _render_story(t: CardText, avatars):
    width, height = VARIANTS["story"]
    canvas = Image.new("RGB", (width, height), BG)
    margin = 72
    max_width = width - 2 * margin

    _wordmark(canvas, margin, 100, mark=54, size=38)
    _tier_chip(canvas, width - margin, 100, t.tier_label, t.tier != TIER_IN_PERSON, size=25)

    name_a, name_b = _stacked_names(t, max_width, range(76, 47, -2))
    rows = [
        (name_a, 86),
        ([_Text("met", og.font(og.FONT_VARIABLE, 42, 500), MUTED)], 58),
        (name_b, 86),
        ([], 30),
        (_single(t.when_line, max_width, (36, 34, 32, 30, 28), TEXT + (225,)), 52),
    ]
    if t.event_name:
        rows.append((_event_runs(t.event_name, max_width, (32, 30, 28, 26)), 48))
    rows.append(([], 26))
    if t.lead:
        rows.append((_single(t.lead, max_width, (38, 36, 34, 32), ACCENT, bold=True), 54))
    rows.append((_single(t.detail, max_width, (32, 30, 28, 26), TEXT + (205,)), 48))
    rows.append(([], 22))
    rows.append((_proof_runs(t, (28, 26, 24), max_width), 44))

    pair = dict(size=244, ring=8, gap=7, check=80, cut=10)
    _compose(canvas, t, avatars, rows, pair, globe=(250, 3), area=(150, height - 100), gap=110)
    _footer_url(canvas, margin, height - 56, t.url_line, 27)
    return canvas


def _compose(canvas, t, avatars, rows, pair, globe, area, gap):
    """Avatar pair (with the globe behind it) above the text rows, the whole block centered in `area`."""
    width = canvas.size[0]
    outer = pair["size"] + 2 * (pair["ring"] + pair["gap"])
    text_height = sum(h for _, h in rows)
    top, bottom = area
    y = top + max(0, (bottom - top - (outer + gap + text_height)) // 2)
    center = (width // 2, y + outer // 2)
    radius, stroke = globe
    _globe(canvas, center, radius=radius, stroke=stroke)
    _avatar_pair(canvas, center, avatars=avatars, names=(t.a, t.b), **pair)
    y += outer + gap
    for runs, h in rows:
        if runs:
            _draw_runs(canvas, runs, width // 2, y + h // 2)
        y += h


@lru_cache(maxsize=2)
def not_found_png(variant: str = "og") -> bytes:
    """Neutral card for unknown or unavailable meets (same size as asked for)."""
    width, height = VARIANTS.get(variant, VARIANTS["og"])
    story = variant == "story"
    canvas = Image.new("RGB", (width, height), BG)
    margin = 72 if story else 64
    _wordmark(canvas, margin, 104 if story else 62, mark=54 if story else 40, size=38 if story else 28)
    center = (width // 2, height // 2 - (40 if story else 30))
    _globe(canvas, center, radius=330 if story else 170, stroke=3 if story else 2)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.text(center, "Proof of Meet", font=og.font(og.FONT_BOLD, 64 if story else 52), fill=TEXT, anchor="mm")
    draw.text((center[0], center[1] + (70 if story else 56)), "This card isn't available",
              font=og.font(og.FONT_VARIABLE, 34 if story else 28, 500), fill=MUTED, anchor="mm")
    _footer_url(canvas, margin, height - (56 if story else 38), "nextvibe.io", 27 if story else 20)
    return og.png_bytes(canvas)


# ── Text runs: one centered line made of differently styled pieces ───────

@dataclass
class _Text:
    text: str
    face: object
    fill: tuple

    def width(self):
        return self.face.getlength(self.text)


@dataclass
class _Badge:
    size: int

    def width(self):
        return self.size


@dataclass
class _Gap:
    px: int

    def width(self):
        return self.px


def _runs_width(runs):
    return sum(r.width() for r in runs)


def _draw_runs(canvas, runs, center_x, center_y):
    draw = ImageDraw.Draw(canvas, "RGBA")
    x = center_x - _runs_width(runs) / 2
    for run in runs:
        if isinstance(run, _Text):
            draw.text((x, center_y), run.text, font=run.face, fill=run.fill, anchor="lm")
        elif isinstance(run, _Badge):
            og.paste_seeker_badge(canvas, (round(x), round(center_y - run.size / 2)), run.size)
        x += run.width()


def _name_runs(name, seeker, size):
    style, shown = og.text_style(f"@{name}", bold=True)
    runs = [_Text(shown, style.at(size), TEXT)]
    if seeker:
        runs += [_Gap(round(size * 0.2)), _Badge(round(size * 0.74))]
    return runs


def _headline_runs(a, b, t, size):
    return _name_runs(a, t.a_seeker, size) + [
        _Text(" met ", og.font(og.FONT_VARIABLE, size, 500), MUTED),
    ] + _name_runs(b, t.b_seeker, size)


def _trim(name):
    base = name[:-1] if name.endswith("…") else name
    return base[:-1] + "…" if len(base) > 1 else name


def _headline(t, max_width, sizes):
    """
    "@a met @b" on one line: largest size that fits (56→40px on og), then
    usernames cut to 18 characters, then shortened further if a wide script
    still doesn't fit.
    """
    sizes = list(sizes)
    for a, b in ((t.a, t.b), (short_name(t.a), short_name(t.b))):
        for size in sizes:
            runs = _headline_runs(a, b, t, size)
            if _runs_width(runs) <= max_width:
                return runs
    a, b = short_name(t.a), short_name(t.b)
    while True:
        runs = _headline_runs(a, b, t, sizes[-1])
        if _runs_width(runs) <= max_width or (len(a) <= 2 and len(b) <= 2):
            return runs
        if len(a) >= len(b):
            a = _trim(a)
        else:
            b = _trim(b)


def _stacked_names(t, max_width, sizes):
    """Story: "@a" and "@b" on their own lines, at one shared size."""
    sizes = list(sizes)

    def fitted(name, seeker):
        for candidate in (name, short_name(name)):
            for size in sizes:
                if _runs_width(_name_runs(candidate, seeker, size)) <= max_width:
                    return candidate, size
        candidate = short_name(name)
        while len(candidate) > 2 and _runs_width(_name_runs(candidate, seeker, sizes[-1])) > max_width:
            candidate = _trim(candidate)
        return candidate, sizes[-1]

    (a, size_a), (b, size_b) = fitted(t.a, t.a_seeker), fitted(t.b, t.b_seeker)
    size = min(size_a, size_b)
    return _name_runs(a, t.a_seeker, size), _name_runs(b, t.b_seeker, size)


def _single(text, max_width, sizes, fill, bold=False):
    face, shown, _ = og.fit_line(text, max_width, sizes, bold=bold)
    return [_Text(shown, face, fill)]


def _event_runs(event_name, max_width, sizes):
    sizes = list(sizes)
    for size in sizes:
        prefix = _Text("at ", og.font(og.FONT_VARIABLE, size, 500), MUTED)
        face, shown, _ = og.fit_line(event_name, max_width - prefix.width(), [size], bold=True)
        if shown == event_name or size == sizes[-1]:
            return [prefix, _Text(shown, face, TEXT)]


def _history_runs(lead, detail, max_width, sizes):
    """og: "+1 REP each · #14 for @a · #1 for @b" on one line, shrinking to fit."""
    sizes = list(sizes)
    for size in sizes:
        runs = []
        if lead:
            runs.append(_Text(lead, og.font(og.FONT_BOLD, size), ACCENT))
            runs.append(_Text("  ·  ", og.font(og.FONT_VARIABLE, size, 500), MUTED))
        runs.append(_Text(detail, og.text_style(detail, bold=False)[0].at(size), TEXT + (205,)))
        if _runs_width(runs) <= max_width or size == sizes[-1]:
            if _runs_width(runs) > max_width:
                budget = max_width - _runs_width(runs[:-1])
                face, shown, _ = og.fit_line(detail, budget, [size], bold=False)
                runs[-1] = _Text(shown, face, TEXT + (205,))
            return runs


def _proof_runs(t, sizes, max_width):
    size = sizes[0]
    for size in sizes:
        runs = [
            _Text("Proof of Meet", og.font(og.FONT_BOLD, size), TEAL if t.minted else TEXT),
            _Text(f"  ·  {t.proof}", og.font(og.FONT_VARIABLE, size, 500), MUTED),
        ]
        if _runs_width(runs) <= max_width:
            break
    return runs


# ── Pieces ───────────────────────────────────────────────────────────────

def _wordmark(canvas, x, center_y, mark, size):
    """NextVibe mark + name, left-aligned at x."""
    icon = Image.open(og.BRAND_MARK).convert("RGBA").resize((mark, mark), Image.LANCZOS)
    canvas.paste(icon, (x, center_y - mark // 2), icon)
    ImageDraw.Draw(canvas, "RGBA").text(
        (x + mark + round(mark * 0.28), center_y), "NextVibe", font=og.font(og.FONT_BOLD, size), fill=TEXT, anchor="lm",
    )


def _tier_chip(canvas, right_x, center_y, label, verified, size):
    """Pill with spaced capitals, right-aligned: teal when verified, violet otherwise."""
    color = TEAL if verified else ACCENT
    face = og.font(og.FONT_BOLD, size)
    tracking = size * 0.09
    text_width = sum(face.getlength(ch) for ch in label) + tracking * (len(label) - 1)
    pad_x, pad_y = round(size * 0.9), round(size * 0.55)
    w, h = round(text_width + 2 * pad_x), size + 2 * pad_y
    x0, y0 = right_x - w, round(center_y - h / 2)
    border = max(2, round(size * 0.09))
    outer = og.rounded_mask(w, h, h / 2)
    inner = og.supersampled((w, h), lambda d, s: d.rounded_rectangle(
        (border * s, border * s, (w - border) * s - 1, (h - border) * s - 1), radius=(h / 2 - border) * s, fill=255,
    ))
    fill = Image.new("RGB", (w, h), color)
    canvas.paste(fill, (x0, y0), inner.point(lambda v: v * 30 // 255))
    canvas.paste(fill, (x0, y0), ImageChops.subtract(outer, inner).point(lambda v: v * 170 // 255))
    draw = ImageDraw.Draw(canvas, "RGBA")
    x = x0 + pad_x
    for ch in label:
        draw.text((x, center_y), ch, font=face, fill=color, anchor="lm")
        x += face.getlength(ch) + tracking


def _globe(canvas, center, radius, stroke):
    """Faint wireframe globe (text color at 8%) behind the avatars."""
    size = 2 * (radius + stroke)

    def shape(d, s):
        c, r, w = size * s / 2, radius * s, stroke * s
        d.ellipse((c - r, c - r, c + r, c + r), outline=255, width=w)
        for k in (0.34, 0.64, 0.88):  # meridians
            d.ellipse((c - r * k, c - r, c + r * k, c + r), outline=255, width=w)
        d.line((c - r, c, c + r, c), fill=255, width=w)  # equator
        for lat in (0.4, 0.74):  # parallels
            y = r * lat
            half = math.sqrt(r * r - y * y)
            d.line((c - half, c - y, c + half, c - y), fill=255, width=w)
            d.line((c - half, c + y, c + half, c + y), fill=255, width=w)

    mask = og.supersampled(size, shape, scale=3).point(lambda v: round(v * 0.08))
    canvas.paste(Image.new("RGB", (size, size), TEXT), (center[0] - size // 2, center[1] - size // 2), mask)


def initial_avatar(username, size):
    """Default avatar: dark gradient with the username's first letter."""
    face_img = og.diagonal_gradient(size, INITIAL_TOP, SURFACE)
    letter = next((c for c in username if c.isalnum()), "?").upper()
    style, letter = og.text_style(letter, bold=True)
    ImageDraw.Draw(face_img).text(
        (size / 2, size / 2), letter, font=style.at(round(size * 0.44)), fill=TEXT, anchor="mm",
    )
    return face_img.convert("RGBA")


def _avatar_pair(canvas, center, size, ring, gap, avatars, names, check, cut):
    """
    Two avatars overlapping by 30% of their width, each in an accent→teal
    ring; A (left) sits on top, cut out from B. A teal check sits between.
    """
    outer = size + 2 * (ring + gap)
    offset = round(outer * 0.7 / 2)
    cx, cy = center
    for index, dx in ((1, offset), (0, -offset)):  # B first, A on top
        ox, oy = cx + dx - outer // 2, cy - outer // 2
        if index == 0:
            hole = outer + 2 * cut
            canvas.paste(Image.new("RGB", (hole, hole), BG), (ox - cut, oy - cut), og.circle_mask(hole))
        ring_mask = ImageChops.subtract(og.circle_mask(outer), og.circle_mask(outer, inset=ring))
        canvas.paste(og.diagonal_gradient(outer, ACCENT, TEAL), (ox, oy), ring_mask)
        face = avatars[index] if avatars[index] is not None else initial_avatar(names[index], size * 2)
        og.paste_circle_image(canvas, face, (ox + ring + gap, oy + ring + gap), size)

    # Check badge on the overlap, low enough to keep faces clear
    bx, by = cx, cy + round(outer * 0.3)
    hole = check + 2 * cut
    canvas.paste(Image.new("RGB", (hole, hole), BG), (bx - hole // 2, by - hole // 2), og.circle_mask(hole))
    canvas.paste(Image.new("RGB", (check, check), TEAL), (bx - check // 2, by - check // 2), og.circle_mask(check))
    tick = og.supersampled(check, lambda d, s: d.line(
        [(check * 0.29 * s, check * 0.53 * s), (check * 0.44 * s, check * 0.68 * s), (check * 0.72 * s, check * 0.37 * s)],
        fill=255, width=max(2, round(check * 0.11)) * s, joint="curve",
    ))
    canvas.paste(Image.new("RGB", (check, check), BG), (bx - check // 2, by - check // 2), tick)


def _footer_url(canvas, x, center_y, text, size):
    ImageDraw.Draw(canvas, "RGBA").text(
        (x, center_y), text, font=og.font(og.FONT_VARIABLE, size, 500), fill=MUTED, anchor="lm",
    )
