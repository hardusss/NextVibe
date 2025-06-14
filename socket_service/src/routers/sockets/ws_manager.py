from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from src.models import User, Message
from typing import Dict, Set
from datetime import datetime

app = FastAPI()

class WSM:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.chat_participants: Dict[int, Set[int]] = {}  # chat_id -> set of user_ids

    async def connect(self, websocket: WebSocket, user_id: int, db: Session):
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

        try:
            user = db.query(User).filter(User.user_id == user_id).first()
            if user:
                user.is_active = True
                db.commit()

            # Check for unread messages and mark them as read
            unread_messages = (
                db.query(Message)
                .filter(Message.receiver_id == user_id)
                .filter(Message.is_read == False)
                .all()
            )

            if unread_messages:
                for msg in unread_messages:
                    msg.is_read = True
                    # Notify sender that message was read
                    if msg.sender_id in self.active_connections:
                        read_notification = {
                            "type": "message_read",
                            "message_id": msg.id,
                            "chat_id": msg.chat_id,
                            "reader_id": user_id,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        for ws in self.active_connections[msg.sender_id]:
                            await ws.send_json(read_notification)
                db.commit()

            while True:
                data = await websocket.receive_text()
                print(f"Received data from user {user_id}: {data}")
                await websocket.send_text(f"Received: {data}")

        except WebSocketDisconnect:
            self.disconnect(websocket, user_id)
            user = db.query(User).filter(User.user_id == user_id).first()
            if user:
                user.is_active = False
                db.commit()

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_chat(self, chat_id: int, message: dict):
        if chat_id in self.chat_participants:
            for user_id in self.chat_participants[chat_id]:
                if user_id in self.active_connections:
                    for connection in self.active_connections[user_id]:
                        await connection.send_json(message)