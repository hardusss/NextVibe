import os
import json
import uuid
import pytest
import jwt
from datetime import datetime
from fastapi.testclient import TestClient

test_db_path = "test_chat.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message
from src.models.message_model import chat_participants
from main import app, manager
from connection_manager import ConnectionManager


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    u1 = User(user_id=1, username="alice", email="alice@test.com")
    u2 = User(user_id=2, username="bob", email="bob@test.com")
    u3 = User(user_id=3, username="charlie", email="charlie@test.com")
    db.add_all([u1, u2, u3])
    db.commit()

    chat = Chat(id=100)
    chat.participants.extend([u1, u2])
    db.add(chat)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists(test_db_path):
        try:
            os.remove(test_db_path)
        except Exception:
            pass


from auth import SECRET_KEY, ALGORITHM

import time

def create_jwt_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "token_type": "access",
        "exp": int(time.time()) + 3600
    }
    secret = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    alg = os.getenv("JWT_ALGORITHM", ALGORITHM)
    return jwt.encode(payload, secret, algorithm=alg)


def test_connection_manager_presence():
    cm = ConnectionManager(pod_id="test-pod-1")
    assert not cm.is_user_online(1)
    assert cm.count_connections(1) == 0


def test_scoped_fanout_privacy_isolation():
    client = TestClient(app)
    t1 = create_jwt_token(1)
    t2 = create_jwt_token(2)
    t3 = create_jwt_token(3)  # Charlie - NOT in chat 100

    with client.websocket_connect(f"/ws?token={t1}") as ws1, \
         client.websocket_connect(f"/ws?token={t2}") as ws2, \
         client.websocket_connect(f"/ws?token={t3}") as ws3:

        client_msg_id = str(uuid.uuid4())
        ws1.send_json({
            "type": "message",
            "chat_id": 100,
            "message": "Hello Bob!",
            "client_msg_id": client_msg_id
        })

        # Sender ws1 receives message
        data1 = ws1.receive_json()
        assert data1["type"] == "message"
        assert data1["content"] == "Hello Bob!"
        assert data1["chat_id"] == 100
        assert data1["client_msg_id"] == client_msg_id

        # Authorized participant ws2 receives message
        data2 = ws2.receive_json()
        assert data2["type"] == "message"
        assert data2["content"] == "Hello Bob!"

        # Unauthorized user ws3 MUST NOT receive message for chat 100!
        ws3.send_json({"type": "ping"})
        resp3 = ws3.receive_json()
        assert resp3["type"] == "pong"


def test_message_idempotency():
    client = TestClient(app)
    t1 = create_jwt_token(1)
    t2 = create_jwt_token(2)

    with client.websocket_connect(f"/ws?token={t1}") as ws1, \
         client.websocket_connect(f"/ws?token={t2}") as ws2:

        fixed_client_msg_id = str(uuid.uuid4())

        # Send first time
        ws1.send_json({
            "type": "message",
            "chat_id": 100,
            "message": "Idempotency Test",
            "client_msg_id": fixed_client_msg_id
        })

        res1 = ws1.receive_json()
        server_id_1 = res1["server_msg_id"]
        _ = ws2.receive_json()

        # Retry send with exact same client_msg_id
        ws1.send_json({
            "type": "message",
            "chat_id": 100,
            "message": "Idempotency Test Retry",
            "client_msg_id": fixed_client_msg_id
        })

        res2 = ws1.receive_json()
        server_id_2 = res2["server_msg_id"]
        _ = ws2.receive_json()

        # Assert same server_msg_id returned, no duplicate DB record
        assert server_id_1 == server_id_2

        db = SessionLocal()
        msg_count = db.query(Message).filter(Message.client_msg_id == fixed_client_msg_id).count()
        assert msg_count == 1
        db.close()


def test_rate_limiting():
    client = TestClient(app)
    t1 = create_jwt_token(1)

    with client.websocket_connect(f"/ws?token={t1}") as ws1:
        rate_limited_hit = False
        # Send 15 messages rapidly (cap is 10/sec)
        for i in range(15):
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": f"Spam {i}",
                "client_msg_id": str(uuid.uuid4())
            })
            resp = ws1.receive_json()
            if resp.get("type") == "error" and resp.get("code") == "rate_limited":
                rate_limited_hit = True
                break

        assert rate_limited_hit, "Expected rate limit error frame to be triggered"


@pytest.mark.asyncio
async def test_cross_pod_pubsub_routing():
    import asyncio
    import redis
    from unittest.mock import AsyncMock

    cm1 = ConnectionManager(pod_id="pod-A")
    cm2 = ConnectionManager(pod_id="pod-B")

    r_sync = redis.Redis(host='127.0.0.1', port=6379, db=0)
    cm1.set_redis(r_sync)
    cm2.set_redis(r_sync)

    await cm1.init_async_redis()
    await cm2.init_async_redis()
    await asyncio.sleep(0.1)

    mock_ws_user2 = AsyncMock()
    cm2.active_connections[2] = {"conn-2": mock_ws_user2}

    payload = {"type": "message", "content": "Cross-pod message", "chat_id": 100}
    await cm1.send_to_users([1, 2], payload)

    await asyncio.sleep(0.3)

    assert mock_ws_user2.send_text.called
    sent_args = mock_ws_user2.send_text.call_args[0][0]
    sent_dict = json.loads(sent_args)
    assert sent_dict["content"] == "Cross-pod message"

    await cm1.close()
    await cm2.close()

