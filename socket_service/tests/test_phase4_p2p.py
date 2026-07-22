import os
import json
import uuid
import pytest
import jwt
import time
from datetime import datetime
from fastapi.testclient import TestClient

test_db_path = "test_phase4.db"
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
    
    u1 = User(user_id=1, username="alice", email="alice@test.com")
    u2 = User(user_id=2, username="bob", email="bob@test.com")
    u3 = User(user_id=3, username="charlie", email="charlie@test.com")
    db.add_all([u1, u2, u3])
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


def test_webrtc_signaling_relay():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            # 1. Alice sends webrtc_offer targeting Bob
            ws1.send_json({
                "type": "webrtc_offer",
                "chat_id": 100,
                "target_user_id": 2,
                "sdp": {"type": "offer", "sdp": "v=0\r\no=alice..."}
            })

            offer_event = ws2.receive_json()
            assert offer_event["type"] == "webrtc_offer"
            assert offer_event["chat_id"] == 100
            assert offer_event["sender_user_id"] == 1
            assert offer_event["target_user_id"] == 2
            assert offer_event["sdp"]["sdp"] == "v=0\r\no=alice..."

            # 2. Bob sends webrtc_answer targeting Alice
            ws2.send_json({
                "type": "webrtc_answer",
                "chat_id": 100,
                "target_user_id": 1,
                "sdp": {"type": "answer", "sdp": "v=0\r\no=bob..."}
            })

            answer_event = ws1.receive_json()
            assert answer_event["type"] == "webrtc_answer"
            assert answer_event["sender_user_id"] == 2
            assert answer_event["sdp"]["sdp"] == "v=0\r\no=bob..."

            # 3. Alice sends ICE candidate targeting Bob
            ws1.send_json({
                "type": "webrtc_ice_candidate",
                "chat_id": 100,
                "target_user_id": 2,
                "candidate": {"candidate": "candidate:1 1 UDP...", "sdpMid": "0"}
            })

            ice_event = ws2.receive_json()
            assert ice_event["type"] == "webrtc_ice_candidate"
            assert ice_event["sender_user_id"] == 1
            assert "candidate:1 1 UDP" in ice_event["candidate"]["candidate"]


def test_unauthorized_signaling_rejected():
    with TestClient(app) as client:
        t3 = create_jwt_token(3) # Charlie (not in chat 100)

        with client.websocket_connect(f"/ws?token={t3}") as ws3:
            ws3.send_json({
                "type": "webrtc_offer",
                "chat_id": 100,
                "target_user_id": 2,
                "sdp": {"type": "offer", "sdp": "malicious"}
            })

            err = ws3.receive_json()
            assert err["type"] == "error"


def test_p2p_message_persistence_sync():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            client_msg_id = str(uuid.uuid4())

            # Alice sends async server persistence sync for message sent via P2P
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "P2P Encrypted Message",
                "client_msg_id": client_msg_id,
                "is_p2p_synced": True
            })

            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()

            assert msg1["type"] == "message"
            assert msg1["content"] == "P2P Encrypted Message"
            assert msg2["content"] == "P2P Encrypted Message"

        # Verify database record created for offline history sync
        db = SessionLocal()
        db_msg = db.query(Message).filter(Message.client_msg_id == client_msg_id).first()
        assert db_msg is not None
        assert db_msg.text == "P2P Encrypted Message"
        db.close()
