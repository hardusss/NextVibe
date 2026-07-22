import os
import json
import uuid
import pytest
import jwt
import time
from datetime import datetime
from fastapi.testclient import TestClient

test_db_path = "test_phase2.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-12345"
os.environ["JWT_ALGORITHM"] = "HS256"

from db import engine, SessionLocal
from src.models.base import Base
from src.models import User, Chat, Message, MessageReaction, MessageReceipt, MediaAttachment
from src.models.message_model import chat_participants
from main import app
from auth import SECRET_KEY, ALGORITHM


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.execute(chat_participants.delete())
    db.query(MessageReaction).delete()
    db.query(MessageReceipt).delete()
    db.query(MediaAttachment).delete()
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
    
    chat2 = Chat(id=200)
    chat2.participants.extend([u2, u3])

    db.add_all([chat1, chat2])
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


def test_read_and_delivery_receipts():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            # Alice sends message
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Hello Bob!",
                "client_msg_id": str(uuid.uuid4())
            })

            msg1 = ws1.receive_json()
            _ = ws2.receive_json()
            assert msg1["type"] == "message"
            assert len(msg1["receipts"]) >= 1

            # Bob sends enter_chat / read_status
            ws2.send_json({
                "type": "enter_chat",
                "chat_id": 100
            })

            read_rcpt = ws1.receive_json()
            assert read_rcpt["type"] == "read_receipt"
            assert read_rcpt["chat_id"] == 100
            assert read_rcpt["reader_id"] == 2
            assert msg1["server_msg_id"] in read_rcpt["message_ids"]

        # Verify receipts in REST API
        headers = {"Authorization": f"Bearer {t2}"}
        res = client.get("/api/v2/messages/100", headers=headers)
        assert res.status_code == 200
        messages = res.json()
        assert len(messages) == 1
        assert len(messages[0]["receipts"]) >= 1


def test_reactions_ws_and_rest():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        # 1. Create a message first
        with client.websocket_connect(f"/ws?token={t1}") as ws1:
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "React to me!",
                "client_msg_id": str(uuid.uuid4())
            })
            msg_env = ws1.receive_json()
            msg_id = msg_env["server_msg_id"]

        # 2. Add reaction via WebSocket
        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:
            
            ws2.send_json({
                "type": "reaction_add",
                "chat_id": 100,
                "message_id": msg_id,
                "emoji": "🔥"
            })

            react_ev1 = ws1.receive_json()
            _ = ws2.receive_json()

            assert react_ev1["type"] == "reaction_update"
            assert react_ev1["message_id"] == msg_id
            assert len(react_ev1["reactions"]) == 1
            assert react_ev1["reactions"][0]["emoji"] == "🔥"

        # 3. Add reaction via REST
        headers = {"Authorization": f"Bearer {t1}"}
        res = client.post(f"/api/v2/messages/{msg_id}/reactions", json={"emoji": "❤️"}, headers=headers)
        assert res.status_code == 200
        r_data = res.json()
        assert len(r_data["reactions"]) == 2

        # 4. Remove reaction via REST
        res_del = client.delete(f"/api/v2/messages/{msg_id}/reactions/❤️", headers=headers)
        assert res_del.status_code == 200
        r_data_del = res_del.json()
        assert len(r_data_del["reactions"]) == 1


def test_reply_to_message_snippet():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)

        with client.websocket_connect(f"/ws?token={t1}") as ws1:
            # Original message
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Original question?",
                "client_msg_id": str(uuid.uuid4())
            })
            m1 = ws1.receive_json()
            orig_id = m1["server_msg_id"]

            # Reply message
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Replying answer!",
                "reply_to_id": orig_id,
                "client_msg_id": str(uuid.uuid4())
            })
            m2 = ws1.receive_json()

            assert m2["reply_to_id"] == orig_id
            assert m2["reply_to_snippet"] is not None
            assert m2["reply_to_snippet"]["id"] == orig_id
            assert m2["reply_to_snippet"]["text"] == "Original question?"

            # Invalid reply_to from cross-chat should return error frame
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Bad reply",
                "reply_to_id": 9999,
                "client_msg_id": str(uuid.uuid4())
            })
            err = ws1.receive_json()
            assert err["type"] == "error"


def test_typing_indicators():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            ws1.send_json({
                "type": "typing_start",
                "chat_id": 100
            })

            event2 = ws2.receive_json()
            assert event2["type"] == "typing_status"
            assert event2["user_id"] == 1
            assert event2["is_typing"] is True

            ws1.send_json({
                "type": "typing_stop",
                "chat_id": 100
            })

            event2_stop = ws2.receive_json()
            assert event2_stop["type"] == "typing_status"
            assert event2_stop["is_typing"] is False


def test_edit_and_delete_message():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        t2 = create_jwt_token(2)

        with client.websocket_connect(f"/ws?token={t1}") as ws1, \
             client.websocket_connect(f"/ws?token={t2}") as ws2:

            # 1. Send message
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Initial text",
                "client_msg_id": str(uuid.uuid4())
            })
            m1 = ws1.receive_json()
            _ = ws2.receive_json()
            msg_id = m1["server_msg_id"]

            # 2. Edit message via WS
            ws1.send_json({
                "type": "edit_message",
                "chat_id": 100,
                "message_id": msg_id,
                "text": "Edited text"
            })

            edit_env1 = ws1.receive_json()
            _ = ws2.receive_json()
            assert edit_env1["type"] == "message_edited"
            assert edit_env1["content"] == "Edited text"
            assert edit_env1["edited_at"] is not None

            # 3. Non-sender cannot edit via WS
            ws2.send_json({
                "type": "edit_message",
                "chat_id": 100,
                "message_id": msg_id,
                "text": "Hacked edit"
            })
            err_env = ws2.receive_json()
            assert err_env["type"] == "error"

            # 4. Soft delete message via WS
            ws1.send_json({
                "type": "delete_message",
                "chat_id": 100,
                "message_id": msg_id
            })

            del_env1 = ws1.receive_json()
            _ = ws2.receive_json()
            assert del_env1["type"] == "message_deleted"
            assert del_env1["deleted_at"] is not None

        # 5. REST verification showing tombstone
        headers = {"Authorization": f"Bearer {t1}"}
        res = client.get("/api/v2/messages/100", headers=headers)
        assert res.status_code == 200
        messages = res.json()
        assert messages[0]["content"] == "[Message deleted]"
        assert messages[0]["deleted_at"] is not None


def test_presigned_media_upload_flow():
    with TestClient(app) as client:
        t1 = create_jwt_token(1)
        headers = {"Authorization": f"Bearer {t1}"}

        # 1. Request pre-signed upload URL off-socket
        res = client.post("/api/v2/media/upload-url", json={
            "chat_id": 100,
            "filename": "vacation.jpg",
            "content_type": "image/jpeg",
            "file_size": 2048
        }, headers=headers)

        assert res.status_code == 200
        upload_info = res.json()
        assert "upload_url" in upload_info
        assert "media_key" in upload_info
        media_key = upload_info["media_key"]

        # 2. Send socket message referencing media_key (no base64 inline!)
        with client.websocket_connect(f"/ws?token={t1}") as ws1:
            ws1.send_json({
                "type": "message",
                "chat_id": 100,
                "message": "Check out this photo",
                "media_keys": [media_key],
                "client_msg_id": str(uuid.uuid4())
            })

            msg_env = ws1.receive_json()
            assert msg_env["type"] == "message"
            assert len(msg_env["media"]) == 1
            assert media_key in msg_env["media"][0]["file_url"]
