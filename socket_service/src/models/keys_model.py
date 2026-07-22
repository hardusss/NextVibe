from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from .base import Base
import datetime

class UserDevice(Base):
    __tablename__ = 'chat_userdevice'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'), nullable=False)
    device_id = Column(String(64), nullable=False)
    identity_key = Column(Text, nullable=False)  # Base64 encoded X25519/Ed25519 identity pubkey
    registration_id = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('user_id', 'device_id', name='uq_user_device'),
    )

    signed_prekeys = relationship("SignedPreKey", back_populates="device", cascade="all, delete")
    one_time_prekeys = relationship("OneTimePreKey", back_populates="device", cascade="all, delete")


class SignedPreKey(Base):
    __tablename__ = 'chat_signedprekey'

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey('chat_userdevice.id', ondelete='CASCADE'), nullable=False)
    key_id = Column(Integer, nullable=False)
    public_key = Column(Text, nullable=False)
    signature = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('device_id', 'key_id', name='uq_device_signed_key'),
    )

    device = relationship("UserDevice", back_populates="signed_prekeys")


class OneTimePreKey(Base):
    __tablename__ = 'chat_onetimeprekey'

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey('chat_userdevice.id', ondelete='CASCADE'), nullable=False)
    key_id = Column(Integer, nullable=False)
    public_key = Column(Text, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('device_id', 'key_id', name='uq_device_onetime_key'),
    )

    device = relationship("UserDevice", back_populates="one_time_prekeys")
