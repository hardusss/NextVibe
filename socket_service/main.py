import logging
import os
import uuid
import json
import base64
import redis
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
from db import SessionLocal
from src.models import Message, MediaAttachment, User, Chat, UserOnlineSession, MessageReaction, MessageReceipt
from src.messages import router as messages_router
from src.keys import router as keys_router
from r2_storage import r2_storage  
from auth import auth_jwt
from config import settings

ENVIRONMENT = settings.ENVIRONMENT
LOG_LEVEL = settings.LOG_LEVEL
MAX_MEDIA_SIZE_MB = settings.MAX_MEDIA_SIZE_MB
MAX_CONNECTIONS_PER_USER = settings.MAX_CONNECTIONS_PER_USER
CORS_ORIGINS = settings.CORS_ORIGINS

if not os.path.exists('logs'):
    os.makedirs('logs')

log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

handlers = [
    logging.StreamHandler(), 
]

if ENVIRONMENT == "production":
    handlers.append(
        logging.FileHandler('logs/websocket.log', encoding='utf-8')
    )

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=log_format,
    handlers=handlers
)

logger = logging.getLogger("websocket")
logger.info(f"🚀 WebSocket server starting in {ENVIRONMENT} mode (log level: {LOG_LEVEL})")

app = FastAPI()
r = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB
)
manager = ConnectionManager(redis_client=r)


@app.on_event("startup")
async def startup_event():
    manager.set_redis(r)
    await manager.init_async_redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB
    )
    logger.info("🚀 ConnectionManager Redis PubSub initialized")


@app.on_event("shutdown")
async def shutdown_event():
    await manager.close()
    logger.info("🔌 ConnectionManager closed")


app.include_router(messages_router, prefix="/api/v2", tags=["Messages"])
app.include_router(keys_router, prefix="/api/v2", tags=["Keys"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,  
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH", "PUT"],
    allow_headers=["*"],
    expose_headers=["*"] 
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    if ENVIRONMENT == "development":
        logger.info("=" * 60)
        logger.info("🔌 New WebSocket connection attempt")
        logger.info(f"Client: {websocket.client}")
    else:
        logger.info(f"🔌 WebSocket connection from {websocket.client}")
    
    db = SessionLocal()
    token = websocket.query_params.get("token")
    
    if not token:
        logger.warning(f"❌ No token from {websocket.client}")
        await websocket.close(code=4401)
        return
    
    try:
        auth_user = auth_jwt(token=token)
    except Exception as e:
        logger.error(f"❌ Auth exception: {e}")
        await websocket.close(code=4401)
        return
    
    if not auth_user["auth"] or auth_user.get("token_type") != "access":
        logger.warning(f"❌ Auth failed or wrong token type: {auth_user}")
        await websocket.close(code=4401)
        return
    
    user_id = auth_user.get("user_id")
    if not user_id:
        await websocket.close(code=4401)
        return

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        await websocket.close(code=4401)
        return
    
    # Connection limit per user
    current_connections = manager.count_connections(user_id)
    if current_connections >= MAX_CONNECTIONS_PER_USER:
        logger.warning(f"❌ User {user_id} exceeded max connections ({current_connections}/{MAX_CONNECTIONS_PER_USER})")
        await websocket.close(code=4408)
        return

    conn_id = await manager.connect(websocket, user_id)
    logger.info(f"✅ User {user_id} connected (conn_id: {conn_id})")

    user = db.query(User).filter(User.user_id == user_id).first()
    if user:
        user.is_online = True
        session = UserOnlineSession(user_id=user_id, connected_at=datetime.utcnow())
        db.add(session)
        db.commit()

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get('type', 'message')

            # Rate Limiting check (Workstream A4)
            if not manager.check_rate_limit(user_id, settings.MAX_EVENTS_PER_SECOND):
                logger.warning(f"⚠️ Rate limit exceeded for user {user_id}")
                await websocket.send_json({
                    "type": "error",
                    "code": "rate_limited",
                    "detail": "Rate limit exceeded. Please slow down."
                })
                continue

            if message_type in ("enter_chat", "mark_read", "read_status"):
                chat_id = data.get("chat_id")
                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if not chat or user_id not in [u.user_id for u in chat.participants]:
                    await websocket.send_json({"type": "error", "detail": "Not authorized or chat not found"})
                    continue

                # Clear cache
                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                # Fetch all messages in chat sent by others
                messages_in_chat = (
                    db.query(Message)
                    .filter(Message.chat_id == chat_id)
                    .filter(Message.sender_id != user_id)
                    .all()
                )

                read_msg_ids = []
                now = datetime.utcnow()
                for msg in messages_in_chat:
                    rcpt = db.query(MessageReceipt).filter(
                        MessageReceipt.message_id == msg.id,
                        MessageReceipt.user_id == user_id
                    ).first()
                    if not rcpt:
                        rcpt = MessageReceipt(message_id=msg.id, user_id=user_id, delivered_at=now, read_at=now)
                        db.add(rcpt)
                        read_msg_ids.append(msg.id)
                    elif not rcpt.read_at:
                        rcpt.read_at = now
                        if not rcpt.delivered_at:
                            rcpt.delivered_at = now
                        read_msg_ids.append(msg.id)
                    msg.is_read = True

                if read_msg_ids:
                    db.commit()

                participant_ids = [u.user_id for u in chat.participants]
                response_data = {
                    "type": "read_receipt",
                    "chat_id": chat_id,
                    "reader_id": user_id,
                    "message_ids": read_msg_ids,
                    "read_at": now.isoformat(),
                    "timestamp": now.isoformat()
                }
                await manager.send_to_users(participant_ids, response_data)

            elif message_type in ("reaction_add", "reaction_remove"):
                chat_id = data.get("chat_id")
                message_id = data.get("message_id")
                emoji = data.get("emoji")

                if not chat_id or not message_id or not emoji:
                    await websocket.send_json({"type": "error", "detail": "Missing chat_id, message_id or emoji"})
                    continue

                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if not chat or user_id not in [u.user_id for u in chat.participants]:
                    await websocket.send_json({"type": "error", "detail": "Not authorized"})
                    continue

                message = db.query(Message).filter(Message.id == message_id, Message.chat_id == chat_id).first()
                if not message:
                    await websocket.send_json({"type": "error", "detail": "Message not found"})
                    continue

                if message_type == "reaction_add":
                    existing = db.query(MessageReaction).filter(
                        MessageReaction.message_id == message_id,
                        MessageReaction.user_id == user_id,
                        MessageReaction.emoji == emoji
                    ).first()
                    if not existing:
                        db.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji, created_at=datetime.utcnow()))
                        db.commit()
                else:
                    existing = db.query(MessageReaction).filter(
                        MessageReaction.message_id == message_id,
                        MessageReaction.user_id == user_id,
                        MessageReaction.emoji == emoji
                    ).first()
                    if existing:
                        db.delete(existing)
                        db.commit()

                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                reactions = db.query(MessageReaction).filter(MessageReaction.message_id == message_id).all()
                summary = {}
                for r_item in reactions:
                    if r_item.emoji not in summary:
                        summary[r_item.emoji] = {"emoji": r_item.emoji, "count": 0, "reacted_by_me": False}
                    summary[r_item.emoji]["count"] += 1
                    if r_item.user_id == user_id:
                        summary[r_item.emoji]["reacted_by_me"] = True

                participant_ids = [u.user_id for u in chat.participants]
                await manager.send_to_users(participant_ids, {
                    "type": "reaction_update",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "reactions": list(summary.values())
                })

            elif message_type in ("typing_start", "typing_stop"):
                chat_id = data.get("chat_id")
                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if chat and user_id in [u.user_id for u in chat.participants]:
                    is_typing = (message_type == "typing_start")
                    redis_key = f"typing:{chat_id}:{user_id}"
                    if is_typing:
                        r.setex(redis_key, 5, "1")
                    else:
                        r.delete(redis_key)

                    participant_ids = [u.user_id for u in chat.participants if u.user_id != user_id]
                    await manager.send_to_users(participant_ids, {
                        "type": "typing_status",
                        "chat_id": chat_id,
                        "user_id": user_id,
                        "is_typing": is_typing
                    })

            elif message_type in ("webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"):
                chat_id = data.get("chat_id")
                target_user_id = data.get("target_user_id")

                if not chat_id or not target_user_id:
                    await websocket.send_json({"type": "error", "detail": "Missing chat_id or target_user_id"})
                    continue

                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if not chat or user_id not in [u.user_id for u in chat.participants]:
                    await websocket.send_json({"type": "error", "detail": "Not authorized"})
                    continue

                if target_user_id not in [u.user_id for u in chat.participants]:
                    await websocket.send_json({"type": "error", "detail": "Target user not in chat"})
                    continue

                # Forward signaling payload directly to target user
                signal_payload = {
                    "type": message_type,
                    "chat_id": chat_id,
                    "sender_user_id": user_id,
                    "target_user_id": target_user_id,
                    "sdp": data.get("sdp"),
                    "candidate": data.get("candidate"),
                    "timestamp": datetime.utcnow().isoformat()
                }
                await manager.send_to_users([target_user_id], signal_payload)

            elif message_type == "edit_message":
                chat_id = data.get("chat_id")
                message_id = data.get("message_id")
                new_text = data.get("text", "")

                message = db.query(Message).filter(Message.id == message_id, Message.chat_id == chat_id).first()
                if not message:
                    await websocket.send_json({"type": "error", "detail": "Message not found"})
                    continue

                if message.sender_id != user_id:
                    await websocket.send_json({"type": "error", "detail": "Only sender can edit message"})
                    continue

                if message.deleted_at is not None:
                    await websocket.send_json({"type": "error", "detail": "Cannot edit deleted message"})
                    continue

                if (datetime.utcnow() - message.created_at).total_seconds() > 900:
                    await websocket.send_json({"type": "error", "detail": "Edit time window expired"})
                    continue

                message.text = new_text
                message.edited_at = datetime.utcnow()
                db.commit()

                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                participant_ids = [u.user_id for u in message.chat.participants]
                await manager.send_to_users(participant_ids, {
                    "type": "message_edited",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "server_msg_id": message_id,
                    "content": new_text,
                    "edited_at": message.edited_at.isoformat()
                })

            elif message_type == "delete_message":
                chat_id = data.get("chat_id")
                message_id = data.get("message_id")

                message = db.query(Message).filter(Message.id == message_id, Message.chat_id == chat_id).first()
                if not message:
                    await websocket.send_json({"type": "error", "detail": "Message not found"})
                    continue

                if message.sender_id != user_id:
                    await websocket.send_json({"type": "error", "detail": "Only sender can delete message"})
                    continue

                message.deleted_at = datetime.utcnow()
                db.commit()

                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                participant_ids = [u.user_id for u in message.chat.participants]
                await manager.send_to_users(participant_ids, {
                    "type": "message_deleted",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "server_msg_id": message_id,
                    "deleted_at": message.deleted_at.isoformat()
                })

            elif message_type == "ping":
                manager.refresh_presence(user_id, conn_id)
                await websocket.send_json({"type": "pong"})

            else:
                # New message flow
                chat_id = data.get("chat_id")
                chat = db.query(Chat).filter(Chat.id == chat_id).first()

                if not chat:
                    await websocket.send_json({"type": "error", "detail": "Chat not found"})
                    continue

                participant_ids = [u.user_id for u in chat.participants]
                if user_id not in participant_ids:
                    await websocket.send_json({"type": "error", "detail": "Not allowed"})
                    continue

                reply_to_id = data.get("reply_to_id")
                if reply_to_id:
                    reply_msg = db.query(Message).filter(Message.id == reply_to_id, Message.chat_id == chat_id).first()
                    if not reply_msg:
                        await websocket.send_json({"type": "error", "detail": "Invalid reply_to_id"})
                        continue

                message_text = data.get("message") or data.get("content", "")
                if len(message_text) > settings.MAX_TEXT_LENGTH:
                    await websocket.send_json({
                        "type": "error",
                        "code": "payload_too_large",
                        "detail": f"Message text exceeds maximum allowed length of {settings.MAX_TEXT_LENGTH}"
                    })
                    continue

                client_msg_id = data.get("client_msg_id") or str(uuid.uuid4())

                # Workstream A3: Idempotency check
                existing_message = db.query(Message).filter(
                    Message.chat_id == chat_id,
                    Message.sender_id == user_id,
                    Message.client_msg_id == client_msg_id
                ).first()

                if existing_message:
                    message = existing_message
                    media_attachments = [
                        {"id": m.id, "file_url": m.file_url, "preview_url": m.preview_url} for m in message.media
                    ]
                else:
                    message = Message(
                        chat_id=chat_id,
                        sender_id=user_id,
                        client_msg_id=client_msg_id,
                        reply_to_id=reply_to_id,
                        text=message_text,
                        created_at=datetime.utcnow(),
                        is_read=False
                    )
                    db.add(message)
                    db.commit()
                    db.refresh(message)

                    # Clear cache
                    keys = r.keys(f"chat:{chat_id}:*")
                    if keys:
                        r.delete(*keys)

                    media_attachments = []

                    # 1. Process off-WS pre-signed upload media_keys (Workstream C1)
                    media_keys = data.get("media_keys", [])
                    for key in media_keys:
                        if r2_storage.verify_object_exists(key):
                            media_attachment = MediaAttachment(
                                message_id=message.id,
                                file=key
                            )
                            db.add(media_attachment)
                            db.commit()
                            db.refresh(media_attachment)
                            media_attachments.append({
                                'id': media_attachment.id,
                                'file_url': media_attachment.file_url,
                                'preview_url': media_attachment.preview_url
                            })

                    # 2. Legacy base64 media fallback
                    media_list = data.get("media", [])
                    for idx, media in enumerate(media_list):
                        try:
                            if not isinstance(media, dict) or 'data' not in media or not media['data']:
                                continue

                            file_data = base64.b64decode(media['data'])
                            if len(file_data) > MAX_MEDIA_SIZE_MB * 1024 * 1024:
                                continue

                            file_name = f"message_{message.id}_{len(media_attachments)}"
                            file_ext = "jpg" if "image" in media.get('type', '') else "mp4"
                            relative_path = f"chat_media/{file_name}.{file_ext}"
                            content_type = "image/jpeg" if "image" in media.get('type', '') else "video/mp4"
                            file_url = r2_storage.upload_file(file_data, relative_path, content_type)

                            media_attachment = MediaAttachment(
                                message_id=message.id,
                                file=relative_path
                            )
                            db.add(media_attachment)
                            db.commit()
                            db.refresh(media_attachment)
                            
                            media_attachments.append({
                                'id': media_attachment.id,
                                'file_url': file_url,
                                'preview_url': media_attachment.preview_url
                            })

                        except Exception as e:
                            logger.error(f"❌ Media upload error: {e}")
                            db.rollback()

                    # Receipts creation
                    now = datetime.utcnow()
                    sender_rcpt = MessageReceipt(message_id=message.id, user_id=user_id, delivered_at=now, read_at=now)
                    db.add(sender_rcpt)

                    delivered_user_ids = []
                    for p in chat.participants:
                        if p.user_id != user_id:
                            if manager.is_user_online(p.user_id):
                                db.add(MessageReceipt(message_id=message.id, user_id=p.user_id, delivered_at=now))
                                delivered_user_ids.append(p.user_id)
                    db.commit()

                # Build quote snippet if reply_to exists
                reply_snippet = None
                if message.reply_to:
                    reply_sender_name = f"User {message.reply_to.sender_id}"
                    if message.reply_to.sender:
                        reply_sender_name = getattr(message.reply_to.sender, "username", reply_sender_name)
                    reply_snippet = {
                        "id": message.reply_to.id,
                        "sender_id": message.reply_to.sender_id,
                        "sender_name": reply_sender_name,
                        "text": (message.reply_to.text[:100] + "...") if message.reply_to.text and len(message.reply_to.text) > 100 else message.reply_to.text,
                        "is_deleted": message.reply_to.deleted_at is not None
                    }

                # Receipts payload
                receipts_data = [
                    {
                        "user_id": rcpt.user_id,
                        "delivered_at": rcpt.delivered_at.isoformat() if rcpt.delivered_at else None,
                        "read_at": rcpt.read_at.isoformat() if rcpt.read_at else None
                    }
                    for rcpt in message.receipts
                ]

                # Workstream A3 & Phase 2: Standardized envelope format
                response_envelope = {
                    "type": "message",
                    "client_msg_id": message.client_msg_id,
                    "server_msg_id": message.id,
                    "message_id": message.id,  # backward compatibility
                    "chat_id": chat_id,
                    "sender_id": user_id,
                    "content": message.text,
                    "reply_to_id": message.reply_to_id,
                    "reply_to_snippet": reply_snippet,
                    "created_at": message.created_at.isoformat(),
                    "edited_at": message.edited_at.isoformat() if message.edited_at else None,
                    "deleted_at": message.deleted_at.isoformat() if message.deleted_at else None,
                    "is_read": message.is_read,
                    "reactions": [],
                    "receipts": receipts_data,
                    "media": media_attachments,
                    "ts": message.created_at.isoformat()
                }

                # Workstream A2: Scoped fan-out to chat participants ONLY
                await manager.send_to_users(participant_ids, response_envelope)

    except WebSocketDisconnect:
        logger.info(f"👋 User {user_id} disconnected")
    except Exception as e:
        logger.error(f"❌ WebSocket error (user {user_id}): {e}")
        db.rollback()
    finally:
        manager.disconnect(websocket, user_id, conn_id)
        if not manager.is_user_online(user_id):
            user = db.query(User).filter(User.user_id == user_id).first()
            if user:
                user.is_online = False
                user.last_seen = datetime.utcnow()
                db.commit()
        db.close()
