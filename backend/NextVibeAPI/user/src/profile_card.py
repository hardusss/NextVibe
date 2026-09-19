"""
Profile link preview for nextvibe.io/u/<id>: a 1200×630 card with the avatar,
username, badges and bio. Rendered once per version and stored as
og/profiles/<user_id>-v<version>.png. Follower counts aren't drawn: they
change constantly, and link previews stay cached for days anyway.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from PIL import ImageDraw

from user.src import og_image as og

PROFILE_DESIGN_VERSION = 1
AVATAR_SIZE = 220
TAGLINE = "Tap phones. Prove you met."


def public_profile(user_id):
    """The account behind nextvibe.io/u/<id>, or None (unknown, banned, deleted)."""
    # `objects` already hides banned accounts, and deleted ones are banned too.
    return (
        get_user_model().objects
        .filter(user_id=user_id, is_active=True)
        .select_related("og_avatar")
        .first()
    )


def og_edition(user):
    og_mint = getattr(user, "og_avatar", None)
    return og_mint.edition if og_mint else None


def avatar_name(user) -> str:
    return user.avatar.name if user.avatar else ""


def profile_card_version(user) -> str:
    return og.version_hash(
        PROFILE_DESIGN_VERSION, user.user_id, user.username, avatar_name(user),
        " ".join((user.about or "").split()), bool(user.official), bool(user.seeker_verified),
        og_edition(user) or "",
    )


def profile_card_url(user, version: str) -> str:
    return f"{settings.PUBLIC_API_URL}/api/v1/users/{user.user_id}/card.png?v={version}"


def get_profile_card_png(user):
    """(png_bytes, version); the first request for a version renders and stores it."""
    version = profile_card_version(user)
    context = f"profile user={user.user_id}"
    png = og.stored_png(
        f"og/profiles/{user.user_id}-v{version}.png",
        lambda: render_profile_card(
            user.username,
            og.load_image(avatar_name(user), context),
            about=user.about or "",
            official=bool(user.official),
            seeker=bool(user.seeker_verified),
            og_number=og_edition(user),
        ),
        context,
    )
    return png, version


def render_profile_card(username, avatar, about="", official=False, seeker=False, og_number=None) -> bytes:
    canvas = og.new_canvas((
        ((300, 280), 600, og.VIOLET, 0.5),
        ((1120, 20), 420, og.ACCENT, 0.22),
        ((1180, 660), 320, og.MINT, 0.07),
    ))
    draw = ImageDraw.Draw(canvas, "RGBA")
    center_y = 262
    og.paste_avatar(canvas, avatar, (og.MARGIN, center_y - AVATAR_SIZE // 2), AVATAR_SIZE, ring=6, gap=7)

    x = og.MARGIN + AVATAR_SIZE + 64
    max_width = og.WIDTH - og.MARGIN - x

    badges = (["official"] if official else []) + (["seeker"] if seeker else [])

    def badge_room(size):
        return sum(round(size * 0.82) + round(size * 0.22) for _ in badges)

    name_font, name_text, name_size = og.fit_line(f"@{username}", max_width, range(60, 29, -2), reserve=badge_room)

    bio = " ".join((about or "").split())
    bio_style, bio = og.text_style(bio or TAGLINE, bold=False)
    bio_face = bio_style.at(30)
    bio_lines = og.wrap_lines(bio, bio_face, max_width, 3)
    bio_color = (255, 255, 255, 185) if about.strip() else (255, 255, 255, 120)

    chips = []
    if seeker:
        chips.append(("Seeker Verified", (52, 211, 153, 34), (52, 211, 153, 120), (167, 243, 208)))
    if og_number:
        chips.append((f"OG #{og_number}", (232, 201, 122, 34), (232, 201, 122, 120), (244, 222, 159)))

    # Stack: name, bio lines, chips; centred on the avatar
    name_height, line_height, chip_height = round(name_size * 1.2), 42, 42
    height = name_height + 16 + len(bio_lines) * line_height + (26 + chip_height if chips else 0)
    top = center_y - height / 2

    name_y = round(top + name_height / 2)
    og.gradient_text(canvas, (x - 2, name_y), name_text, name_font, og.WHITE, og.LAVENDER)
    badge_x = x + name_font.getlength(name_text) + round(name_size * 0.22)
    for badge in badges:
        size = round(name_size * 0.82)
        position = (round(badge_x), name_y - size // 2 + 2)
        if badge == "official":
            og.paste_official_badge(canvas, position, size)
        else:
            og.paste_seeker_badge(canvas, position, size)
        badge_x += size + round(name_size * 0.22)

    line_y = top + name_height + 16 + line_height / 2
    for line in bio_lines:
        draw.text((x, round(line_y)), line, font=bio_face, fill=bio_color, anchor="lm")
        line_y += line_height

    if chips:
        chip_x = x
        chip_y = round(top + name_height + 16 + len(bio_lines) * line_height + 26)
        for text, fill, outline, color in chips:
            chip_x += og.pill(canvas, (chip_x, chip_y), text, fill, outline, color, size=22, padding=(18, 10)) + 12

    og.draw_footer(canvas)
    return og.png_bytes(canvas)
