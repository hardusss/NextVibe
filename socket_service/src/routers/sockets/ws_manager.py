from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from src.models import User

app = FastAPI()

class WSM:
    @staticmethod
    async def connect(websocket: WebSocket, user_id: int, db: Session):
        await websocket.accept()
        try:
            user = db.query(User).filter(User.user_id == user_id).first()
            if user:
                user.is_active = True
                db.commit()

            while True:
                data = await websocket.receive_text()
                print(f"Received data from user {user_id}: {data}")
                await websocket.send_text(f"Received: {data}")

        except WebSocketDisconnect:
            user = db.query(User).filter(User.user_id == user_id).first()
            if user:
                user.is_active = False
                db.commit()
        