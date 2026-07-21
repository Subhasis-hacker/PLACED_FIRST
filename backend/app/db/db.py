import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Get the URL from env
RAW_DB_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")

# Logic to handle managed PostgreSQL connections
if RAW_DB_URL.startswith("postgresql://"):
    # 1. Use the psycopg2 driver
    DATABASE_URL = RAW_DB_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    
    # 2. Force SSL for hosted PostgreSQL providers when the URL omits it
    if "sslmode=" not in DATABASE_URL:
        separator = "?" if "?" not in DATABASE_URL else "&"
        DATABASE_URL += f"{separator}sslmode=require"
else:
    DATABASE_URL = RAW_DB_URL

# Create the engine
engine = create_engine(
    DATABASE_URL,
    # Keep connect_args for local sqlite testing
    connect_args={"check_same_thread": False} if RAW_DB_URL.startswith("sqlite") else {}
)

# Session Setup
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
