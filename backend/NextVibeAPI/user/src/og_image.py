"""
Shared drawing and storage helpers for the 1200×630 link-preview images
(og:image): the Seeker Verified card, profile cards and post cards.

Each card is rendered once per version and kept in storage (R2 in prod). A
version is a hash of everything drawn on the card, so it changes by itself
when the content does; every card type also has a design constant to bump
when its layout changes.
"""
import hashlib
import importlib.util
import io
import logging
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import HttpResponse
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

logger = logging.getLogger(__name__)

WIDTH, HEIGHT = 1200, 630
MARGIN = 96
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
# Images stored as absolute URLs (older Google / Cloudinary avatars and media)
_IMAGE_HOSTS = {"res.cloudinary.com", "media.nextvibe.io"}

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "cards"
FONT_BOLD = ASSETS / "PlusJakartaSans-Bold.ttf"
FONT_VARIABLE = ASSETS / "PlusJakartaSans-VariableFont_wght.ttf"
BADGE_ART = ASSETS / "seeker-genesis.png"
BRAND_MARK = ASSETS / "nextvibe-mark.png"

# Plus Jakarta Sans has no Cyrillic, Greek-extended or CJK. DejaVu Sans ships
# with matplotlib (already a backend dependency), with system copies as backup.
_FALLBACK_FONTS = {
    True: ("DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    False: ("DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
}

BG = (10, 4, 16)
VIOLET = (124, 58, 237)
ACCENT = (168, 85, 247)
MINT = (52, 211, 153)
LAVENDER = (221, 200, 255)
WHITE = (255, 255, 255)
OFFICIAL_BLUE = (71, 172, 255)  # the app's verified checkmark


def version_hash(*parts) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:10]


# ── Storage and responses ────────────────────────────────────────────────

def stored_png(key: str, render, context: str) -> bytes:
    """The PNG stored under `key`, rendering and storing it on first use."""
    try:
        with default_storage.open(key, "rb") as fh:
            return fh.read()
    except FileNotFoundError:
        pass
    except Exception as e:
        # Storage hiccup: still answer with a fresh render
        logger.warning("og.card %s read %s failed: %s", context, key, e)

    png = render()
    try:
        # Two first requests can race here; the loser's copy is just unused.
        if not default_storage.exists(key):
            default_storage.save(key, ContentFile(png))
    except Exception as e:
        logger.warning("og.card %s store %s failed: %s", context, key, e)
    return png


def card_response(request, png: bytes, version: str) -> HttpResponse:
    """
    ?v=<current version> is safe to cache for a day: new content means a new
    version. Anything else must always get the latest card.
    """
    response = HttpResponse(png, content_type="image/png")
    if request.GET.get("v") == version:
        response["Cache-Control"] = "public, max-age=86400, immutable"
    else:
        response["Cache-Control"] = "no-cache"
    return response


def not_found_response() -> HttpResponse:
    response = HttpResponse("Not found", status=404, content_type="text/plain")
    response["Cache-Control"] = "no-store"  # it may become public later
    return response


def public_file_url(name: str) -> str | None:
    """Absolute URL of a stored file (or a legacy absolute URL as-is)."""
    if not name:
        return None
    if name.startswith(("http://", "https://")):
        return name
    base = settings.PUBLIC_MEDIA_URL or f"https://{settings.AWS_S3_CUSTOM_DOMAIN}"
    return f"{base.rstrip('/')}/{name.lstrip('/')}"


# ── Loading images ───────────────────────────────────────────────────────

def is_allowed_image_url(url: str) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    own = (getattr(settings, "AWS_S3_CUSTOM_DOMAIN", None) or "").lower()
    return parts.scheme == "https" and (
        host in _IMAGE_HOSTS or host == own or host.endswith(".googleusercontent.com")
    )


def load_image(name: str, context: str, max_side: int = 320):
    """
    A stored image (storage key, or an absolute URL on a known host) as RGBA,
    or None when it can't be used. Never raises.
    """
    if not name:
        return None
    try:
        if name.startswith(("http://", "https://")):
            # Only fetch from known hosts, and don't follow redirects elsewhere
            if not is_allowed_image_url(name):
                raise ValueError("host not allowed")
            with requests.get(name, timeout=(3, 5), stream=True, allow_redirects=False) as resp:
                resp.raise_for_status()
                data = resp.raw.read(MAX_IMAGE_BYTES + 1, decode_content=True)
        else:
            with default_storage.open(name, "rb") as fh:
                data = fh.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("larger than %d bytes" % MAX_IMAGE_BYTES)
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_IMAGE_PIXELS:
            raise ValueError("%dx%d pixels" % img.size)  # small file, huge decode
        img.draft("RGB", (max_side, max_side))  # cheap JPEG downscale on decode
        return ImageOps.exif_transpose(img).convert("RGBA")
    except Exception as e:
        logger.warning("og.card %s image %s unavailable: %s", context, name, e)
        return None


# ── Text ─────────────────────────────────────────────────────────────────

def font(path, size, weight=None):
    # Not cached: FreeType faces aren't safe to share between request threads
    face = ImageFont.truetype(str(path), size)
    if weight is not None:
        try:
            face.set_variation_by_axes([weight])
        except Exception:
            pass  # FreeType without variation support draws the default weight
    return face


@lru_cache(maxsize=8)
def _cmap(path):
    """Code points the font can draw, or None if that can't be checked."""
    try:
        from fontTools.ttLib import TTFont
        with TTFont(str(path), lazy=True) as tt:
            return frozenset(tt.getBestCmap())
    except Exception:
        return None


@lru_cache(maxsize=2)
def _fallback_font(bold: bool):
    file_name, system_path = _FALLBACK_FONTS[bold]
    candidates = []
    spec = importlib.util.find_spec("matplotlib")  # locates it without importing
    if spec and spec.submodule_search_locations:
        base = Path(list(spec.submodule_search_locations)[0])
        candidates.append(base / "mpl-data" / "fonts" / "ttf" / file_name)
    candidates.append(Path(system_path))
    return next((p for p in candidates if p.is_file()), None)


class TextStyle:
    """Font file and weight chosen for a piece of user text."""

    def __init__(self, path, weight=None):
        self.path, self.weight = path, weight

    def at(self, size):
        return font(self.path, size, self.weight)


def text_style(text: str, bold: bool = True):
    """
    Style that can draw `text`, plus the text itself. Plus Jakarta Sans first,
    then DejaVu Sans for Cyrillic etc. Characters neither can draw (some emoji,
    CJK) are left out.
    """
    primary = TextStyle(FONT_BOLD) if bold else TextStyle(FONT_VARIABLE, 500)
    covered = _cmap(FONT_BOLD)  # both Plus Jakarta files share one character set
    if covered is None or all(ord(c) in covered for c in text):
        return primary, text
    fallback_path = _fallback_font(bold)
    fallback = _cmap(fallback_path) if fallback_path else None
    if fallback is not None and all(ord(c) in fallback for c in text):
        return TextStyle(fallback_path), text
    style, cmap = primary, covered
    if fallback is not None and sum(ord(c) in fallback for c in text) > sum(ord(c) in covered for c in text):
        style, cmap = TextStyle(fallback_path), fallback
    kept = "".join(c for c in text if ord(c) in cmap or c.isspace())
    return style, (kept if kept.strip("@ ") else text)


def fit_line(text: str, max_width: float, sizes, reserve=lambda size: 0, bold: bool = True):
    """
    Largest size whose line (plus `reserve(size)` px for what follows it) fits;
    past the smallest size the text gets an ellipsis. Returns (font, text, size).
    """
    style, text = text_style(text, bold)
    sizes = list(sizes)
    for size in sizes:
        face = style.at(size)
        if face.getlength(text) + reserve(size) <= max_width:
            return face, text, size
    size = sizes[-1]
    budget = max_width - reserve(size)
    while len(text) > 2 and face.getlength(text + "…") > budget:
        text = text[:-1]
    return face, text + "…", size


def wrap_lines(text: str, face, max_width: float, max_lines: int):
    """Greedy word wrap into at most `max_lines`; an ellipsis marks the cut."""
    words = text.split()
    lines, current, index = [], "", 0
    while index < len(words) and len(lines) < max_lines:
        word = words[index]
        candidate = f"{current} {word}" if current else word
        if face.getlength(candidate) <= max_width:
            current, index = candidate, index + 1
            continue
        if current:
            lines.append(current)
            current = ""
            continue
        # One word wider than the whole line (links, hashtags): split it
        cut = len(word)
        while cut > 1 and face.getlength(word[:cut]) > max_width:
            cut -= 1
        lines.append(word[:cut])
        words[index] = word[cut:]
    if current and len(lines) < max_lines:
        lines.append(current)
    elif current:
        index -= 1  # the pending line didn't fit: its words are left over
    if index < len(words) and lines:
        last = lines[-1]
        while last and face.getlength(last + "…") > max_width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


# ── Drawing ──────────────────────────────────────────────────────────────

def new_canvas(glows):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BG)
    for center, radius, color, strength in glows:
        glow(canvas, center, radius, color, strength)
    return canvas


def glow(canvas, center, radius, color, strength):
    """Soft radial glow blended onto the canvas."""
    ramp = Image.radial_gradient("L")
    # 255 is only reached in the corners; fade out by the inscribed circle so
    # the square's clipped edge never shows
    edge = ramp.getpixel((0, ramp.height // 2))
    falloff = ramp.point(lambda v: int(255 * strength * (1 - min(v / edge, 1)) ** 2))
    falloff = falloff.resize((radius * 2, radius * 2), Image.BICUBIC)
    canvas.paste(Image.new("RGB", falloff.size, color), (center[0] - radius, center[1] - radius), falloff)


def supersampled(size, draw_shape, scale=4):
    """Anti-aliased L mask: drawn at `scale`× then downsampled."""
    width, height = size if isinstance(size, tuple) else (size, size)
    big = Image.new("L", (width * scale, height * scale), 0)
    draw_shape(ImageDraw.Draw(big), scale)
    return big.resize((width, height), Image.LANCZOS)


def circle_mask(size, inset=0):
    return supersampled(size, lambda d, s: d.ellipse(
        (inset * s, inset * s, (size - inset) * s - 1, (size - inset) * s - 1), fill=255,
    ))


def rounded_mask(width, height, radius):
    return supersampled((width, height), lambda d, s: d.rounded_rectangle(
        (0, 0, width * s - 1, height * s - 1), radius=radius * s, fill=255,
    ))


def diagonal_gradient(size, start, end):
    ramp = Image.linear_gradient("L").resize((size, size))
    mix = ImageChops.add(ramp, ramp.transpose(Image.Transpose.ROTATE_90), scale=2)
    return Image.composite(Image.new("RGB", (size, size), start),
                           Image.new("RGB", (size, size), end),
                           ImageOps.invert(mix))


def paste_avatar(canvas, avatar, xy, size, ring=5, gap=6):
    """Circular avatar at `xy` (top-left) inside a violet→mint ring."""
    x, y = xy
    outer = size + 2 * (ring + gap)
    ring_mask = ImageChops.subtract(circle_mask(outer), circle_mask(outer, inset=ring))
    canvas.paste(diagonal_gradient(outer, ACCENT, MINT), (x - ring - gap, y - ring - gap), ring_mask)
    paste_circle_image(canvas, avatar, xy, size)


def paste_circle_image(canvas, image, xy, size):
    face = image if image is not None else default_avatar(size * 2)
    backing = Image.new("RGBA", face.size, BG + (255,))  # transparent PNGs
    face = Image.alpha_composite(backing, face.convert("RGBA")).convert("RGB")
    face = ImageOps.fit(face, (size, size), Image.LANCZOS)
    canvas.paste(face, xy, circle_mask(size))


def default_avatar(size):
    """Neutral silhouette for accounts whose avatar can't be loaded."""
    body = (116, 92, 158)
    img = Image.new("RGBA", (size, size), (34, 18, 56, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((size * 0.34, size * 0.2, size * 0.66, size * 0.52), fill=body)
    d.ellipse((size * 0.17, size * 0.58, size * 0.83, size * 1.14), fill=body)
    return img


def paste_seeker_badge(canvas, xy, size):
    art = Image.open(BADGE_ART).convert("RGB").resize((size, size), Image.LANCZOS)
    canvas.paste(art, xy, rounded_mask(size, size, size * 0.28))  # the app's rounding


def paste_official_badge(canvas, xy, size):
    """Blue check disc, like the app's verified badge."""
    disc = Image.new("RGB", (size, size), OFFICIAL_BLUE)
    canvas.paste(disc, xy, circle_mask(size))
    check = supersampled(size, lambda d, s: d.line(
        [(size * 0.28 * s, size * 0.52 * s), (size * 0.44 * s, size * 0.68 * s), (size * 0.73 * s, size * 0.36 * s)],
        fill=255, width=max(2, round(size * 0.11)) * s, joint="curve",
    ))
    canvas.paste(Image.new("RGB", (size, size), WHITE), xy, check)


def gradient_text(canvas, xy, text, face, left, right, anchor="lm"):
    """Text filled with a horizontal gradient (left → right)."""
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=face, fill=255, anchor=anchor)
    box = mask.getbbox()
    if not box:
        return
    width, height = box[2] - box[0], box[3] - box[1]
    ramp = Image.linear_gradient("L").transpose(Image.Transpose.ROTATE_90)  # 0 at the left → 255 at the right
    fill = Image.composite(Image.new("RGB", (width, height), right),
                           Image.new("RGB", (width, height), left),
                           ramp.resize((width, height)))
    canvas.paste(fill, box[:2], mask.crop(box))


def pill(canvas, xy, text, fill, outline, color, size=24, padding=(18, 9)):
    """Rounded label; returns its width."""
    face = font(FONT_BOLD, size)
    width = round(face.getlength(text)) + padding[0] * 2
    height = size + padding[1] * 2
    x, y = xy
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle((x, y, x + width, y + height), radius=height / 2, fill=fill, outline=outline, width=2)
    draw.text((x + width / 2, y + height / 2), text, font=face, fill=color, anchor="mm")
    return width


def paste_wordmark(canvas, right_x, center_y, text_size=30, mark_size=44):
    """NextVibe mark + name, right-aligned at `right_x`."""
    draw = ImageDraw.Draw(canvas, "RGBA")
    face = font(FONT_BOLD, text_size)
    width = face.getlength("NextVibe")
    draw.text((right_x, center_y), "NextVibe", font=face, fill=WHITE, anchor="rm")
    mark = Image.open(BRAND_MARK).convert("RGBA").resize((mark_size, mark_size), Image.LANCZOS)
    canvas.paste(mark, (round(right_x - width - 10 - mark_size), center_y - mark_size // 2 - 1), mark)


def draw_footer(canvas):
    """Divider, "nextvibe.io" bottom-left and the wordmark bottom-right."""
    draw = ImageDraw.Draw(canvas, "RGBA")
    footer_y = HEIGHT - 62
    draw.line((MARGIN, footer_y - 44, WIDTH - MARGIN, footer_y - 44), fill=(255, 255, 255, 22), width=1)
    draw.text((MARGIN, footer_y), "nextvibe.io", font=font(FONT_VARIABLE, 26, weight=600),
              fill=(255, 255, 255, 150), anchor="lm")
    paste_wordmark(canvas, WIDTH - MARGIN, footer_y)


def png_bytes(canvas) -> bytes:
    out = io.BytesIO()
    canvas.save(out, "PNG", optimize=True)
    return out.getvalue()
