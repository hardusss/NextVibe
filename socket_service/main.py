import logging
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
import json, base64, redis
from db import SessionLocal
from datetime import datetime
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

# Handlers
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
manager = ConnectionManager()  
r = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB
)

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
        logger.info(f"Headers: {websocket.headers}")
    else:
        logger.info(f"🔌 WebSocket connection from {websocket.client}")
    
    db = SessionLocal()
    token = websocket.query_params.get("token")
    
    if ENVIRONMENT == "development":
        logger.info(f"Token present: {bool(token)}")
        if token:
            logger.info(f"Token (first 20 chars): {token[:20]}...")

    if not token:
        logger.warning(f"❌ No token from {websocket.client}")
        await websocket.close(code=4401)
        return
    
    logger.debug("🔐 Authenticating token...")
    try:
        auth_user = auth_jwt(token=token)
        if ENVIRONMENT == "development":
            logger.info(f"Auth result: {auth_user}")
    except Exception as e:
        logger.error(f"❌ Auth exception: {e}", exc_info=(ENVIRONMENT == "development"))
        await websocket.close(code=4401)
        return
    
    if not auth_user["auth"]:
        logger.warning(f"❌ Authentication failed: {auth_user.get('detail', 'Unknown')}")
        await websocket.close(code=4401)
        return
    
    if auth_user.get("token_type") != "access":
        logger.warning(f"❌ Wrong token type: {auth_user.get('token_type')}")
        await websocket.close(code=4401)
        return
    
    user_id = auth_user.get("user_id")
    if not user_id:
        logger.warning(f"❌ No user_id in token")
        await websocket.close(code=4401)
        return

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        logger.warning(f"❌ Invalid user_id format: {user_id}")
        await websocket.close(code=4401)
        return
    
    logger.info(f"✅ User {user_id} authenticated")
    
    # Check limit connections 
    current_connections = manager.count_connections(user_id)
    
    if ENVIRONMENT == "development":
        logger.info(f"Current connections for user {user_id}: {current_connections}/{MAX_CONNECTIONS_PER_USER}")
    
    if current_connections >= MAX_CONNECTIONS_PER_USER:
        logger.warning(f"❌ User {user_id} exceeded max connections ({current_connections}/{MAX_CONNECTIONS_PER_USER})")
        await websocket.close(code=4408)
        return

    await manager.connect(websocket, user_id)
    logger.info(f"✅ User {user_id} connected (total: {manager.count_connections(user_id)})")

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
            logger.debug(f"📩 User {user_id}: {message_type}")

            if data.get("type") == "enter_chat":
                chat_id = data.get("chat_id")
                logger.info(f"👁️ User {user_id} entered chat {chat_id}")
                
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
                    logger.info(f"📖 User {user_id} read {len(unread_messages)} messages in chat {chat_id}")
                    for msg in unread_messages:
                        msg.is_read = True
                    db.commit()
                    
                    response_data = {
                        "type": "messages_read",
                        "chat_id": chat_id,
                        "reader_id": user_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast(json.dumps(response_data))

            elif data.get("type") == "read_status":
                chat_id = data.get("chat_id")
                logger.debug(f"📖 Read status: user {user_id}, chat {chat_id}")
                
                response_data = {
                    "type": "messages_read",
                    "chat_id": chat_id,
                    "reader_id": user_id
                }
                await manager.broadcast(json.dumps(response_data))

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                # New message
                chat_id = data.get("chat_id")
                
                chat = db.query(Chat).filter(Chat.id == chat_id).first()

                if not chat:
                    logger.warning(f"❌ User {user_id} -> non-existent chat {chat_id}")
                    await websocket.send_json({"error": "Chat not found"})
                    continue

                if user_id not in [u.user_id for u in chat.participants]:
                    logger.warning(f"❌ User {user_id} -> unauthorized chat {chat_id}")
                    await websocket.send_json({"type": "error", "detail": "Not allowed"})
                    continue

                message_text = data.get("message", "")
                media_list = data.get("media", [])

                message = Message(
                    chat_id=chat_id,
                    sender_id=user_id,
                    text=message_text,
                    created_at=datetime.utcnow(),
                    is_read=False
                )
                db.add(message)
                db.commit()
                db.refresh(message)
                
                logger.info(f"💬 User {user_id} -> chat {chat_id}: message {message.id}")

                # Clear cache
                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                # Process media
                media_attachments = []
                for idx, media in enumerate(media_list):
                    try:
                        if not isinstance(media, dict) or 'data' not in media or not media['data']:
                            continue

                        file_data = base64.b64decode(media['data'])
                        if len(file_data) > MAX_MEDIA_SIZE_MB * 1024 * 1024:
                            logger.warning(f"❌ User {user_id}: media {idx} too large")
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
                        
                        logger.info(f"📎 User {user_id}: uploaded {file_name}.{file_ext}")

                    except Exception as e:
                        logger.error(f"❌ Media upload error (user {user_id}, idx {idx}): {e}", 
                                   exc_info=(ENVIRONMENT == "development"))
                        db.rollback()

                response_data = {
                    "message_id": message.id,
                    "content": message.text,
                    "sender_id": user_id,
                    "chat_id": chat_id,
                    "created_at": message.created_at.isoformat(),
                    "is_read": False,
                    "media": media_attachments
                }

                await manager.broadcast(json.dumps(response_data))

    except WebSocketDisconnect:
        logger.info(f"👋 User {user_id} disconnected")
    except Exception as e:
        logger.error(f"❌ WebSocket error (user {user_id}): {e}", 
                    exc_info=(ENVIRONMENT == "development"))
        db.rollback()
    finally:
        manager.disconnect(websocket, user_id)
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.commit()
        db.close()
        logger.info(f"🔌 User {user_id} disconnected (remaining: {manager.count_connections(user_id)})")
