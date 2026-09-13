from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    user = os.getenv('DB_USER', 'root')
    password = os.getenv('DB_PASSWORD', '')
    host = os.getenv('DB_HOST', 'localhost')
    port = os.getenv('DB_PORT', '3306')
    name = os.getenv('DB_NAME', 'nextvibe')
    DATABASE_URL = f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}"

# Without an explicit charset the connection falls back to the server default,
# which may be latin1/utf8mb3 and silently corrupts 4-byte characters (emoji)
# in message text and reactions. Django pins utf8mb4 for the same tables.
if DATABASE_URL.startswith("mysql") and "charset=" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}charset=utf8mb4"

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True if "sqlite" not in DATABASE_URL else False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
