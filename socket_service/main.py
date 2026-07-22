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
from src.models import Message, MediaAttachment, User, Chat, UserOnlineSession
from src.messages import router as messages_router
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

            if message_type == "enter_chat":
                chat_id = data.get("chat_id")
                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if not chat or user_id not in [u.user_id for u in chat.participants]:
                    await websocket.send_json({"type": "error", "detail": "Not authorized or chat not found"})
                    continue

                # Clear cache
                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                # Mark messages as read
                unread_messages = (
                    db.query(Message)
                    .filter(Message.chat_id == chat_id)
                    .filter(Message.sender_id != user_id)
                    .filter(Message.is_read == False)
                    .all()
                )
                
                if unread_messages:
                    for msg in unread_messages:
                        msg.is_read = True
                    db.commit()
                    
                    participant_ids = [u.user_id for u in chat.participants]
                    response_data = {
                        "type": "messages_read",
                        "chat_id": chat_id,
                        "reader_id": user_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    # Workstream A2: Scoped Fan-Out to chat participants only!
                    await manager.send_to_users(participant_ids, response_data)

            elif message_type == "read_status":
                chat_id = data.get("chat_id")
                chat = db.query(Chat).filter(Chat.id == chat_id).first()
                if chat and user_id in [u.user_id for u in chat.participants]:
                    participant_ids = [u.user_id for u in chat.participants]
                    response_data = {
                        "type": "messages_read",
                        "chat_id": chat_id,
                        "reader_id": user_id
                    }
                    await manager.send_to_users(participant_ids, response_data)

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
                        {"id": m.id, "file_url": m.file_url} for m in message.media
                    ]
                else:
                    message = Message(
                        chat_id=chat_id,
                        sender_id=user_id,
                        client_msg_id=client_msg_id,
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

                    # Process media
                    media_list = data.get("media", [])
                    media_attachments = []
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
                                'file_url': file_url
                            })

                        except Exception as e:
                            logger.error(f"❌ Media upload error: {e}")
                            db.rollback()

                # Workstream A3: Standardized envelope format
                response_envelope = {
                    "type": "message",
                    "client_msg_id": message.client_msg_id,
                    "server_msg_id": message.id,
                    "message_id": message.id,  # backward compatibility
                    "chat_id": chat_id,
                    "sender_id": user_id,
                    "content": message.text,
                    "created_at": message.created_at.isoformat(),
                    "is_read": message.is_read,
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
