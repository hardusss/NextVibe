"""
Post link preview for nextvibe.io/u/post/<id>: a 1200×630 card. Photo posts
(and videos with a preview frame) show the picture full-height on the right
with the author and caption on the left; text posts get a quote layout.
Posts still in moderation get a card without their caption or media.
Rendered once per version and stored as og/posts/<post_id>-v<version>.png.
"""
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from django.conf import settings
from PIL import Image, ImageDraw, ImageOps

from posts.models import Post
from user.src import og_image as og

POST_DESIGN_VERSION = 1
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".3gp"}
PANEL_X = 630  # the photo runs from here to the right edge
FADE = 170  # px over which the photo fades into the background


def shared_post(post_id):
    """
    (post, state) behind nextvibe.io/u/post/<id>. state is "public" once
    moderation approved it, "pending" while it's in review. None when the post
    is hidden or deleted, was denied, or its author is banned or deleted.
    """
    post = (
        Post.objects  # hides banned authors
        .select_related("owner", "owner__og_avatar")
        .prefetch_related("media")
        .filter(id=post_id, is_hide=False, owner__is_active=True)
        .first()
    )
    if post is None or post.moderation_status == "denied":
        return None
    return post, ("public" if post.moderation_status == "approved" else "pending")


def media_items(post):
    """The post's media in upload order: [{"url", "preview", "kind", "cover"}]."""
    items = []
    for media in sorted(post.media.all(), key=lambda m: m.id):
        name = str(media.file) if media.file else ""
        if not name:
            continue
        preview = media.preview.name if media.preview else ""
        is_video = PurePosixPath(urlsplit(name).path).suffix.lower() in VIDEO_EXTENSIONS
        items.append({
            "url": og.public_file_url(name),
            "preview": og.public_file_url(preview),
            "kind": "video" if is_video else "image",
            "cover": preview if is_video else name,  # storage name of a still image, if any
        })
    return items


def _cover(post):
    """(storage name, is_video) of the first media with a still image."""
    for item in media_items(post):
        if item["cover"]:
            return item["cover"], item["kind"] == "video"
    return "", False


def post_card_version(post, state) -> str:
    owner = post.owner
    public = state == "public"
    cover, _ = _cover(post) if public else ("", False)
    return og.version_hash(
        POST_DESIGN_VERSION, post.id, state, owner.username,
        owner.avatar.name if owner.avatar else "", bool(owner.official), bool(owner.seeker_verified),
        " ".join((post.about or "").split()) if public else "", cover, bool(post.is_luma_event) if public else "",
    )


def post_card_url(post, version: str) -> str:
    return f"{settings.PUBLIC_API_URL}/api/v1/posts/{post.id}/card.png?v={version}"


def get_post_card_png(post, state):
    """(png_bytes, version); the first request for a version renders and stores it."""
    version = post_card_version(post, state)
    context = f"post={post.id}"

    def render():
        owner = post.owner
        public = state == "public"
        cover_name, is_video = _cover(post) if public else ("", False)
        return render_post_card(
            owner.username,
            og.load_image(owner.avatar.name if owner.avatar else "", context),
            caption=(post.about or "") if public else "",
            cover=og.load_image(cover_name, context, max_side=1400) if cover_name else None,
            is_video=is_video,
            is_event=public and bool(post.is_luma_event),
            official=bool(owner.official),
            seeker=bool(owner.seeker_verified),
            pending=not public,
        )

    return og.stored_png(f"og/posts/{post.id}-v{version}.png", render, context), version


# ── Rendering ────────────────────────────────────────────────────────────

def render_post_card(username, avatar, *, caption="", cover=None, is_video=False, is_event=False,
                     official=False, seeker=False, pending=False) -> bytes:
    caption = " ".join((caption or "").split())
    if cover is not None:
        return _render_photo_card(username, avatar, caption, cover, is_video, is_event, official, seeker)
    return _render_text_card(username, avatar, caption, is_event, official, seeker, pending)


def _author_row(canvas, x, center_y, username, avatar, official, seeker, avatar_size, max_width):
    og.paste_avatar(canvas, avatar, (x, center_y - avatar_size // 2), avatar_size, ring=3, gap=4)
    text_x = x + avatar_size + 22
    badges = (["official"] if official else []) + (["seeker"] if seeker else [])
    face, text, size = og.fit_line(
        f"@{username}", max_width - (text_x - x), range(34, 21, -2),
        reserve=lambda s: sum(round(s * 0.9) + 8 for _ in badges),
    )
    ImageDraw.Draw(canvas, "RGBA").text((text_x, center_y), text, font=face, fill=og.WHITE, anchor="lm")
    badge_x = text_x + face.getlength(text) + 10
    for badge in badges:
        badge_size = round(size * 0.9)
        position = (round(badge_x), center_y - badge_size // 2 + 1)
        if badge == "official":
            og.paste_official_badge(canvas, position, badge_size)
        else:
            og.paste_seeker_badge(canvas, position, badge_size)
        badge_x += badge_size + 8


def _fit_caption(caption, max_width, options):
    """Largest (size, max_lines) whose wrap needs no ellipsis; else the last option."""
    style, caption = og.text_style(caption, bold=False)
    for size, max_lines in options:
        face = style.at(size)
        lines = og.wrap_lines(caption, face, max_width, max_lines)
        if not lines or not lines[-1].endswith("…"):
            return face, lines, size
    return face, lines, size


def _event_pill(canvas, xy):
    return og.pill(canvas, xy, "Event", (168, 85, 247, 40), (168, 85, 247, 130), og.LAVENDER, size=22, padding=(18, 10))


def _brand(canvas, x, center_y):
    """Mark + "NextVibe" + "nextvibe.io", left-aligned (photo layout footer)."""
    draw = ImageDraw.Draw(canvas, "RGBA")
    mark = Image.open(og.BRAND_MARK).convert("RGBA").resize((40, 40), Image.LANCZOS)
    canvas.paste(mark, (x, center_y - 21), mark)
    name_font = og.font(og.FONT_BOLD, 28)
    draw.text((x + 50, center_y), "NextVibe", font=name_font, fill=og.WHITE, anchor="lm")
    site_x = x + 50 + name_font.getlength("NextVibe") + 16
    draw.text((site_x, center_y), "nextvibe.io", font=og.font(og.FONT_VARIABLE, 24, weight=600),
              fill=(255, 255, 255, 140), anchor="lm")


def _render_photo_card(username, avatar, caption, cover, is_video, is_event, official, seeker):
    canvas = og.new_canvas((
        ((260, 300), 560, og.VIOLET, 0.5),
        ((620, 640), 300, og.MINT, 0.06),
    ))
    panel_width = og.WIDTH - PANEL_X
    backing = Image.new("RGBA", cover.size, og.BG + (255,))
    photo = Image.alpha_composite(backing, cover.convert("RGBA")).convert("RGB")
    photo = ImageOps.fit(photo, (panel_width, og.HEIGHT), Image.LANCZOS)
    fade = Image.linear_gradient("L").transpose(Image.Transpose.ROTATE_90).resize((FADE, og.HEIGHT))
    mask = Image.new("L", (panel_width, og.HEIGHT), 255)
    mask.paste(fade, (0, 0))
    canvas.paste(photo, (PANEL_X, 0), mask)
    if is_video:
        _play_badge(canvas, ((PANEL_X + FADE // 2 + og.WIDTH) // 2, og.HEIGHT // 2))

    draw = ImageDraw.Draw(canvas, "RGBA")
    x = og.MARGIN
    max_width = PANEL_X - x - 56
    if caption:
        face, lines, size = _fit_caption(caption, max_width, ((44, 3), (38, 4), (34, 5), (30, 6)))
    else:
        face, lines, size = og.font(og.FONT_BOLD, 44), ["Shared a new video" if is_video else "Shared a new photo"], 44
    line_height = round(size * 1.32)

    author_height, gap = 72, 36
    height = author_height + gap + len(lines) * line_height + (gap + 44 if is_event else 0)
    top = max(60, (og.HEIGHT - 90 - height) / 2)

    _author_row(canvas, x, round(top + author_height / 2), username, avatar, official, seeker, 64, max_width)
    y = top + author_height + gap
    for line in lines:
        if caption:
            draw.text((x, round(y + line_height / 2)), line, font=face, fill=og.WHITE, anchor="lm")
        else:
            og.gradient_text(canvas, (x - 2, round(y + line_height / 2)), line, face, og.WHITE, og.LAVENDER)
        y += line_height
    if is_event:
        _event_pill(canvas, (x, round(y + gap - 6)))

    _brand(canvas, x, og.HEIGHT - 64)
    return og.png_bytes(canvas)


def _render_text_card(username, avatar, caption, is_event, official, seeker, pending):
    canvas = og.new_canvas((
        ((300, 240), 600, og.VIOLET, 0.5),
        ((1120, 20), 420, og.ACCENT, 0.2),
        ((1180, 660), 320, og.MINT, 0.07),
    ))
    draw = ImageDraw.Draw(canvas, "RGBA")
    x = og.MARGIN
    max_width = og.WIDTH - og.MARGIN * 2

    quote = bool(caption) and not pending
    if quote:
        face, lines, size = _fit_caption(caption, max_width - 20, ((58, 2), (50, 3), (44, 3), (38, 4), (34, 4)))
        sub = ""
    else:
        # In review (nothing may be shown yet) or no caption and no picture
        face, lines, size = og.font(og.FONT_BOLD, 64), ["Shared a new post"], 64
        sub = "See it on NextVibe"
    line_height = round(size * 1.3)

    author_height, gap = 72, 44
    height = author_height + gap + len(lines) * line_height + (40 if sub else 0) + (gap + 44 if is_event else 0)
    top = max(56, (524 - height) / 2)

    _author_row(canvas, x, round(top + author_height / 2), username, avatar, official, seeker, 64, max_width)
    y = top + author_height + gap
    if quote:
        # Opening quote mark hanging in the left margin, level with the first line
        draw.text((x - 16, y + line_height / 2 - 4), "“", font=og.font(og.FONT_BOLD, 120),
                  fill=(168, 85, 247, 150), anchor="rt")
    for index, line in enumerate(lines):
        if not quote and index == 0:
            og.gradient_text(canvas, (x - 2, round(y + line_height / 2)), line, face, og.WHITE, og.LAVENDER)
        else:
            draw.text((x, round(y + line_height / 2)), line, font=face, fill=og.WHITE, anchor="lm")
        y += line_height
    if sub:
        draw.text((x, round(y + 14)), sub, font=og.font(og.FONT_VARIABLE, 30, weight=500),
                  fill=(255, 255, 255, 150), anchor="lm")
        y += 40
    if is_event:
        _event_pill(canvas, (x, round(y + gap - 10)))

    og.draw_footer(canvas)
    return og.png_bytes(canvas)


def _play_badge(canvas, center):
    size = 96
    x, y = center[0] - size // 2, center[1] - size // 2
    disc = og.circle_mask(size).point(lambda v: v * 150 // 255)
    canvas.paste(Image.new("RGB", (size, size), (10, 4, 16)), (x, y), disc)
    triangle = og.supersampled(size, lambda d, s: d.polygon(
        [(size * 0.40 * s, size * 0.30 * s), (size * 0.40 * s, size * 0.70 * s), (size * 0.72 * s, size * 0.50 * s)],
        fill=255,
    ))
    canvas.paste(Image.new("RGB", (size, size), og.WHITE), (x, y), triangle)
