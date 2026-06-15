from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker
)

from sqlalchemy.orm import DeclarativeBase
import os
from dotenv import load_dotenv

load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")


# Database Engine
engine = create_async_engine(
    DATABASE_URL,
    echo=True
)


# Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)


# Base Class
class Base(DeclarativeBase):
    pass


# Dependency
async def get_db():

    async with AsyncSessionLocal() as session:
        yield session


# Create Tables
async def create_db_and_tables():

    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all
        )