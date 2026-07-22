from fastapi import APIRouter, Depends, Query, HTTPException, Header
from sqlalchemy.orm import Session
from db import SessionLocal
from src.models import Chat, Message, User, MessageReaction, MessageReceipt
from typing import Optional, List, Dict
import redis
import json
from auth import auth_jwt
from config import settings

from pydantic import BaseModel, Field
from datetime import datetime
import uuid
from r2_storage import r2_storage

router = APIRouter()
MESSAGES_PER_PAGE = 20

r = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB
)

class UploadUrlRequest(BaseModel):
    chat_id: int
    filename: str
    content_type: str = "application/octet-stream"
    file_size: int

class ReactionRequest(BaseModel):
    emoji: str = Field(..., max_length=32)

class EditMessageRequest(BaseModel):
    text: str

def get_messages_cache_key(chat_id: int, last_message_id: Optional[int]):
    return f"chat:{chat_id}:last:{last_message_id or 0}"

def invalidate_chat_cache(chat_id: int):
    try:
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
                    "file_url": media.file_url,
                    "preview_url": media.preview_url
                }
                for media in msg.media
            ] if not msg.deleted_at else []
        })

    try:
        r.setex(cache_key, 30, json.dumps(data))
    except Exception:
        pass

    return data


@router.post("/media/upload-url")
async def get_media_upload_url(
    req: UploadUrlRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(Chat.id == req.chat_id).first()
    if not chat or user_id not in [u.user_id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Not authorized or chat not found")

    max_bytes = settings.MAX_MEDIA_SIZE_MB * 1024 * 1024
    if req.file_size > max_bytes:
        raise HTTPException(status_code=400, detail=f"File size exceeds limit of {settings.MAX_MEDIA_SIZE_MB}MB")

    ext = req.filename.split(".")[-1] if "." in req.filename else "bin"
    media_key = f"chat_media/chat_{req.chat_id}_{uuid.uuid4().hex}.{ext}"
    upload_url = r2_storage.generate_presigned_upload_url(media_key, req.content_type)
    file_url = f"https://{r2_storage.custom_domain or 'media.nextvibe.io'}/{media_key}"

    return {
        "upload_url": upload_url,
        "media_key": media_key,
        "file_url": file_url
    }


@router.post("/messages/{message_id}/reactions")
async def add_reaction(
    message_id: int,
    req: ReactionRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    chat = db.query(Chat).filter(Chat.id == message.chat_id).first()
    if not chat or user_id not in [u.user_id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id,
        MessageReaction.emoji == req.emoji
    ).first()

    if not existing:
        reaction = MessageReaction(
            message_id=message_id,
            user_id=user_id,
            emoji=req.emoji,
            created_at=datetime.utcnow()
        )
        db.add(reaction)
        db.commit()

    invalidate_chat_cache(message.chat_id)

    # Build reaction summary
    reactions = db.query(MessageReaction).filter(MessageReaction.message_id == message_id).all()
    summary: Dict[str, Dict] = {}
    for r_item in reactions:
        if r_item.emoji not in summary:
            summary[r_item.emoji] = {"emoji": r_item.emoji, "count": 0, "reacted_by_me": False}
        summary[r_item.emoji]["count"] += 1
        if r_item.user_id == user_id:
            summary[r_item.emoji]["reacted_by_me"] = True

    return {"message_id": message_id, "reactions": list(summary.values())}


@router.delete("/messages/{message_id}/reactions/{emoji}")
async def remove_reaction(
    message_id: int,
    emoji: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    chat = db.query(Chat).filter(Chat.id == message.chat_id).first()
    if not chat or user_id not in [u.user_id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Not authorized")

    reaction = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id,
        MessageReaction.emoji == emoji
    ).first()

    if reaction:
        db.delete(reaction)
        db.commit()

    invalidate_chat_cache(message.chat_id)

    reactions = db.query(MessageReaction).filter(MessageReaction.message_id == message_id).all()
    summary: Dict[str, Dict] = {}
    for r_item in reactions:
        if r_item.emoji not in summary:
            summary[r_item.emoji] = {"emoji": r_item.emoji, "count": 0, "reacted_by_me": False}
        summary[r_item.emoji]["count"] += 1
        if r_item.user_id == user_id:
            summary[r_item.emoji]["reacted_by_me"] = True

    return {"message_id": message_id, "reactions": list(summary.values())}


@router.patch("/messages/{message_id}")
async def edit_message(
    message_id: int,
    req: EditMessageRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user_id:
        raise HTTPException(status_code=403, detail="Only sender can edit message")

    if message.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")

    # Time window check (15 minutes = 900 seconds)
    time_diff = (datetime.utcnow() - message.created_at).total_seconds()
    if time_diff > 900:
        raise HTTPException(status_code=400, detail="Message edit window (15 mins) expired")

    message.text = req.text
    message.edited_at = datetime.utcnow()
    db.commit()

    invalidate_chat_cache(message.chat_id)

    return {
        "message_id": message.id,
        "content": message.text,
        "edited_at": message.edited_at.isoformat()
    }


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != user_id:
        raise HTTPException(status_code=403, detail="Only sender can delete message")

    if message.deleted_at is None:
        message.deleted_at = datetime.utcnow()
        db.commit()

    invalidate_chat_cache(message.chat_id)

    return {
        "message_id": message.id,
        "deleted_at": message.deleted_at.isoformat()
    }

