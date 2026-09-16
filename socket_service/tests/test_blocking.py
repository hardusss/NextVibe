"""
Chats between a blocked pair deliver nothing, in either direction.

Covers:
- a new message is rejected (code "blocked") and never stored or fanned out
- typing indicators are not delivered
- REST history and mark-read answer 404 for both people
- chats with other people keep working
"""
import os
import uuid
import pytest
import jwt
import time
from fastapi.testclient import TestClient

test_db_path = "test_blocking.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message, MessageReceipt, Block
from src.models.message_model import chat_participants
from main import app
from auth import SECRET_KEY, ALGORITHM


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.execute(chat_participants.delete())
    db.query(MessageReceipt).delete()
    db.query(Message).delete()
    db.query(Chat).delete()
    db.query(Block).delete()
    db.query(User).delete()
    db.commit()

    u1 = User(user_id=1, username="alice", email="alice@test.com")
    u2 = User(user_id=2, username="bob", email="bob@test.com")
    u3 = User(user_id=3, username="charlie", email="charlie@test.com")
    db.add_all([u1, u2, u3])
    db.commit()

    chat1 = Chat(id=100)
    chat1.participants.extend([u1, u2])
    chat2 = Chat(id=200)
    chat2.participants.extend([u1, u3])
    db.add_all([chat1, chat2])

    # Bob blocked Alice
    db.add(Block(blocker_id=2, blocked_id=1))
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


def create_jwt_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "token_type": "access",
        "exp": int(time.time()) + 3600
    }
    secret = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    alg = os.getenv("JWT_ALGORITHM", ALGORITHM)
    return jwt.encode(payload, secret, algorithm=alg)


def test_message_between_blocked_pair_rejected():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            # The blocked person writes...
            client_msg_id = str(uuid.uuid4())
            ws1.send_json({"type": "message", "chat_id": 100, "message": "hi", "client_msg_id": client_msg_id})
            err = ws1.receive_json()
            assert err["type"] == "error"
            assert err["code"] == "blocked"
            assert err["chat_id"] == 100
            assert err["client_msg_id"] == client_msg_id

            # ...and so does the blocker
            ws2.send_json({"type": "message", "chat_id": 100, "message": "hi", "client_msg_id": str(uuid.uuid4())})
            err = ws2.receive_json()
            assert err["code"] == "blocked"

            # Typing isn't relayed either. Alice's pong means her typing event was
            # fully handled, so anything leaked would already be queued for Bob.
            ws1.send_json({"type": "typing_start", "chat_id": 100})
            ws1.send_json({"type": "ping"})
            assert ws1.receive_json()["type"] == "pong"
            ws2.send_json({"type": "ping"})
            assert ws2.receive_json()["type"] == "pong"

        db = SessionLocal()
        assert db.query(Message).filter(Message.chat_id == 100).count() == 0
        db.close()


def test_blocked_chat_history_hidden_for_both():
    with TestClient(app) as client:
        for user_id in (1, 2):
            headers = {"Authorization": f"Bearer {create_jwt_token(user_id)}"}
            assert client.get("/api/v2/messages/100", headers=headers).status_code == 404
            assert client.post("/api/v2/messages/chat/100/read", headers=headers).status_code == 404


def test_other_chats_unaffected():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t3 = create_jwt_token(3)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t3}") as ws3:
            ws1.send_json({"type": "message", "chat_id": 200, "message": "hi charlie", "client_msg_id": str(uuid.uuid4())})
            assert ws1.receive_json()["type"] == "message"
            assert ws3.receive_json()["type"] == "message"

        headers = {"Authorization": f"Bearer {t3}"}
        res = client.get("/api/v2/messages/200", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) == 1


def test_unblock_restores_delivery():
    db = SessionLocal()
    db.query(Block).delete()
    db.commit()
    db.close()

    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:
            ws1.send_json({"type": "message", "chat_id": 100, "message": "hi again", "client_msg_id": str(uuid.uuid4())})
            assert ws1.receive_json()["type"] == "message"
            assert ws2.receive_json()["type"] == "message"
