from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
import json, base64, redis
from db import SessionLocal
from datetime import datetime
from src.models import Message, MediaAttachment, User  
from src.messages import router as messages_router
from r2_storage import r2_storage  

app = FastAPI()
manager = ConnectionManager()  
r = redis.Redis(host='localhost', port=6379, db=0)

app.include_router(messages_router, prefix="/api/v1", tags=["Messages"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH", "PUT"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    db = SessionLocal()
    await manager.connect(websocket, user_id)

    user = db.query(User).filter(User.user_id == user_id).first()
    if user:
        user.is_online = True
        db.commit()

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "enter_chat":
                chat_id = data.get("chat_id")
                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

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
                    
                    response_data = {
                        "type": "messages_read",
                        "chat_id": chat_id,
                        "reader_id": user_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast(json.dumps(response_data))

            elif data.get("type") == "read_status":
                chat_id = data.get("chat_id")
                response_data = {
                    "type": "messages_read",
                    "chat_id": chat_id,
                    "reader_id": user_id
                }
                await manager.broadcast(json.dumps(response_data))

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                chat_id = data.get("chat_id")
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

                keys = r.keys(f"chat:{chat_id}:*")
                if keys:
                    r.delete(*keys)

                media_attachments = []
                if media_list:
                    for idx, media in enumerate(media_list):
                        try:
                            print(f"  Media {idx}: {media.keys() if isinstance(media, dict) else type(media)}")
                            
                            if not isinstance(media, dict):
                                print(f"  ⚠️ Media {idx} is not a dict, skipping")
                                continue
                                
                            if 'data' not in media:
                                print(f"  ⚠️ Media {idx} has no 'data' key, skipping")
                                continue
                            
                            if not media['data']:
                                print(f"  ⚠️ Media {idx} 'data' is empty, skipping")
                                continue

                            file_data = base64.b64decode(media['data'])

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
                            print(f"❌ Error saving media {idx}: {str(e)}")
                            import traceback
                            traceback.print_exc()
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
        print(f"🔴 User {user_id} disconnected")
    except Exception as e:
        print(f"❌ Error in WebSocket for user {user_id}: {e}")
        db.rollback()
    finally:
        manager.disconnect(websocket, user_id)
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.commit()
        db.close()