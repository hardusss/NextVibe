from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from .base import Base

import datetime

# Import User after all models are defined if in separate file
from .user_model import User 

chat_participants = Table(
    'chat_chat_participants',
    Base.metadata,
    Column('chat_id', Integer, ForeignKey('chat_chat.id', ondelete='CASCADE'), primary_key=True),
    Column('user_id', Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'), primary_key=True),
    Column('last_read_at', DateTime, nullable=True)
)

class Chat(Base):
    __tablename__ = 'chat_chat'

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
    chat_id = Column(Integer, ForeignKey('chat_chat.id', ondelete='CASCADE'))
    sender_id = Column(Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'))
    client_msg_id = Column(String(36), nullable=True, index=True)
    reply_to_id = Column(Integer, ForeignKey('chat_message.id', ondelete='SET NULL'), nullable=True)
    text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    is_read = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint('chat_id', 'sender_id', 'client_msg_id', name='uq_chat_sender_client_msg'),
    )

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", backref="messages")
    media = relationship("MediaAttachment", back_populates="message", cascade="all, delete")
    reply_to = relationship("Message", remote_side=[id], backref="replies")
    receipts = relationship("MessageReceipt", back_populates="message", cascade="all, delete")
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete")


class MediaAttachment(Base):
    __tablename__ = 'chat_mediaattachment'
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('chat_message.id', ondelete='CASCADE'))
    file = Column(String(255))
    
    message = relationship("Message", back_populates="media")
    
    @property
    def file_url(self):
        if self.file:
            return f"https://media.nextvibe.io/{self.file}"
        return None


class MessageReceipt(Base):
    __tablename__ = 'chat_messagereceipt'

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('chat_message.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'), nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('message_id', 'user_id', name='uq_message_user_receipt'),
    )

    message = relationship("Message", back_populates="receipts")
    user = relationship("User")


class MessageReaction(Base):
    __tablename__ = 'chat_messagereaction'

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('chat_message.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'), nullable=False)
    emoji = Column(String(32), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_message_user_emoji'),
    )

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")

