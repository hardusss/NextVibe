import os
import json
import uuid
import pytest
import jwt
import time
from datetime import datetime
from fastapi.testclient import TestClient

test_db_path = "test_phase3.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message, UserDevice, SignedPreKey, OneTimePreKey
from src.models.message_model import chat_participants
from main import app
from auth import SECRET_KEY, ALGORITHM


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.execute(chat_participants.delete())
    db.query(OneTimePreKey).delete()
    db.query(SignedPreKey).delete()
    db.query(UserDevice).delete()
    db.query(Message).delete()
    db.query(Chat).delete()
    db.query(User).delete()
    db.commit()
    
    u1 = User(user_id=1, username="alice", email="alice@test.com")
    u2 = User(user_id=2, username="bob", email="bob@test.com")
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


def test_device_registration_and_prekey_retrieval():
    with TestClient(app) as client:
        t1 = create_jwt_token(1) # Alice
        t2 = create_jwt_token(2) # Bob

        headers1 = {"Authorization": f"Bearer {t1}"}
        headers2 = {"Authorization": f"Bearer {t2}"}

        # Alice registers her device & prekey bundle
        reg_res = client.post("/api/v2/keys/register-device", json={
            "device_id": "alice_device_1",
            "identity_key": "ALICE_IDENTITY_PUB_KEY_BASE64==",
            "registration_id": 9999,
            "signed_prekey": {
                "key_id": 1,
                "public_key": "ALICE_SIGNED_PREKEY_BASE64==",
                "signature": "ALICE_SIGNATURE_BASE64=="
            },
            "one_time_prekeys": [
                {"key_id": 101, "public_key": "OTK_101_BASE64=="},
                {"key_id": 102, "public_key": "OTK_102_BASE64=="}
            ]
        }, headers=headers1)

        assert reg_res.status_code == 200
        assert reg_res.json()["status"] == "success"

        # Bob claims Alice's prekey bundle for X3DH handshake
        prekey_res = client.get("/api/v2/keys/prekey/1", headers=headers2)
        assert prekey_res.status_code == 200
        bundle = prekey_res.json()

        assert bundle["user_id"] == 1
        assert len(bundle["devices"]) == 1
        dev_bundle = bundle["devices"][0]
        assert dev_bundle["device_id"] == "alice_device_1"
        assert dev_bundle["identity_key"] == "ALICE_IDENTITY_PUB_KEY_BASE64=="
        assert dev_bundle["signed_prekey"]["key_id"] == 1
        assert dev_bundle["one_time_prekey"]["key_id"] == 101

        # Second claim gets the next one-time prekey
        prekey_res2 = client.get("/api/v2/keys/prekey/1", headers=headers2)
        assert prekey_res2.status_code == 200
        dev_bundle2 = prekey_res2.json()["devices"][0]
        assert dev_bundle2["one_time_prekey"]["key_id"] == 102


def test_encrypted_message_ciphertext_storage():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        ciphertext_payload = json.dumps({
            "v": 1,
            "ciphertext": "dGhpcyBpcyBhbiBlbmNyeXB0ZWQgY2lwaGVydGV4dCBib2I=",
            "nonce": "c29tZW5vbmNlMTIz",
            "sender_device_id": "alice_dev_1"
        })

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": ciphertext_payload,
                "client_msg_id": str(uuid.uuid4())
            })

            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()
            assert msg1["type"] == "message"
            assert msg2["type"] == "message"
            assert msg1["content"] == ciphertext_payload

        # Assert database stores ciphertext ONLY - zero knowledge server
        db = SessionLocal()
        db_msg = db.query(Message).filter(Message.chat_id == 100).first()
        assert db_msg is not None
        assert "dGhpcyBpcyBhbiBlbmNyeXB0ZWQ" in db_msg.text
        assert "Hello" not in db_msg.text  # No readable plaintext in DB!
        db.close()


def test_voluntary_abuse_report_endpoint():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        # 1. Send encrypted message
        with client.websocket_connect(f"/ws?token={t1}") as ws1:
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "encrypted_blob",
                "client_msg_id": str(uuid.uuid4())
            })
            m = ws1.receive_json()
            msg_id = m["server_msg_id"]

        # 2. Bob voluntarily reports decrypted message
        headers = {"Authorization": f"Bearer {t2}"}
        rep_res = client.post("/api/v2/chat/report-message", json={
            "chat_id": 100,
            "message_id": msg_id,
            "decrypted_content": "Harassing message text",
            "reason": "harassment",
            "signature": "BOB_SIGNATURE_OF_DECRYPTED_TEXT"
        }, headers=headers)

        assert rep_res.status_code == 200
        assert rep_res.json()["status"] == "reported"
        assert rep_res.json()["submitted_by"] == 2
