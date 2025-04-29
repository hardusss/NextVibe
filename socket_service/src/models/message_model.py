from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, Table
from sqlalchemy.orm import relationship
from .base import Base

import datetime

# Import User after all models are defined if in separate file
from .user_model import User 

chat_participants = Table(
    'chat_participants',
    Base.metadata,
    Column('chat_id', Integer, ForeignKey('chat.id', ondelete='CASCADE'), primary_key=True),
    Column('user_id', Integer, ForeignKey('user.user_id', ondelete='CASCADE'), primary_key=True),
    Column('last_read_at', DateTime, nullable=True)
)

class Chat(Base):
    __tablename__ = 'chat'

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    messages = relationship("Message", back_populates="chat", cascade="all, delete")
    participants = relationship(
        "User",  # Use string literal to avoid circular import issues
        secondary=chat_participants,
        backref="chats"
    )

    def __repr__(self):
        return f"<Chat id={self.id}>"


class Message(Base):
    __tablename__ = 'chat_message'

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey('chat.id', ondelete='CASCADE'))  # Corrected to match 'chat.id'
    sender_id = Column(Integer, ForeignKey('user.user_id', ondelete='CASCADE'))  # Corrected to match 'user.user_id'
    text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_read = Column(Boolean, default=False)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", backref="messages")
    media = relationship("MediaAttachment", back_populates="message", cascade="all, delete")


class MediaAttachment(Base):
    __tablename__ = 'chat_mediaattachment'

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('chat_message.id', ondelete='CASCADE'))
    file_url = Column(String(255))
    caption = Column(String(255), nullable=True)
    media_type = Column(String(10))

    message = relationship("Message", back_populates="media")
