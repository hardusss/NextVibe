from fastapi import APIRouter, Depends, Query, HTTPException, Header
from sqlalchemy.orm import Session
from db import SessionLocal
from src.models import Chat, Message, User
from typing import Optional
import redis
import json
from auth import auth_jwt


router = APIRouter()
MESSAGES_PER_PAGE = 18

r = redis.Redis(host='localhost', port=6379, db=0)

def get_messages_cache_key(chat_id: int, last_message_id: Optional[int]):
    return f"chat:{chat_id}:last:{last_message_id or 0}"

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
    cached_data = r.get(cache_key)
    if cached_data:
        return json.loads(cached_data)
    
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
        data.append({
            "message_id": msg.id,
            "content": msg.text,
            "sender_id": sender.user_id,
            "created_at": msg.created_at.isoformat(),
            "is_read": msg.is_read,
            "media": [
                {
                    "id": media.id,
                    "file_url": media.file_url
                }
                for media in msg.media
            ]
        })

    r.setex(cache_key, 30, json.dumps(data))
    return list(data)
