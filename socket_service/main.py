from src import get_chat_messages, save_message
from fastapi import FastAPI, WebSocket
from sqlalchemy.orm import Session
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
import json, os, base64
from db import SessionLocal
from datetime import datetime
from src.models import Message, MediaAttachment

app = FastAPI()
manager = ConnectionManager()  

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
        
@app.get("/messages/{chat_id}")
async def read_chat_messages(chat_id: int, db: Session = Depends(get_db)):
    messages = get_chat_messages(chat_id, db)
    return messages

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    db = SessionLocal()
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "enter_chat":
                chat_id = data.get("chat_id")
                # Знаходимо всі непрочитані повідомлення в чаті від іншого користувача
                unread_messages = (
                    db.query(Message)
                    .filter(Message.chat_id == chat_id)
                    .filter(Message.sender_id != user_id)
                    .filter(Message.is_read == False)
                    .all()
                )
                
                if unread_messages:
                    # Позначаємо всі як прочитані
                    for msg in unread_messages:
                        msg.is_read = True
                    db.commit()
                    
                    # Відправляємо статус прочитання
                    response_data = {
                        "type": "messages_read",
                        "chat_id": chat_id,
                        "reader_id": user_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast(json.dumps(response_data))

            elif data.get("type") == "read_status":
                chat_id = data.get("chat_id")
                # Відправляємо всім у чаті оновлення статусу
                response_data = {
                    "type": "messages_read",
                    "chat_id": chat_id,
                    "reader_id": user_id
                }
                await manager.broadcast(json.dumps(response_data))
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

                media_attachments = []
                if media_list:
                    media_path = "../backend/NextVibeAPI/media/chat_media"
                    os.makedirs(media_path, exist_ok=True)

                    for media in media_list:
                        try:
                            file_data = base64.b64decode(media['data'])
                            file_name = f"message_{message.id}_{len(media_attachments)}"
                            file_ext = "jpg" if "image" in media['type'] else "mp4"
                            relative_path = f"chat_media/{file_name}.{file_ext}"
                            full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend/NextVibeAPI/media', relative_path)
                            
                            with open(full_path, 'wb') as f:
                                f.write(file_data)

                            media_attachment = MediaAttachment(
                                message_id=message.id,
                                file=relative_path
                            )
                            db.add(media_attachment)
                            db.commit()
                            db.refresh(media_attachment)

                            media_attachments.append({
                                'id': media_attachment.id,
                                'file_url': f"/media/{relative_path}"
                            })
                        except Exception as e:
                            print(f"Error saving media: {str(e)}")
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

    except Exception as e:
        db.rollback()
    finally:
        manager.disconnect(websocket, user_id)
        db.close()
