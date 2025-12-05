import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# 创建异步引擎
# 仅在开发环境打印SQL（通过环境变量控制）
engine = create_async_engine(
    settings.SQLITE_DATABASE_URI.replace("sqlite:///", "sqlite+aiosqlite:///"),
    echo=os.getenv("SQL_DEBUG", "false").lower() == "true",
    future=True,
)

# 创建异步会话
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def reload_database_engine():
    """
    重新加载数据库引擎（在恢复备份后调用）
    关闭所有连接池中的连接，让下次查询时重新连接到新的数据库文件
    """
    global engine, SessionLocal
    
    # 关闭现有引擎的所有连接
    await engine.dispose()
    
    # 重新创建引擎
    engine = create_async_engine(
        settings.SQLITE_DATABASE_URI.replace("sqlite:///", "sqlite+aiosqlite:///"),
        echo=os.getenv("SQL_DEBUG", "false").lower() == "true",
        future=True,
    )
    
    # 重新创建会话工厂
    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    ) 