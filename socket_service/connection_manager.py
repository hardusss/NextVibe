from fastapi import WebSocket
from typing import Dict, List, Optional, Set, Any
import logging
import json
import uuid
import os
import time
import asyncio
import redis
import redis.asyncio as aioredis

logger = logging.getLogger("connection_manager")


class ConnectionManager:
    def __init__(self, redis_client: Optional[redis.Redis] = None, pod_id: Optional[str] = None):
        self.pod_id = pod_id or os.getenv("POD_ID", f"pod-{uuid.uuid4().hex[:8]}")
        # Local connection mapping: user_id -> {conn_id: websocket}
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
        self.redis = redis_client
        self.async_redis: Optional[aioredis.Redis] = None
        self.pubsub_task: Optional[asyncio.Task] = None
        self.channel_name = "chat_pubsub_events"

    def set_redis(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def init_async_redis(self, host: str = "127.0.0.1", port: int = 6379, db: int = 0):
        try:
            self.async_redis = aioredis.Redis(host=host, port=port, db=db, decode_responses=True)
            self.pubsub_task = asyncio.create_task(self._listen_pubsub())
            logger.info(f"📡 PubSub listener started for pod {self.pod_id}")
        except Exception as e:
            logger.error(f"❌ Failed to init async redis pubsub: {e}")

    async def close(self):
        if self.pubsub_task:
            self.pubsub_task.cancel()
            try:
                await self.pubsub_task
            except asyncio.CancelledError:
                pass
        if self.async_redis:
            if hasattr(self.async_redis, "aclose"):
                await self.async_redis.aclose()
            else:
                await self.async_redis.close()

    async def _listen_pubsub(self):
        if not self.async_redis:
            return
        pubsub = self.async_redis.pubsub()
        await pubsub.subscribe(self.channel_name)
        try:
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    try:
                        raw_data = message["data"]
                        if isinstance(raw_data, bytes):
                            raw_data = raw_data.decode("utf-8")
                        data = json.loads(raw_data)
                        sender_pod = data.get("sender_pod_id")
                        if sender_pod == self.pod_id:
                            continue  # Skip events published by this pod

                        target_users = data.get("target_user_ids", [])
                        envelope = data.get("envelope")
                        if envelope:
                            await self._deliver_local(target_users, json.dumps(envelope))
                    except Exception as e:
                        logger.error(f"❌ Error processing PubSub event: {e}")
        except asyncio.CancelledError:
            try:
                await pubsub.unsubscribe(self.channel_name)
                if hasattr(pubsub, "aclose"):
                    await pubsub.aclose()
                else:
                    await pubsub.close()
            except Exception:
                pass
        except Exception as e:
            logger.error(f"❌ PubSub listener error: {e}")

    async def connect(self, websocket: WebSocket, user_id: int) -> str:
        await websocket.accept()
        conn_id = str(uuid.uuid4())

        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}

        self.active_connections[user_id][conn_id] = websocket

        # Presence key in Redis
        if self.redis:
            try:
                self.redis.setex(f"presence:{user_id}:{conn_id}", 120, self.pod_id)
            except Exception as e:
                logger.error(f"❌ Redis presence set error for user {user_id}: {e}")

        logger.info(f"✅ User {user_id} connected (conn_id: {conn_id}). Total local conns: {len(self.active_connections[user_id])}")
        return conn_id

    def disconnect(self, websocket: WebSocket, user_id: int, conn_id: Optional[str] = None):
        if user_id in self.active_connections:
            target_conn_id = conn_id
            if not target_conn_id:
                for cid, ws in list(self.active_connections[user_id].items()):
                    if ws == websocket:
                        target_conn_id = cid
                        break

            if target_conn_id and target_conn_id in self.active_connections[user_id]:
                del self.active_connections[user_id][target_conn_id]
                if self.redis:
                    try:
                        self.redis.delete(f"presence:{user_id}:{target_conn_id}")
                    except Exception as e:
                        logger.error(f"❌ Redis presence delete error for user {user_id}: {e}")
                logger.info(f"👋 User {user_id} disconnected conn {target_conn_id}. Remaining: {len(self.active_connections[user_id])}")

            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                logger.info(f"🗑️ User {user_id} removed from local active connections")

    def refresh_presence(self, user_id: int, conn_id: str):
        if self.redis:
            try:
                self.redis.setex(f"presence:{user_id}:{conn_id}", 120, self.pod_id)
            except Exception as e:
                logger.error(f"❌ Redis presence refresh error: {e}")

    def count_connections(self, user_id: int) -> int:
        return len(self.active_connections.get(user_id, {}))

    def get_online_user_ids(self) -> List[int]:
        """Returns online user IDs across all pods using Redis keys if available, else local."""
        if self.redis:
            try:
                keys = self.redis.keys("presence:*")
                user_ids = set()
                for key in keys:
                    if isinstance(key, bytes):
                        key = key.decode("utf-8")
                    parts = key.split(":")
                    if len(parts) >= 2:
                        user_ids.add(int(parts[1]))
                return list(user_ids)
            except Exception as e:
                logger.error(f"❌ Error fetching online users from Redis: {e}")
        return list(self.active_connections.keys())

    def is_user_online(self, user_id: int) -> bool:
        if user_id in self.active_connections and len(self.active_connections[user_id]) > 0:
            return True
        if self.redis:
            try:
                keys = self.redis.keys(f"presence:{user_id}:*")
                return len(keys) > 0
            except Exception as e:
                logger.error(f"❌ Error checking online status in Redis: {e}")
        return False

    def check_rate_limit(self, user_id: int, max_events_per_sec: int = 10) -> bool:
        """Sliding window rate limiter using Redis."""
        now = int(time.time())
        key = f"ratelimit:{user_id}:{now}"
        if self.redis:
            try:
                val = self.redis.incr(key)
                if val == 1:
                    self.redis.expire(key, 2)
                return val <= max_events_per_sec
            except Exception as e:
                logger.error(f"❌ Rate limit check error: {e}")
                return True
        return True

    async def _deliver_local(self, user_ids: List[int], message_json: str):
        disconnected = []
        for uid in user_ids:
            if uid in self.active_connections:
                for conn_id, websocket in list(self.active_connections[uid].items()):
                    try:
                        await websocket.send_text(message_json)
                    except Exception as e:
                        logger.error(f"❌ Error sending to user {uid} (conn {conn_id}): {e}")
                        disconnected.append((websocket, uid, conn_id))

        for ws, uid, cid in disconnected:
            self.disconnect(ws, uid, cid)

    async def send_to_users(self, user_ids: List[int], payload: dict):
        """Scope fan-out to specific target user_ids (local + cross-pod via Redis PubSub)."""
        message_json = json.dumps(payload)
        # 1. Deliver to local sockets
        await self._deliver_local(user_ids, message_json)

        # 2. Publish to Redis PubSub for cross-pod delivery
        pubsub_payload = {
            "sender_pod_id": self.pod_id,
            "target_user_ids": user_ids,
            "envelope": payload
        }
        if self.async_redis:
            try:
                await self.async_redis.publish(self.channel_name, json.dumps(pubsub_payload))
            except Exception as e:
                logger.error(f"❌ Async Redis publish error: {e}")
        elif self.redis:
            try:
                self.redis.publish(self.channel_name, json.dumps(pubsub_payload))
            except Exception as e:
                logger.error(f"❌ Redis publish error: {e}")

    async def broadcast(self, message: str):
        """Broadcast to ALL local connections (reserved for system announcements only)."""
        payload = {"type": "system_announcement", "content": message}
        message_json = json.dumps(payload)
        disconnected = []
        for uid, conns in list(self.active_connections.items()):
            for cid, websocket in list(conns.items()):
                try:
                    await websocket.send_text(message_json)
                except Exception as e:
                    logger.error(f"❌ Error broadcasting to user {uid}: {e}")
                    disconnected.append((websocket, uid, cid))

        for ws, uid, cid in disconnected:
            self.disconnect(ws, uid, cid)

    async def send_personal_message(self, message: str, user_id: int):
        try:
            payload = json.loads(message) if isinstance(message, str) else message
        except Exception:
            payload = {"content": message}
        await self.send_to_users([user_id], payload)