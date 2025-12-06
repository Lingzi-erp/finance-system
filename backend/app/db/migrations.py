"""
数据库版本迁移模块

在启动时自动检查并更新数据库结构，确保兼容旧版本的数据备份文件。
"""

import logging
from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 当前数据库版本
CURRENT_DB_VERSION = "1.1.0"


async def get_db_version(db: AsyncSession) -> str:
    """获取数据库版本，如果没有版本表则返回 None"""
    try:
        result = await db.execute(text(
            "SELECT value FROM system_config WHERE key = 'db_version'"
        ))
        row = result.fetchone()
        return row[0] if row else None
    except Exception:
        return None


async def set_db_version(db: AsyncSession, version: str) -> None:
    """设置数据库版本"""
    try:
        await db.execute(text(
            "INSERT OR REPLACE INTO system_config (key, value) VALUES ('db_version', :version)"
        ), {"version": version})
        await db.commit()
    except Exception as e:
        logger.error(f"设置数据库版本失败: {e}")


async def ensure_system_config_table(db: AsyncSession) -> None:
    """确保 system_config 表存在"""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))
    await db.commit()


async def check_column_exists(db: AsyncSession, table: str, column: str) -> bool:
    """检查表中是否存在指定列"""
    try:
        result = await db.execute(text(f"PRAGMA table_info({table})"))
        columns = [row[1] for row in result.fetchall()]
        return column in columns
    except Exception:
        return False


async def add_column_if_not_exists(
    db: AsyncSession, 
    table: str, 
    column: str, 
    column_type: str, 
    default: str = None
) -> bool:
    """如果列不存在则添加"""
    if await check_column_exists(db, table, column):
        return False
    
    try:
        sql = f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"
        if default is not None:
            sql += f" DEFAULT {default}"
        await db.execute(text(sql))
        await db.commit()
        logger.info(f"已添加列: {table}.{column}")
        return True
    except Exception as e:
        logger.error(f"添加列 {table}.{column} 失败: {e}")
        return False


# ========== 迁移脚本 ==========

async def migrate_v1_0_0(db: AsyncSession) -> None:
    """
    v1.0.0 迁移：初始版本
    - 确保所有基础表结构完整
    """
    logger.info("执行 v1.0.0 迁移...")
    
    # 确保 products 表有 unit_id 字段（新增的包装规格支持）
    await add_column_if_not_exists(db, "products", "unit_id", "INTEGER")
    
    # 确保 order_items 表有扣重相关字段
    await add_column_if_not_exists(db, "order_items", "gross_weight", "DECIMAL(12,3)")
    await add_column_if_not_exists(db, "order_items", "deduction_formula_id", "INTEGER")
    await add_column_if_not_exists(db, "order_items", "storage_rate", "DECIMAL(10,2)")
    await add_column_if_not_exists(db, "order_items", "logistics_company_id", "INTEGER")
    
    # 确保 business_orders 表有汇总字段
    await add_column_if_not_exists(db, "business_orders", "total_shipping", "DECIMAL(12,2)")
    await add_column_if_not_exists(db, "business_orders", "total_storage_fee", "DECIMAL(12,2)")
    await add_column_if_not_exists(db, "business_orders", "final_amount", "DECIMAL(12,2)")
    
    logger.info("v1.0.0 迁移完成")


async def migrate_v1_1_0(db: AsyncSession) -> None:
    """
    v1.1.0 迁移：添加装卸货日期字段和冷藏费开关
    - 为 business_orders 表添加 loading_date 和 unloading_date 字段
    - 为 business_orders 表添加 calculate_storage_fee 字段（是否计算冷藏费）
    """
    logger.info("执行 v1.1.0 迁移...")
    
    # 添加装卸货日期字段
    await add_column_if_not_exists(db, "v3_business_orders", "loading_date", "DATETIME")
    await add_column_if_not_exists(db, "v3_business_orders", "unloading_date", "DATETIME")
    
    # 添加冷藏费开关字段（默认为1=True，计算冷藏费）
    await add_column_if_not_exists(db, "v3_business_orders", "calculate_storage_fee", "BOOLEAN", "1")
    
    logger.info("v1.1.0 迁移完成")


# 迁移脚本映射
MIGRATIONS = {
    "1.0.0": migrate_v1_0_0,
    "1.1.0": migrate_v1_1_0,
}


async def run_migrations(db: AsyncSession) -> dict:
    """
    运行数据库迁移
    
    返回迁移结果统计
    """
    result = {
        "old_version": None,
        "new_version": CURRENT_DB_VERSION,
        "migrations_run": [],
        "errors": []
    }
    
    try:
        # 确保系统配置表存在
        await ensure_system_config_table(db)
        
        # 获取当前版本
        current_version = await get_db_version(db)
        result["old_version"] = current_version
        
        if current_version == CURRENT_DB_VERSION:
            logger.info(f"数据库已是最新版本: {CURRENT_DB_VERSION}")
            return result
        
        logger.info(f"数据库版本: {current_version or '未知'} -> {CURRENT_DB_VERSION}")
        
        # 执行所有迁移（简化处理：总是执行所有迁移，由迁移脚本自行判断是否需要执行）
        for version, migration_func in MIGRATIONS.items():
            try:
                await migration_func(db)
                result["migrations_run"].append(version)
            except Exception as e:
                error_msg = f"迁移 {version} 失败: {e}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
        
        # 更新版本号
        await set_db_version(db, CURRENT_DB_VERSION)
        logger.info(f"数据库迁移完成，当前版本: {CURRENT_DB_VERSION}")
        
    except Exception as e:
        error_msg = f"数据库迁移出错: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)
    
    return result

