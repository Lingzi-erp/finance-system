"""依赖注入 - 单机版（无认证）"""
from typing import Generator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal


async def get_db() -> Generator:
    """
    获取数据库会话依赖
    """
    async with SessionLocal() as session:
        yield session
