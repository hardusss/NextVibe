"""Builds the on-chain SPL Memo string for a free collect."""

from django.utils.text import slugify

from ..constants import COLLECT_MAX_EDITIONS

MEMO_MAX_LEN = 120
EVENT_SLUG_MAX_LEN = 32


def build_memo(post, edition: int) -> str:
    """
    `NextVibe | claimed post <id> | ed. <n>/<total> | event: <slug>`

    The event segment is omitted when the post is not tied to an event.
    Always ASCII, at most MEMO_MAX_LEN chars.
    """
    total = post.total_supply or COLLECT_MAX_EDITIONS
    memo = f"NextVibe | claimed post {post.id} | ed. {edition}/{total}"

    if post.on_event_id:
        # Event posts have no dedicated title field; the first line of the
        # event's text is the closest thing to one.
        title = (post.on_event.about or "").strip().splitlines()
        slug = slugify(title[0])[:EVENT_SLUG_MAX_LEN].rstrip("-") if title else ""
        if slug:
            memo += f" | event: {slug}"

    return memo.encode("ascii", "ignore").decode("ascii")[:MEMO_MAX_LEN]
