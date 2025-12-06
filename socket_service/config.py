import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    MAX_MEDIA_SIZE_MB: int = 100
    MAX_CONNECTIONS_PER_USER: int = 5
    CORS_ORIGINS: list[str] = []

    model_config = SettingsConfigDict(
        env_file=".env",   
        extra="ignore"   
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if isinstance(self.CORS_ORIGINS, str):
            self.CORS_ORIGINS = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings()
