from fastapi import WebSocket
from typing import Dict, List
import logging

logger = logging.getLogger("connection_manager")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = []

        self.active_connections[user_id].append(websocket)
        logger.info(f"✅ User {user_id} connected. Total connections: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
                logger.info(f"👋 User {user_id} disconnected. Remaining: {len(self.active_connections[user_id])}")

            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                logger.info(f"🗑️ User {user_id} removed from active connections")

    def count_connections(self, user_id: int) -> int:
        return len(self.active_connections.get(user_id, []))

    async def broadcast(self, message: str):
        disconnected = []
        
        for user_id, connections in self.active_connections.items():
            for websocket in connections:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"❌ Error broadcasting to user {user_id}: {e}")
                    disconnected.append((websocket, user_id))

        for ws, uid in disconnected:
            self.disconnect(ws, uid)

    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            disconnected = []
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"❌ Error sending to user {user_id}: {e}")
                    disconnected.append(websocket)
            
            for ws in disconnected:
                self.disconnect(ws, user_id)

    def get_online_users(self) -> List[int]:
        return list(self.active_connections.keys())

    def is_user_online(self, user_id: int) -> bool:
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0