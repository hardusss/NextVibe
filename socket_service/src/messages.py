from fastapi import APIRouter, Depends, Query, HTTPException, Header
from sqlalchemy.orm import Session
from db import SessionLocal
from src.models import Chat, Message, User, MessageReaction, MessageReceipt
from typing import Optional, List, Dict
import redis
import json
from auth import auth_jwt
from config import settings

router = APIRouter()
MESSAGES_PER_PAGE = 20

r = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB
)

def get_messages_cache_key(chat_id: int, last_message_id: Optional[int]):
    return f"chat:{chat_id}:last:{last_message_id or 0}"

def invalidate_chat_cache(chat_id: int):
    try:
        # Use SCAN iteration instead of keys() scan anti-pattern
        cursor = 0
        pattern = f"chat:{chat_id}:*"
        while True:
            cursor, keys = r.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                r.delete(*keys)
            if cursor == 0:
                break
    except Exception:
        pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    auth_user = auth_jwt(token)
    if not auth_user["auth"] or auth_user["token_type"] != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return auth_user["user_id"]


@router.get("/messages/{chat_id}")
async def get_chat_messages(
    chat_id: int,
    last_message_id: Optional[int] = Query(None),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cache_key = get_messages_cache_key(chat_id, last_message_id)
    try:
        cached_data = r.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
    except Exception:
        pass
    
    chat = (
        db.query(Chat)
        .join(Chat.participants)
        .filter(Chat.id == chat_id, Chat.participants.any(user_id=user_id))
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found or access denied")
    
    messages_query = db.query(Message).filter(Message.chat_id == chat_id)
    if last_message_id:
        messages_query = messages_query.filter(Message.id < last_message_id)

    messages = (
        messages_query
        .order_by(Message.created_at.desc())
        .limit(MESSAGES_PER_PAGE)
        .all()
    )

    data = []
    for msg in messages:
        sender: User = msg.sender  
        
        # Build reactions summary
        reaction_summary: Dict[str, Dict] = {}
        for react in msg.reactions:
            if react.emoji not in reaction_summary:
                reaction_summary[react.emoji] = {"emoji": react.emoji, "count": 0, "reacted_by_me": False}
            reaction_summary[react.emoji]["count"] += 1
            if react.user_id == user_id:
                reaction_summary[react.emoji]["reacted_by_me"] = True

        # Build quote snippet if reply_to exists
        reply_snippet = None
        if msg.reply_to:
            reply_sender_name = f"User {msg.reply_to.sender_id}"
            if msg.reply_to.sender:
                reply_sender_name = getattr(msg.reply_to.sender, "username", reply_sender_name)
            reply_snippet = {
                "id": msg.reply_to.id,
                "sender_id": msg.reply_to.sender_id,
                "sender_name": reply_sender_name,
                "text": (msg.reply_to.text[:100] + "...") if msg.reply_to.text and len(msg.reply_to.text) > 100 else msg.reply_to.text,
                "is_deleted": msg.reply_to.deleted_at is not None
            }

        # Build receipt status
        receipts_data = [
            {
                "user_id": rcpt.user_id,
                "delivered_at": rcpt.delivered_at.isoformat() if rcpt.delivered_at else None,
                "read_at": rcpt.read_at.isoformat() if rcpt.read_at else None
            }
            for rcpt in msg.receipts
        ]

        data.append({
            "message_id": msg.id,
            "server_msg_id": msg.id,
            "client_msg_id": msg.client_msg_id,
            "reply_to_id": msg.reply_to_id,
            "reply_to_snippet": reply_snippet,
            "content": "[Message deleted]" if msg.deleted_at else msg.text,
            "sender_id": sender.user_id if sender else msg.sender_id,
            "created_at": msg.created_at.isoformat(),
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "deleted_at": msg.deleted_at.isoformat() if msg.deleted_at else None,
            "is_read": msg.is_read,
            "reactions": list(reaction_summary.values()),
            "receipts": receipts_data,
            "media": [
                {
                    "id": media.id,
                    "file_url": media.file_url
                }
                for media in msg.media
            ] if not msg.deleted_at else []
        })

    try:
        r.setex(cache_key, 30, json.dumps(data))
    except Exception:
        pass

    return data
