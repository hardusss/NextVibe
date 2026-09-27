import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from .base import Base


class E2EEDevice(Base):
    """
    An app install's X25519 public key for end-to-end encrypted chats. The
    table belongs to Django (backend/NextVibeAPI/e2ee/models.py, which creates
    it); keep the two in sync.
    """
    __tablename__ = 'e2ee_device'

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('user_user.user_id', ondelete='CASCADE'), nullable=False, index=True)
    device_id = Column(String(64), nullable=False)
    public_key = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('user_id', 'device_id', name='unique_e2ee_device'),
    )
