"""
Device public keys for v3 end-to-end encryption, whole encrypted reply
previews, and media keys limited to the chat they were uploaded for.
"""
import base64
import json
import os
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

test_db_path = "test_e2ee_devices.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message, MediaAttachment, E2EEDevice
from src.models.message_model import chat_participants
from src.messages import reply_preview_text
from main import app
from auth import SECRET_KEY, ALGORITHM


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.execute(chat_participants.delete())
    db.query(E2EEDevice).delete()
    db.query(MediaAttachment).delete()
    db.query(Message).delete()
    db.query(Chat).delete()
    db.query(User).delete()
    db.commit()
    alice = User(user_id=1, username="alice", email="alice@test.com")
    bob = User(user_id=2, username="bob", email="bob@test.com")
    db.add_all([alice, bob])
    db.commit()
    chat = Chat(id=100)
    chat.participants.extend([alice, bob])
    db.add(chat)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists(test_db_path):
        os.remove(test_db_path)


def headers(user_id: int) -> dict:
    token = jwt.encode({"user_id": user_id, "token_type": "access", "exp": int(time.time()) + 3600},
                       os.getenv("JWT_SECRET_KEY", SECRET_KEY), algorithm=os.getenv("JWT_ALGORITHM", ALGORITHM))
    return {"Authorization": f"Bearer {token}"}


def key() -> str:
    return base64.b64encode(os.urandom(32)).decode()


def register(client, user_id, device_id, public_key):
    return client.post("/api/v2/e2ee/devices", json={"device_id": device_id, "public_key": public_key},
                       headers=headers(user_id))


def test_devices_are_published_and_listed():
    with TestClient(app) as client:
        alice_key, bob_phone, bob_tablet = key(), key(), key()
        assert register(client, 1, "d_alice_phone", alice_key).status_code == 200
        assert register(client, 2, "d_bob_phone_1", bob_phone).status_code == 200
        assert register(client, 2, "d_bob_tablet", bob_tablet).status_code == 200
        # Registering again only refreshes it
        assert register(client, 2, "d_bob_tablet", bob_tablet).status_code == 200

        res = client.get("/api/v2/e2ee/devices?user_ids=1,2,3", headers=headers(1))
        assert res.status_code == 200
        devices = res.json()["devices"]
        assert devices["1"] == [{"device_id": "d_alice_phone", "public_key": alice_key}]
        assert {d["device_id"] for d in devices["2"]} == {"d_bob_phone_1", "d_bob_tablet"}
        assert devices["3"] == []


def test_bad_input_is_refused():
    with TestClient(app) as client:
        assert register(client, 1, "short", key()).status_code == 400
        assert register(client, 1, "d_has space!", key()).status_code == 400
        assert register(client, 1, "d_alice_phone", "not-a-key").status_code == 400
        assert register(client, 1, "d_alice_phone", base64.b64encode(os.urandom(16)).decode()).status_code == 400
        assert client.get("/api/v2/e2ee/devices?user_ids=a,b", headers=headers(1)).status_code == 400
        many = ",".join(str(i) for i in range(1, 30))
        assert client.get(f"/api/v2/e2ee/devices?user_ids={many}", headers=headers(1)).status_code == 400
        assert client.post("/api/v2/e2ee/devices", json={"device_id": "d_alice_phone", "public_key": key()}).status_code in (401, 422)


def test_a_device_keeps_its_key():
    with TestClient(app) as client:
        assert register(client, 1, "d_alice_phone", key()).status_code == 200
        assert register(client, 1, "d_alice_phone", key()).status_code == 409


def test_only_the_last_ten_devices_stay():
    with TestClient(app) as client:
        for i in range(11):
            assert register(client, 1, f"d_device_{i:02d}", key()).status_code == 200
        devices = client.get("/api/v2/e2ee/devices?user_ids=1", headers=headers(1)).json()["devices"]["1"]
        assert len(devices) == 10
        assert "d_device_00" not in {d["device_id"] for d in devices}


def test_reply_previews_keep_encrypted_text_whole():
    envelope = json.dumps({"v": 3, "ciphertext": "x" * 300, "nonce": "n", "keys": {}})
    assert reply_preview_text(envelope) == envelope
    assert reply_preview_text("a" * 150) == "a" * 100 + "..."
    assert reply_preview_text("short") == "short"
    assert reply_preview_text(None) is None


def test_media_keys_only_from_this_chat():
    with TestClient(app) as client:
        token = headers(1)["Authorization"].split(" ")[1]
        with client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "photos",
                "client_msg_id": str(uuid.uuid4()),
                "media_keys": [
                    f"chat_media/chat_100_{uuid.uuid4().hex}.jpg",
                    f"chat_media/chat_999_{uuid.uuid4().hex}.jpg",
                    "images/someone_elses.png",
                ],
            })
            event = ws.receive_json()
            while event.get("type") != "message":
                event = ws.receive_json()
        assert len(event["media"]) == 1
        assert "/chat_media/chat_100_" in event["media"][0]["file_url"]
