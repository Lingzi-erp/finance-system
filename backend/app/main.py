from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.api_v3.api import api_router as api_v3_router
from app.core.config import settings
from app.core.logging_config import setup_logging, get_logger
from app.services.scheduler import init_scheduler, shutdown_scheduler
from app.db.session import SessionLocal
from app.db.migrations import run_migrations
from app.db.init_db import ensure_tables_exist

# 初始化日志系统
log_level = os.getenv("LOG_LEVEL", "INFO")
setup_logging(log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("[STARTING] 应用启动中...")
    
    # 确保数据库表存在
    try:
        await ensure_tables_exist()
        logger.info("[DB] 数据库表已就绪")
    except Exception as e:
        logger.warning(f"数据库表初始化警告: {e}")
    
    # 运行数据库迁移和基础数据检查
    try:
        async with SessionLocal() as db:
            result = await run_migrations(db)
            
            # 报告列更新
            if result.get("columns_added"):
                logger.info(f"[UPDATE] 数据库结构更新: 添加了 {len(result['columns_added'])} 个字段")
                for col in result["columns_added"]:
                    logger.info(f"   [+] {col}")
            
            # 报告基础数据修复
            formula_result = result.get("deduction_formulas", {})
            if formula_result.get("action") in ["rebuilt", "updated"]:
                logger.info(f"[FIX] 基础数据修复: 扣重公式已更新")
                for detail in formula_result.get("details", []):
                    logger.info(f"   [+] {detail}")
            
            # 版本更新
            if result.get("old_version") != result.get("new_version"):
                logger.info(f"[DB] 数据库版本: {result.get('old_version') or '初始'} -> {result.get('new_version')}")
                
    except Exception as e:
        logger.warning(f"数据库迁移跳过: {e}")
    
    init_scheduler()
    yield
    # 关闭时
    logger.info("[STOPPING] 应用关闭中...")
    shutdown_scheduler()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v3/openapi.json",
    description="财务管理系统 - 单机版",
    lifespan=lifespan
)

# CORS配置
if settings.BACKEND_CORS_ORIGINS:
    logger.info(f"配置CORS，允许的源: {settings.BACKEND_CORS_ORIGINS}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# V3 API（核心业务）
logger.info("注册API v3路由，前缀: /api/v3")
app.include_router(api_v3_router, prefix="/api/v3")


@app.get("/")
async def root():
    return {"message": "财务管理系统 - 单机版"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# PyInstaller 打包后的入口点
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
