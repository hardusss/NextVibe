from typing import Iterable

from db import SessionLocal
from src.models import Block


def is_chat_blocked(participant_ids: Iterable[int]) -> bool:
    """True if any two chat participants blocked each other. Such a chat is
    hidden and delivers nothing in either direction."""
    ids = set(participant_ids)
    if len(ids) < 2:
        return False
    # A short-lived session of its own: a websocket keeps one session open for
    # the whole connection, and its read snapshot can predate a new block.
    db = SessionLocal()
    try:
        return db.query(Block.id).filter(
            Block.blocker_id.in_(ids),
            Block.blocked_id.in_(ids),
        ).first() is not None
    finally:
        db.close()
