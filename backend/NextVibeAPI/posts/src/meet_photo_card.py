"""
Proof of Meet selfie card: the photo two people took at a tap, with the
NextVibe layer (frame + the meeting's data) drawn by the server.

    story  1080×1350  the photo fills the top (~78 %), the data band under it
    og     1200×630   the photo on the left 60 %, the data panel on the right

The same data as the v1 card (posts/src/meet_card.py): tier, "@a met @b"
with Seeker glyphs, city and local time (never coordinates), the event,
the pair's history, the proof line and the link. The photo gets a 16 px
dark frame, 24 px corners and (story) a dark fade into the band; nothing
else touches it (no filters on faces). The photographer's preview is this
same render, so what they send is what gets published; only the proof line
changes, once the cNFT exists ("recorded on NextVibe" → "verified on
Solana · 8xK…3fQ"). Bump PHOTO_DESIGN_VERSION when the layout changes.
"""
import io
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageOps

from posts.src import meet_card as v1
from posts.src.meet_card import BG, MUTED, TEAL, TEXT, _Badge, _Text, _runs_width
from posts.src.meets import TIER_IN_PERSON
from user.src import og_image as og

PHOTO_DESIGN_VERSION = 1
VARIANTS = v1.VARIANTS
FRAME = 16
CORNER = 24
JPEG_QUALITY = 90
# Selfies keep faces in the upper middle: crop a little more from the bottom
CROP_CENTER = (0.5, 0.42)


@dataclass(frozen=True)
class SelfieText:
    tier: str
    tier_label: str
    a: str
    b: str
    a_seeker: bool
    b_seeker: bool
    when_line: str
    event_name: str | None
    history: str
    proof: str
    minted: bool
    url_line: str


def history_line(meet) -> str:
    """ "3rd time meeting · first: Sep 21", or "#14 for @a · #1 for @b" on a first meet."""
    a, b = meet.people
    if meet.pair_count > 1:
        first = v1.local_time(meet, meet.pair_first_at)
        return f"{v1.ordinal(meet.pair_count)} time meeting · first: {first:%b} {first.day}"
    return f"#{a.number} for @{v1.short_name(a.username)} · #{b.number} for @{v1.short_name(b.username)}"


def when_line(meet) -> str:
    """City · Tue, Sep 23, 2026 · 18:10 (local time of the place; UTC when unknown)."""
    local = v1.local_time(meet)
    stamp = f"{local:%a}, {local:%b} {local.day}, {local.year} · {local:%H:%M}"
    if meet.tz is None:
        stamp += " UTC"
    return f"{meet.city or 'In person'} · {stamp}"


def selfie_text(meet) -> SelfieText:
    a, b = meet.people
    return SelfieText(
        tier=meet.tier,
        tier_label=meet.tier_label,
        a=a.username,
        b=b.username,
        a_seeker=a.seeker,
        b_seeker=b.seeker,
        when_line=when_line(meet),
        event_name=meet.event_name,
        history=history_line(meet),
        proof=v1.proof_text(meet),
        minted=bool(meet.asset_id),
        url_line=meet.url.split("://", 1)[1],
    )


def render(meet, photo, variant="story"):
    """The card as an RGB image. `photo` is the stored selfie (RGB)."""
    text = selfie_text(meet)
    if variant == "og":
        return _render_og(text, photo)
    return _render_story(text, photo)


def render_jpeg(meet, photo, variant="story") -> bytes:
    return jpeg_bytes(render(meet, photo, variant))


def jpeg_bytes(canvas) -> bytes:
    out = io.BytesIO()
    # 4:4:4 keeps the small type on the band crisp
    canvas.convert("RGB").save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, subsampling=0)
    return out.getvalue()


def png_to_jpeg(png: bytes) -> bytes:
    """The v1 card (PNG) as a JPEG, for the public story.jpg / og.jpg after a takedown."""
    return jpeg_bytes(Image.open(io.BytesIO(png)))


# ── Layouts ──────────────────────────────────────────────────────────────

def _render_story(t: SelfieText, photo):
    width, height = VARIANTS["story"]
    canvas = Image.new("RGB", (width, height), BG)
    margin = 56
    max_width = width - 2 * margin

    rows = [
        ("header", 56),
        (_headline(t, max_width, range(50, 33, -2)), 60),
        (v1._single(t.when_line, max_width, (28, 26, 24, 22), TEXT + (225,)), 38),
    ]
    if t.event_name:
        rows.append((v1._event_runs(t.event_name, max_width, (26, 24, 22, 20)), 36))
    rows.append((_line(t.history, max_width, (26, 24, 22, 20), TEXT + (205,)), 36))
    rows.append((_proof(t, max_width, (24, 22, 20)), 36))
    rows.append((_line(t.url_line, max_width, (22, 20), MUTED), 30))
    # ~78 % photo without an event line, ~75 % with one
    band = 12 + sum(h for _, h in rows) + 18

    photo_box = (FRAME, FRAME, width - FRAME, height - band)
    _paste_photo(canvas, photo, photo_box, fade=True)

    y = height - band + 12
    for runs, h in rows:
        center_y = y + h // 2
        if runs == "header":
            v1._wordmark(canvas, margin, center_y, mark=40, size=28)
            v1._tier_chip(canvas, width - margin, center_y, t.tier_label, t.tier != TIER_IN_PERSON, size=19)
        elif runs:
            _draw_left(canvas, runs, margin, center_y)
        y += h
    return canvas


def _render_og(t: SelfieText, photo):
    width, height = VARIANTS["og"]
    canvas = Image.new("RGB", (width, height), BG)
    split = round(width * 0.6)
    photo_box = (FRAME, FRAME, split - FRAME // 2, height - FRAME)
    _paste_photo(canvas, photo, photo_box, fade=False)

    left = split + 30
    max_width = width - left - 44
    name_a, name_b = _stacked(t, max_width, range(36, 23, -2))
    rows = [
        ("wordmark", 44),
        ("chip", 46),
        ([], 10),
        (name_a, 44),
        ([_Text("met", og.font(og.FONT_VARIABLE, 22, 500), MUTED)], 30),
        (name_b, 44),
        ([], 12),
    ]
    for line in _wrapped(t.when_line, max_width, (21, 20, 19), TEXT + (225,)):
        rows.append((line, 30))
    if t.event_name:
        rows.append((v1._event_runs(t.event_name, max_width, (20, 19, 18, 17)), 30))
    rows.append((_line(t.history, max_width, (20, 19, 18, 17), TEXT + (205,)), 30))
    rows.append(([], 10))
    rows.append(([_Text("Proof of Meet", og.font(og.FONT_BOLD, 20), TEAL if t.minted else TEXT)], 30))
    rows.append((_line(t.proof, max_width, (19, 18, 17), MUTED), 28))
    rows.append(([], 10))
    rows.append((_line(t.url_line, max_width, (17, 16, 15), MUTED), 26))

    block = sum(h for _, h in rows)
    y = max(36, (height - block) // 2)
    for runs, h in rows:
        center_y = y + h // 2
        if runs == "wordmark":
            v1._wordmark(canvas, left, center_y, mark=32, size=23)
        elif runs == "chip":
            _chip_left(canvas, left, center_y, t.tier_label, t.tier != TIER_IN_PERSON, size=15)
        elif runs:
            _draw_left(canvas, runs, left, center_y)
        y += h
    return canvas


# ── Pieces ───────────────────────────────────────────────────────────────

def _paste_photo(canvas, photo, box, fade):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    fitted = ImageOps.fit(photo.convert("RGB"), (w, h), Image.LANCZOS, centering=CROP_CENTER)
    if fade:
        # Dark fade over the bottom ~20 % so the photo runs into the band
        depth = round(h * 0.2)
        shade = Image.new("L", (w, h), 0)
        ramp = Image.linear_gradient("L").resize((w, depth))  # 0 at the top → 255 at the bottom
        shade.paste(ramp.point(lambda v: round(v * 0.72)), (0, h - depth))
        fitted = Image.composite(Image.new("RGB", (w, h), BG), fitted, shade)
    canvas.paste(fitted, (x0, y0), og.rounded_mask(w, h, CORNER))


def _draw_left(canvas, runs, x, center_y):
    draw = ImageDraw.Draw(canvas, "RGBA")
    for run in runs:
        if isinstance(run, _Text):
            draw.text((x, center_y), run.text, font=run.face, fill=run.fill, anchor="lm")
        elif isinstance(run, _Badge):
            og.paste_seeker_badge(canvas, (round(x), round(center_y - run.size / 2)), run.size)
        x += run.width()


def _line(text, max_width, sizes, fill, bold=False):
    face, shown, _ = og.fit_line(text, max_width, sizes, bold=bold)
    return [_Text(shown, face, fill)]


def _wrapped(text, max_width, sizes, fill):
    """One line when it fits at some size, else two (split at " · ")."""
    style, text = og.text_style(text, bold=False)
    for size in sizes:
        if style.at(size).getlength(text) <= max_width:
            return [[_Text(text, style.at(size), fill)]]
    head, sep, tail = text.partition(" · ")
    if not sep:
        return [_line(text, max_width, sizes, fill)]
    return [_line(head, max_width, sizes, fill), _line(tail, max_width, sizes, fill)]


def _proof(t, max_width, sizes):
    for size in sizes:
        runs = [
            _Text("Proof of Meet", og.font(og.FONT_BOLD, size), TEAL if t.minted else TEXT),
            _Text(f"  ·  {t.proof}", og.font(og.FONT_VARIABLE, size, 500), MUTED),
        ]
        if _runs_width(runs) <= max_width:
            return runs
    return runs


def _headline(t, max_width, sizes):
    """ "@a met @b" on one line, like the v1 card's headline (Seeker glyphs included)."""
    return v1._headline(t, max_width, sizes)


def _stacked(t, max_width, sizes):
    return v1._stacked_names(t, max_width, sizes)


def _chip_left(canvas, left_x, center_y, label, verified, size):
    """v1's tier chip, left-aligned at left_x instead of right-aligned."""
    face = og.font(og.FONT_BOLD, size)
    tracking = size * 0.09
    text_width = sum(face.getlength(ch) for ch in label) + tracking * (len(label) - 1)
    chip_width = round(text_width + 2 * round(size * 0.9))
    v1._tier_chip(canvas, left_x + chip_width, center_y, label, verified, size)
