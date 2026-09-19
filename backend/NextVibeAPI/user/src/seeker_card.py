"""
Seeker Verified share card: a 1200×630 PNG rendered with Pillow.

Cards are rendered once per version and kept in storage (R2 in prod) under
seeker-cards/<user_id>-v<version>.png. The version is a hash of everything
drawn on the card (username, avatar file, verification source) plus
CARD_DESIGN_VERSION, so it changes by itself when any of them changes. There
is no counter to bump and no schema change. Bump CARD_DESIGN_VERSION when the
layout changes so every card re-renders. Shared helpers: user/src/og_image.py.
"""
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from PIL import ImageDraw

from user.src import og_image as og

CARD_DESIGN_VERSION = 1
AVATAR_SIZE = 160

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
    return og.version_hash(CARD_DESIGN_VERSION, user.user_id, user.username, avatar, user.seeker_verified_source or "")


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
    png = og.stored_png(
        card_storage_key(user, version),
        lambda: render_card(user.username, load_avatar(user), user.seeker_verified_source),
        f"seeker user={user.user_id}",
    )
    return png, version


def load_avatar(user):
    """The user's avatar as an RGBA image, or None to draw the default one."""
    return og.load_image(user.avatar.name if user.avatar else "", f"seeker user={user.user_id}")


def render_card(username: str, avatar, source=None) -> bytes:
    canvas = og.new_canvas((
        ((330, 270), 560, og.VIOLET, 0.55),
        ((1120, 20), 420, og.ACCENT, 0.22),
        ((1180, 660), 320, og.MINT, 0.07),
    ))
    draw = ImageDraw.Draw(canvas, "RGBA")

    center_y = 272
    og.paste_avatar(canvas, avatar, (og.MARGIN, center_y - AVATAR_SIZE // 2), AVATAR_SIZE)

    text_x = og.MARGIN + AVATAR_SIZE + 56
    max_width = og.WIDTH - og.MARGIN - text_x

    # Username row: "@name" with the badge art right after it
    name_font, name_text, badge_size = _fit_username(f"@{username}", max_width)
    row_y = center_y - 70
    draw.text((text_x, row_y), name_text, font=name_font, fill=og.WHITE, anchor="lm")
    badge_x = round(text_x + name_font.getlength(name_text) + badge_size * 0.3)
    og.paste_seeker_badge(canvas, (badge_x, row_y - badge_size // 2), badge_size)

    og.gradient_text(canvas, (text_x - 3, center_y + 12), HEADLINE, og.font(og.FONT_BOLD, 72), og.WHITE, og.LAVENDER)

    draw.text((text_x, center_y + 82), card_subline(source), font=og.font(og.FONT_VARIABLE, 30, weight=500),
              fill=(255, 255, 255, 170), anchor="lm")

    og.draw_footer(canvas)
    return og.png_bytes(canvas)


def _fit_username(text, max_width):
    """Largest font (46→26px) that fits the name and its badge; past that, an ellipsis."""
    face, text, size = og.fit_line(text, max_width, range(46, 25, -2), reserve=lambda s: round(s * 1.1) * 1.3)
    return face, text, round(size * 1.1)
