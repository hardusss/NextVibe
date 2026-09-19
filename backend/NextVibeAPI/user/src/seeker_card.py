"""
Seeker Verified share card: a 1200×630 PNG rendered with Pillow.

Cards are rendered once per version and kept in storage (R2 in prod) under
seeker-cards/<user_id>-v<version>.png. The version is a hash of everything
drawn on the card (username, avatar file, verification source) plus
CARD_DESIGN_VERSION, so it changes by itself when any of them changes. There
is no counter to bump and no schema change. Bump CARD_DESIGN_VERSION when the
layout changes so every card re-renders.
"""
import hashlib
import importlib.util
import io
import logging
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urlsplit

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

logger = logging.getLogger(__name__)

CARD_DESIGN_VERSION = 1
WIDTH, HEIGHT = 1200, 630
MARGIN = 96
AVATAR_SIZE = 160
MAX_AVATAR_BYTES = 8 * 1024 * 1024
MAX_AVATAR_PIXELS = 40_000_000
_AVATAR_HOSTS = {"res.cloudinary.com", "media.nextvibe.io"}

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "seeker_card"
FONT_BOLD = ASSETS / "PlusJakartaSans-Bold.ttf"
FONT_VARIABLE = ASSETS / "PlusJakartaSans-VariableFont_wght.ttf"
BADGE_ART = ASSETS / "seeker-genesis.png"
BRAND_MARK = ASSETS / "nextvibe-mark.png"

# Plus Jakarta Sans has no Cyrillic, Greek-extended or CJK. DejaVu Sans ships
# with matplotlib (already a backend dependency), with system copies as backup.
_FALLBACK_FONT_PATHS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
)

BG = (10, 4, 16)
VIOLET = (124, 58, 237)
ACCENT = (168, 85, 247)
MINT = (52, 211, 153)
LAVENDER = (221, 200, 255)
WHITE = (255, 255, 255)

HEADLINE = "Seeker Verified"
_SUBLINES = {"skr": "Seeker ID (.skr) confirmed"}
_DEFAULT_SUBLINE = "Genesis Token confirmed on-chain"


def card_subline(source):
    """What confirmed the badge. Users verified by a .skr name have no token check."""
    return _SUBLINES.get(source or "", _DEFAULT_SUBLINE)


def verified_user(username):
    """
    The Seeker Verified account behind a share URL, or None. Unknown, banned,
    deleted and unverified accounts all look the same to the caller.
    """
    username = (username or "").strip().rstrip("/")
    if not username:
        return None
    # `objects` already hides banned accounts, and deleted ones are banned too.
    return (
        get_user_model().objects
        .filter(username=username, seeker_verified=True, is_active=True)
        .first()
    )


def card_version(user) -> str:
    avatar = user.avatar.name if user.avatar else ""
    raw = "|".join((
        str(CARD_DESIGN_VERSION),
        str(user.user_id),
        user.username,
        avatar,
        user.seeker_verified_source or "",
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:10]


def card_storage_key(user, version: str) -> str:
    return f"seeker-cards/{user.user_id}-v{version}.png"


def card_image_url(username: str, version: str | None = None) -> str:
    url = f"{settings.PUBLIC_API_URL}/api/v1/users/{quote(username, safe='')}/seeker-card.png"
    return f"{url}?v={version}" if version else url


def get_card_png(user):
    """
    Returns (png_bytes, version). The first request for a version renders the
    card and stores it; later ones read the stored file.
    """
    version = card_version(user)
    key = card_storage_key(user, version)
    try:
        with default_storage.open(key, "rb") as fh:
            return fh.read(), version
    except FileNotFoundError:
        pass
    except Exception as e:
        # Storage hiccup: still answer with a fresh render
        logger.warning("seeker.card user=%s read %s failed: %s", user.user_id, key, e)

    png = render_card(user.username, load_avatar(user), user.seeker_verified_source)
    try:
        # Two first requests can race here; the loser's copy is just unused.
        if not default_storage.exists(key):
            default_storage.save(key, ContentFile(png))
    except Exception as e:
        logger.warning("seeker.card user=%s store %s failed: %s", user.user_id, key, e)
    return png, version


def load_avatar(user):
    """The user's avatar as an RGBA image, or None to draw the default one."""
    name = user.avatar.name if user.avatar else ""
    if not name:
        return None
    try:
        if name.startswith(("http://", "https://")):
            # Older accounts keep Google / Cloudinary avatars as absolute URLs.
            # Only fetch from those hosts, and don't follow redirects elsewhere.
            if not _is_avatar_host(name):
                raise ValueError("avatar host not allowed")
            with requests.get(name, timeout=(3, 5), stream=True, allow_redirects=False) as resp:
                resp.raise_for_status()
                data = resp.raw.read(MAX_AVATAR_BYTES + 1, decode_content=True)
        else:
            with default_storage.open(name, "rb") as fh:
                data = fh.read(MAX_AVATAR_BYTES + 1)
        if len(data) > MAX_AVATAR_BYTES:
            raise ValueError("avatar larger than %d bytes" % MAX_AVATAR_BYTES)
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_AVATAR_PIXELS:
            raise ValueError("avatar is %dx%d" % img.size)  # small file, huge decode
        img.draft("RGB", (AVATAR_SIZE * 2, AVATAR_SIZE * 2))  # cheap JPEG downscale on decode
        return ImageOps.exif_transpose(img).convert("RGBA")
    except Exception as e:
        logger.warning("seeker.card user=%s avatar %s unavailable: %s", user.user_id, name, e)
        return None


def _is_avatar_host(url: str) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    own = (getattr(settings, "AWS_S3_CUSTOM_DOMAIN", None) or "").lower()
    return parts.scheme == "https" and (
        host in _AVATAR_HOSTS or host == own or host.endswith(".googleusercontent.com")
    )


# ── Rendering ────────────────────────────────────────────────────────────

def render_card(username: str, avatar, source=None) -> bytes:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BG)
    _glow(canvas, (330, 270), 560, VIOLET, 0.55)
    _glow(canvas, (1120, 20), 420, ACCENT, 0.22)
    _glow(canvas, (1180, 660), 320, MINT, 0.07)
    draw = ImageDraw.Draw(canvas, "RGBA")

    center_y = 272
    _paste_avatar(canvas, avatar, (MARGIN, center_y - AVATAR_SIZE // 2))

    text_x = MARGIN + AVATAR_SIZE + 56
    max_width = WIDTH - MARGIN - text_x

    # Username row: "@name" with the badge art right after it
    name_font, name_text, badge_size = _fit_username(f"@{username}", max_width)
    row_y = center_y - 70
    draw.text((text_x, row_y), name_text, font=name_font, fill=WHITE, anchor="lm")
    badge_x = round(text_x + name_font.getlength(name_text) + badge_size * 0.3)
    _paste_badge(canvas, (badge_x, row_y - badge_size // 2), badge_size)

    headline_font = _font(FONT_BOLD, 72)
    _gradient_text(canvas, (text_x - 3, center_y + 12), HEADLINE, headline_font, WHITE, LAVENDER)

    sub_font = _font(FONT_VARIABLE, 30, weight=500)
    draw.text((text_x, center_y + 82), card_subline(source), font=sub_font,
              fill=(255, 255, 255, 170), anchor="lm")

    # Footer: site on the left, wordmark on the right
    footer_y = HEIGHT - 62
    draw.line((MARGIN, footer_y - 44, WIDTH - MARGIN, footer_y - 44), fill=(255, 255, 255, 22), width=1)
    draw.text((MARGIN, footer_y), "nextvibe.io", font=_font(FONT_VARIABLE, 26, weight=600),
              fill=(255, 255, 255, 150), anchor="lm")
    word_font = _font(FONT_BOLD, 30)
    word_width = word_font.getlength("NextVibe")
    draw.text((WIDTH - MARGIN, footer_y), "NextVibe", font=word_font, fill=WHITE, anchor="rm")
    mark = Image.open(BRAND_MARK).convert("RGBA").resize((44, 44), Image.LANCZOS)
    canvas.paste(mark, (round(WIDTH - MARGIN - word_width - 10 - 44), footer_y - 23), mark)

    out = io.BytesIO()
    canvas.save(out, "PNG", optimize=True)
    return out.getvalue()


def _font(path, size, weight=None):
    # Not cached: FreeType faces aren't safe to share between request threads
    font = ImageFont.truetype(str(path), size)
    if weight is not None:
        try:
            font.set_variation_by_axes([weight])
        except Exception:
            pass  # FreeType without variation support draws the default weight
    return font


@lru_cache(maxsize=4)
def _cmap(path):
    """Code points the font can draw, or None if that can't be checked."""
    try:
        from fontTools.ttLib import TTFont
        with TTFont(str(path), lazy=True) as tt:
            return frozenset(tt.getBestCmap())
    except Exception:
        return None


@lru_cache(maxsize=1)
def _fallback_font():
    candidates = []
    spec = importlib.util.find_spec("matplotlib")  # locates it without importing
    if spec and spec.submodule_search_locations:
        base = Path(list(spec.submodule_search_locations)[0])
        candidates.append(base / "mpl-data" / "fonts" / "ttf" / "DejaVuSans-Bold.ttf")
    candidates.extend(Path(p) for p in _FALLBACK_FONT_PATHS)
    return next((p for p in candidates if p.is_file()), None)


def _username_font(text):
    """Font file for the username, plus the text it can actually draw."""
    primary = _cmap(FONT_BOLD)
    if primary is None or all(ord(c) in primary for c in text):
        return FONT_BOLD, text
    fallback = _fallback_font()
    secondary = _cmap(fallback) if fallback else None
    if secondary is not None and all(ord(c) in secondary for c in text):
        return fallback, text
    # Emoji, CJK…: no bundled font draws them, so they're left out
    path, cmap = FONT_BOLD, primary
    if secondary is not None and sum(ord(c) in secondary for c in text) > sum(ord(c) in primary for c in text):
        path, cmap = fallback, secondary
    kept = "".join(c for c in text if ord(c) in cmap)
    return path, (kept if kept.strip("@ ") else text)


def _fit_username(text, max_width):
    """Largest font (46→26px) that fits the name and its badge; past that, an ellipsis."""
    path, text = _username_font(text)
    for size in range(46, 25, -2):
        font = _font(path, size)
        badge = round(size * 1.1)
        if font.getlength(text) + badge * 1.3 <= max_width:
            return font, text, badge
    budget = max_width - badge * 1.3
    while len(text) > 2 and font.getlength(text + "…") > budget:
        text = text[:-1]
    return font, text + "…", badge


def _glow(canvas, center, radius, color, strength):
    """Soft radial glow blended onto the canvas."""
    ramp = Image.radial_gradient("L")
    # 255 is only reached in the corners; fade out by the inscribed circle so
    # the square's clipped edge never shows
    edge = ramp.getpixel((0, ramp.height // 2))
    falloff = ramp.point(lambda v: int(255 * strength * (1 - min(v / edge, 1)) ** 2))
    falloff = falloff.resize((radius * 2, radius * 2), Image.BICUBIC)
    canvas.paste(Image.new("RGB", falloff.size, color), (center[0] - radius, center[1] - radius), falloff)


def _supersampled(size, draw_shape, scale=4):
    """Anti-aliased L mask: drawn at `scale`× then downsampled."""
    big = Image.new("L", (size * scale, size * scale), 0)
    draw_shape(ImageDraw.Draw(big), size * scale)
    return big.resize((size, size), Image.LANCZOS)


def _circle_mask(size):
    return _supersampled(size, lambda d, s: d.ellipse((0, 0, s - 1, s - 1), fill=255))


def _diagonal_gradient(size, start, end):
    ramp = Image.linear_gradient("L").resize((size, size))
    mix = ImageChops.add(ramp, ramp.transpose(Image.Transpose.ROTATE_90), scale=2)
    return Image.composite(Image.new("RGB", (size, size), start),
                           Image.new("RGB", (size, size), end),
                           ImageOps.invert(mix))


def _paste_avatar(canvas, avatar, xy):
    x, y = xy
    ring, gap = 5, 6
    outer = AVATAR_SIZE + 2 * (ring + gap)
    ring_mask = ImageChops.subtract(_circle_mask(outer), _inset_circle_mask(outer, ring))
    canvas.paste(_diagonal_gradient(outer, ACCENT, MINT), (x - ring - gap, y - ring - gap), ring_mask)

    face = avatar if avatar is not None else _default_avatar(AVATAR_SIZE * 2)
    backing = Image.new("RGBA", face.size, BG + (255,))  # transparent PNG avatars
    face = Image.alpha_composite(backing, face.convert("RGBA")).convert("RGB")
    face = ImageOps.fit(face, (AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
    canvas.paste(face, (x, y), _circle_mask(AVATAR_SIZE))


def _inset_circle_mask(size, inset):
    return _supersampled(size, lambda d, s: d.ellipse(
        (inset * s / size, inset * s / size, s - 1 - inset * s / size, s - 1 - inset * s / size), fill=255,
    ))


def _default_avatar(size):
    """Neutral silhouette for accounts whose avatar can't be loaded."""
    body = (116, 92, 158)
    img = Image.new("RGBA", (size, size), (34, 18, 56, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((size * 0.34, size * 0.2, size * 0.66, size * 0.52), fill=body)
    d.ellipse((size * 0.17, size * 0.58, size * 0.83, size * 1.14), fill=body)
    return img


def _paste_badge(canvas, xy, size):
    art = Image.open(BADGE_ART).convert("RGB").resize((size, size), Image.LANCZOS)
    radius = size * 0.28  # same rounding as the app's badge
    mask = _supersampled(size, lambda d, s: d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius * s / size, fill=255))
    canvas.paste(art, xy, mask)


def _gradient_text(canvas, xy, text, font, left, right):
    """Text filled with a horizontal gradient (left → right)."""
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor="lm")
    box = mask.getbbox()
    if not box:
        return
    width, height = box[2] - box[0], box[3] - box[1]
    ramp = Image.linear_gradient("L").transpose(Image.Transpose.ROTATE_90)  # 0 at the left → 255 at the right
    fill = Image.composite(Image.new("RGB", (width, height), right),
                           Image.new("RGB", (width, height), left),
                           ramp.resize((width, height)))
    canvas.paste(fill, box[:2], mask.crop(box))
