"""API依赖 - 单机版（无认证）"""
from typing import Generator
from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator:
    """同步数据库会话（兼容旧代码）"""
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()
