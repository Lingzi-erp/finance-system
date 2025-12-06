"""
数据库版本迁移模块

在启动时自动检查并更新数据库结构，确保兼容旧版本的数据备份文件。
"""

import logging
from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 当前数据库版本
CURRENT_DB_VERSION = "1.1.5"


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


async def check_table_exists(db: AsyncSession, table: str) -> bool:
    """检查表是否存在"""
    try:
        result = await db.execute(text(
            f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'"
        ))
        return result.fetchone() is not None
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
    # 先检查表是否存在
    if not await check_table_exists(db, table):
        logger.debug(f"表 {table} 不存在，跳过添加列 {column}")
        return False
    
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


# ========== 必需的数据库列定义 ==========
# 格式: (表名, 列名, 列类型, 默认值)
REQUIRED_COLUMNS = [
    # v3_products
    ("v3_products", "unit_id", "INTEGER", None),
    
    # v3_order_items
    ("v3_order_items", "gross_weight", "DECIMAL(12,3)", None),
    ("v3_order_items", "deduction_formula_id", "INTEGER", None),
    ("v3_order_items", "storage_rate", "DECIMAL(10,2)", None),
    ("v3_order_items", "logistics_company_id", "INTEGER", None),
    
    # v3_business_orders
    ("v3_business_orders", "total_shipping", "DECIMAL(12,2)", None),
    ("v3_business_orders", "total_storage_fee", "DECIMAL(12,2)", None),
    ("v3_business_orders", "final_amount", "DECIMAL(12,2)", None),
    ("v3_business_orders", "loading_date", "DATETIME", None),
    ("v3_business_orders", "unloading_date", "DATETIME", None),
    ("v3_business_orders", "calculate_storage_fee", "BOOLEAN", "1"),
    
    # v3_account_balances
    ("v3_account_balances", "is_initial", "BOOLEAN", "0"),
]


async def ensure_all_columns(db: AsyncSession) -> dict:
    """
    确保所有必需的列都存在
    每次启动都会检查，不依赖版本号
    """
    result = {
        "checked": 0,
        "added": 0,
        "columns_added": []
    }
    
    for table, column, col_type, default in REQUIRED_COLUMNS:
        result["checked"] += 1
        added = await add_column_if_not_exists(db, table, column, col_type, default)
        if added:
            result["added"] += 1
            result["columns_added"].append(f"{table}.{column}")
    
    return result


async def run_migrations(db: AsyncSession) -> dict:
    """
    运行数据库迁移
    
    关键改进：每次启动都检查所有必需列，不仅仅依赖版本号
    """
    result = {
        "old_version": None,
        "new_version": CURRENT_DB_VERSION,
        "migrations_run": [],
        "columns_added": [],
        "errors": []
    }
    
    try:
        # 确保系统配置表存在
        await ensure_system_config_table(db)
        
        # 获取当前版本
        current_version = await get_db_version(db)
        result["old_version"] = current_version
        
        logger.info(f"数据库版本检查: {current_version or '未知'} -> {CURRENT_DB_VERSION}")
        
        # ★ 关键：无论版本号是什么，都强制检查所有必需列 ★
        column_result = await ensure_all_columns(db)
        result["columns_added"] = column_result["columns_added"]
        
        if column_result["added"] > 0:
            logger.info(f"数据库结构更新: 添加了 {column_result['added']} 个列")
            for col in column_result["columns_added"]:
                logger.info(f"  - {col}")
        else:
            logger.info("数据库结构完整，无需更新")
        
        # 更新版本号
        if current_version != CURRENT_DB_VERSION:
            await set_db_version(db, CURRENT_DB_VERSION)
            logger.info(f"数据库版本已更新为: {CURRENT_DB_VERSION}")
        
    except Exception as e:
        error_msg = f"数据库迁移出错: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)
    
    return result

