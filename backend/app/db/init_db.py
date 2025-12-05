import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine
from app.db.base import Base

# 导入所有 V3 模型，确保表能被创建
from app.models.v3 import (
    Entity, Category, Specification, UnitGroup, Unit,
    Product, BusinessOrder, OrderItem, OrderFlow, Stock, StockFlow,
    AccountBalance, PaymentRecord, AuditLog, StockBatch
)


async def init_db() -> None:
    """
    初始化数据库 - 创建所有表
    """
    # 创建表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def ensure_tables_exist() -> None:
    """
    确保数据库表存在（应用启动时调用）
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    asyncio.run(init_db())
