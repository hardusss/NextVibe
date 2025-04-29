from datetime import datetime
from sqlalchemy.orm import Session
from src.models import Message

def get_chat_messages(chat_id: int, db: Session):
    return db.query(Message).filter(Message.chat_id == chat_id).all()

def save_message(db: Session, user_id: int, chat_id: int, message: str):
    new_message = Message(
        sender_id=user_id,
        chat_id=chat_id,
        text=message,
        created_at=datetime.now()
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    return new_message