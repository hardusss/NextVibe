from sqlalchemy.orm import Session
from src.models import Message


def get_chat_messages(chat_id: int, db: Session):
    try:
        messages = db.query(Message).filter(Message.chat_id == chat_id).all()
        return [
            {
                "id": msg.id,
                "text": msg.text,
                "created_at": msg.created_at,
                "media": [{"file": m.file, "caption": m.caption} for m in msg.media]
            }
            for msg in messages
        ]
    except Exception as e:
        return {"error": str(e)}
    