import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.auth.security import get_password_hash
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.user import User
from app.models.data_template import DataTemplate, TemplateField
from app.models.data_type import DataType, DataTypeField
from app.models.repository import Repository
from app.models.data_record import DataRecord, RecordRelation
from app.models.record_number import RecordNumberSequence

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_db() -> None:
    """
    初始化数据库
    """
    try:
        # 创建所有表
        logger.info("创建数据库表...")
        async with engine.begin() as conn:
            # 先删除不需要的表
            await conn.execute(text("DROP TABLE IF EXISTS financial_records"))
            # 创建所有表
            await conn.run_sync(Base.metadata.create_all)
            logger.info("数据库表创建成功")
        
        # 获取数据库会话
        async with SessionLocal() as db:
            # 创建超级管理员用户
            result = await db.execute(select(User).where(User.username == "admin"))
            admin = result.scalars().first()
            
            if not admin:
                logger.info("创建管理员用户...")
                admin = User(
                    username="admin",
                    password=get_password_hash("admin"),
                    role="admin",
                    status=True
                )
                db.add(admin)
                await db.commit()
                await db.refresh(admin)
                logger.info("管理员用户创建成功")
            else:
                logger.info("管理员用户已存在")
        
        logger.info("数据库初始化完成")
    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(init_db()) 