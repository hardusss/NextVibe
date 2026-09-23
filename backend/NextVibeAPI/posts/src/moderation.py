"""
Synchronous checks against the Go moderation service (moderation_service/,
OpenAI omni-moderation), for content that must be checked before anyone
sees it: Proof of Meet photos and captions.

The service answers inline and also posts its result to
/api/v1/posts/moderation-callback/, which ignores ids that aren't post ids
(REF_PREFIX below). A check that couldn't run (service down, OpenAI error)
raises ModerationUnavailable instead of counting as a failure, so nobody's
photo is refused because of an outage.
"""
import logging

import requests

logger = logging.getLogger("posts.moderation")

MODERATION_URL = "http://127.0.0.1:8080/moderation"  # same service as posts.tasks
REF_PREFIX = "meet-photo-"
TIMEOUT = (3, 30)
# Reasons the Go service gives when the check itself failed, not the content
_NOT_A_VERDICT = {"network_error", "api_error", "internal_error", "parsing_error", "api_key_missing"}


class ModerationUnavailable(Exception):
    pass


def _check(ref: str, content: str, media_urls: list) -> dict:
    try:
        response = requests.post(
            MODERATION_URL,
            json={"id": f"{REF_PREFIX}{ref}", "content": content, "media_urls": media_urls},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.warning("moderation.unavailable ref=%s: %s", ref, e)
        raise ModerationUnavailable() from e


def _verdict(result: dict, ref: str) -> bool:
    if result.get("passed"):
        return True
    reason = result.get("category") or ""
    reasons = {part.strip() for part in reason.split(",") if part.strip()}
    if reasons and reasons <= _NOT_A_VERDICT:
        logger.warning("moderation.no_verdict ref=%s reason=%s", ref, reason)
        raise ModerationUnavailable()
    logger.info("moderation.flagged ref=%s reason=%s", ref, reason)
    return False


def image_passes(image_url: str, ref: str) -> bool:
    """True when the image passes; False when it's flagged."""
    files = _check(ref, "", [image_url]).get("files") or []
    if not files:
        raise ModerationUnavailable()
    return _verdict(files[0], ref)


def text_passes(text: str, ref: str) -> bool:
    """True when the text passes (or is empty); False when it's flagged."""
    if not text.strip():
        return True
    return _verdict(_check(ref, text, []).get("text") or {}, ref)
