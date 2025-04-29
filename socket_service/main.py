from src import get_chat_messages, save_message
from fastapi import FastAPI, WebSocket
from sqlalchemy.orm import Session
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
import json
from db import SessionLocal


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
            message_data = await websocket.receive_json()  
            chat_id = message_data.get("chat_id")
            message = message_data.get("message")
            
            saved_message = save_message(db, user_id, chat_id, message)
        
            await manager.broadcast(
                    message=json.dumps({
                        "user_id": user_id,
                        "chat_id": chat_id,
                        "message": message,
                        "created_at": saved_message.created_at.isoformat()
                    }),
                    user_id=user_id
                )

    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        manager.disconnect(websocket, user_id)
        db.close()
