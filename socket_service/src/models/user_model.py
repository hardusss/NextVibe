from datetime import datetime
from sqlalchemy import (
    String,
    JSON,
    Boolean,
    Column,
    Integer,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base
import datetime

class User(Base):
    __tablename__ = 'user_user'

    user_id = Column(Integer, primary_key=True, index=True)
    avatar = Column(String, default='images/default.png') 
    about = Column(String(120), default="", nullable=True)
    username = Column(String(50), unique=True)
    email = Column(String, unique=True)
    password = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    post_count = Column(Integer, default=0)
    readers_count = Column(Integer, default=0)
    follows_count = Column(Integer, default=0)
    follow_for = Column(JSON, default=[])
    liked_posts = Column(JSON, default=[])
    secret_2fa = Column(String(100), nullable=True, default=None)
    is2FA = Column(Boolean, default=False)
    official = Column(Boolean, default=False, nullable=True)
    is_staff = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_online =  Column(Boolean, default=False)

    
class UserOnlineSession(Base):
    __tablename__ = "user_user_online_session"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("auth_user.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    connected_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    disconnected_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    user = relationship("User", lazy="joined")

