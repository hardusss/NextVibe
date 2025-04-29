from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from .base import Base
import datetime

class User(Base):
    __tablename__ = 'user'

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