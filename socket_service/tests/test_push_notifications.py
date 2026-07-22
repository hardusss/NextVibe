import os
import json
import uuid
import pytest
import jwt
import time
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

test_db_path = "test_push.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message
from src.models.message_model import chat_participants
from main import app
from auth import SECRET_KEY, ALGORITHM


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.execute(chat_participants.delete())
    db.query(Message).delete()
    db.query(Chat).delete()
    db.query(User).delete()
    db.commit()
    
    u1 = User(user_id=1, username="alice", email="alice@test.com", expo_push_token="ExponentPushToken[alice_token]")
    u2 = User(user_id=2, username="bob", email="bob@test.com", expo_push_token="ExponentPushToken[bob_token]")
    db.add_all([u1, u2])
    db.commit()

    chat1 = Chat(id=100)
    chat1.participants.extend([u1, u2])
    db.add(chat1)
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


def test_push_notification_dispatch_for_offline_user():
    with patch("main.send_chat_push_notification") as mock_push:
        with TestClient(app) as client:
            t1 = create_jwt_token(1)

            # Alice sends message while Bob is offline (not connected to WS)
            with client.websocket_connect(f"/ws?token={t1}") as ws1:
                ws1.send_json({
                    "type": "message",
                    "chat_id": 100,
                    "message": "Hello Bob via Push Notification!",
                    "client_msg_id": str(uuid.uuid4())
                })
                _ = ws1.receive_json()

            # Verify push notification was triggered for offline user Bob
            assert mock_push.called
            call_kwargs = mock_push.call_args.kwargs
            assert "ExponentPushToken[bob_token]" in call_kwargs["recipient_tokens"]
            assert call_kwargs["sender_name"] == "alice"
            assert call_kwargs["message_text"] == "Hello Bob via Push Notification!"
            assert call_kwargs["chat_id"] == 100
