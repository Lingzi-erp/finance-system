"""
数据库版本迁移模块

在启动时自动检查并更新数据库结构，确保兼容旧版本的数据备份文件。
同时自动修复基础配置数据（如扣重公式）。

迁移策略：
1. 每次启动都检查所有必需的列，不依赖版本号
2. 自动修复基础数据（扣重公式等）
3. 版本号用于追踪，但不作为迁移的唯一依据
"""

import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 当前数据库版本 - 每次有重要更新时递增
CURRENT_DB_VERSION = "1.2.11"


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


async def ensure_system_config_table(db: AsyncSession) -> bool:
    """确保 system_config 表存在"""
    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await db.commit()
        return True
    except Exception as e:
        logger.error(f"创建 system_config 表失败: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
        return False


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
    """
    如果列不存在则添加
    
    返回值:
        True: 成功添加了列
        False: 列已存在或添加失败
    """
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
        logger.info(f"[+] 已添加列: {table}.{column}")
        return True
    except Exception as e:
        # 单列添加失败不应该影响其他列，回滚并继续
        logger.warning(f"添加列 {table}.{column} 失败（可能已存在）: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
        return False


# ========== 必需的数据库列定义 ==========
# 格式: (表名, 列名, 列类型, 默认值)
# 注意：这里列出所有可能在版本迭代中新增的列，确保老用户升级时自动添加
REQUIRED_COLUMNS = [
    # ========== v3_products ==========
    ("v3_products", "unit_id", "INTEGER", None),
    
    # ========== v3_order_items ==========
    # 基础字段
    ("v3_order_items", "gross_weight", "DECIMAL(12,2)", None),
    ("v3_order_items", "deduction_formula_id", "INTEGER", None),
    ("v3_order_items", "storage_rate", "DECIMAL(10,4)", None),
    ("v3_order_items", "logistics_company_id", "INTEGER", None),
    ("v3_order_items", "batch_id", "INTEGER", None),
    # 规格相关
    ("v3_order_items", "spec_id", "INTEGER", None),
    ("v3_order_items", "spec_name", "VARCHAR(50)", None),
    # 复式单位相关
    ("v3_order_items", "composite_unit_id", "INTEGER", None),
    ("v3_order_items", "composite_unit_name", "VARCHAR(50)", None),
    ("v3_order_items", "container_name", "VARCHAR(20)", None),
    ("v3_order_items", "unit_quantity", "FLOAT", None),
    ("v3_order_items", "base_unit_symbol", "VARCHAR(10)", None),
    ("v3_order_items", "pricing_mode", "VARCHAR(20)", "'weight'"),
    ("v3_order_items", "container_count", "DECIMAL(12,2)", None),
    # 运输信息
    ("v3_order_items", "vehicle_id", "INTEGER", None),
    ("v3_order_items", "plate_number", "VARCHAR(20)", None),
    ("v3_order_items", "driver_phone", "VARCHAR(20)", None),
    ("v3_order_items", "logistics_company", "VARCHAR(100)", None),
    ("v3_order_items", "invoice_no", "VARCHAR(50)", None),
    ("v3_order_items", "shipping_type", "VARCHAR(20)", None),
    ("v3_order_items", "shipping_rate", "DECIMAL(12,4)", None),
    # 批次分配（退货时使用）
    ("v3_order_items", "batch_allocations_json", "TEXT", None),
    
    # ========== v3_business_orders ==========
    ("v3_business_orders", "total_shipping", "DECIMAL(12,2)", "0"),
    ("v3_business_orders", "total_storage_fee", "DECIMAL(12,2)", "0"),
    ("v3_business_orders", "other_fee", "DECIMAL(12,2)", "0"),
    ("v3_business_orders", "final_amount", "DECIMAL(12,2)", "0"),
    ("v3_business_orders", "loading_date", "DATETIME", None),
    ("v3_business_orders", "unloading_date", "DATETIME", None),
    ("v3_business_orders", "calculate_storage_fee", "BOOLEAN", "1"),
    
    # ========== v3_stock_batches ==========
    ("v3_stock_batches", "received_at", "DATETIME", None),
    ("v3_stock_batches", "is_initial", "BOOLEAN", "0"),
    ("v3_stock_batches", "current_gross_weight", "DECIMAL(12,2)", None),
    ("v3_stock_batches", "deduction_formula_id", "INTEGER", None),
    # 规格相关（v1.2.6+）
    ("v3_stock_batches", "spec_id", "INTEGER", None),
    ("v3_stock_batches", "spec_name", "VARCHAR(50)", None),
    
    # ========== v3_stocks ==========
    # 规格相关（v1.2.6+）
    ("v3_stocks", "spec_id", "INTEGER", None),
    ("v3_stocks", "spec_name", "VARCHAR(50)", None),
    
    # ========== v3_account_balances ==========
    ("v3_account_balances", "is_initial", "BOOLEAN", "0"),
    
    # ========== v3_entities ==========
    ("v3_entities", "is_system", "BOOLEAN", "0"),
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


# ========== 必需的基础数据定义 ==========
# 扣重公式：硬编码的三种标准公式
# 注意：percentage 类型的 value 是乘数，0.99 表示扣1%（净重=毛重×0.99）
# 使用字符串避免 SQLite 绑定 Decimal 类型的问题
REQUIRED_DEDUCTION_FORMULAS = [
    {
        "name": "不扣重", 
        "formula_type": "none", 
        "value": "1.0000",  # none类型value不使用，但设为1
        "description": "净重等于毛重，不扣除任何重量",
        "is_default": 1,  # SQLite 布尔用 1/0
        "sort_order": 1
    },
    {
        "name": "扣1%", 
        "formula_type": "percentage", 
        "value": "0.9900",  # 净重 = 毛重 × 0.99
        "description": "扣除1%的冰块/包装重量",
        "is_default": 0,
        "sort_order": 2
    },
    {
        "name": "每件扣0.5kg", 
        "formula_type": "fixed_per_unit", 
        "value": "0.5000",  # 每件扣0.5kg
        "description": "按件扣重，适用于有冰块包装的散件",
        "is_default": 0,
        "sort_order": 3
    },
]

# 旧版本的错误公式名称（需要替换掉）
OLD_FORMULA_NAMES = ["标准1%扣重", "标准2%扣重", "固定5kg扣重"]

# 系统客商：杂费支出（用于其他费用的账款关联）
SYSTEM_MISC_EXPENSE_ENTITY = {
    "code": "SYS_MISC_EXPENSE",
    "name": "杂费支出",
    "entity_type": "other",
    "is_system": True,  # 标记为系统客商，不可删除
    "credit_level": 5,  # 必须设置，否则为NULL会导致Pydantic验证失败
}


async def ensure_deduction_formulas(db: AsyncSession) -> dict:
    """
    确保扣重公式数据正确
    
    策略：
    1. 如果表为空 → 创建标准公式
    2. 如果存在旧的错误公式 → 删除重建
    3. 如果现有公式的 value 不正确（如扣1%的value不是0.99）→ 更新
    4. 如果缺少必需公式 → 补充
    
    目标：让老用户无感知升级，新用户自动拥有正确配置
    """
    result = {
        "checked": True,
        "action": "none",
        "details": []
    }
    
    # 检查表是否存在
    if not await check_table_exists(db, "v3_deduction_formulas"):
        result["action"] = "table_not_exists"
        return result
    
    try:
        # 获取现有公式
        query = await db.execute(text(
            "SELECT id, name, formula_type, value FROM v3_deduction_formulas"
        ))
        existing = query.fetchall()
        existing_map = {row[1]: {"id": row[0], "type": row[2], "value": float(row[3])} for row in existing}
        existing_names = list(existing_map.keys())
        
        need_full_rebuild = False
        need_update = False
        
        # 检查1: 没有任何公式
        if len(existing) == 0:
            need_full_rebuild = True
            result["details"].append("没有扣重公式，需要创建")
        
        # 检查2: 存在旧版本的错误公式名称
        if any(name in existing_names for name in OLD_FORMULA_NAMES):
            need_full_rebuild = True
            result["details"].append("发现旧版本公式名称，需要更新")
        
        # 检查3: 现有公式的 value 不正确
        if not need_full_rebuild:
            # 检查"扣1%"的value是否正确（应该是0.99，不是1）
            if "扣1%" in existing_map:
                current_value = float(existing_map["扣1%"]["value"]) if existing_map["扣1%"]["value"] else 0
                if abs(current_value - 0.99) > 0.001:  # 不是0.99
                    need_full_rebuild = True
                    result["details"].append(f"扣1%公式的value不正确({current_value})，需要修复为0.99")
            
            # 检查"不扣重"的 formula_type 是否正确
            if "不扣重" in existing_map:
                current_type = existing_map["不扣重"]["type"]
                if current_type != "none":
                    need_full_rebuild = True
                    result["details"].append(f"不扣重公式的类型不正确({current_type})，需要修复为none")
        
        # 检查4: 缺少必需的公式
        if not need_full_rebuild:
            required_names = [f["name"] for f in REQUIRED_DEDUCTION_FORMULAS]
            missing = [name for name in required_names if name not in existing_names]
            if missing:
                need_update = True
                result["details"].append(f"缺少公式: {', '.join(missing)}")
        
        # 执行修复
        if need_full_rebuild:
            # 完全重建：删除所有现有公式，创建标准公式
            await db.execute(text("DELETE FROM v3_deduction_formulas"))
            
            for formula in REQUIRED_DEDUCTION_FORMULAS:
                await db.execute(text("""
                    INSERT INTO v3_deduction_formulas 
                    (name, formula_type, value, description, is_default, is_active, sort_order, created_by, created_at, updated_at)
                    VALUES (:name, :formula_type, :value, :description, :is_default, 1, :sort_order, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """), formula)
            
            await db.commit()
            result["action"] = "rebuilt"
            result["details"].append("已重建全部标准扣重公式")
            logger.info("扣重公式已完全重建为标准配置")
            
        elif need_update:
            # 部分更新：只添加缺失的公式
            for formula in REQUIRED_DEDUCTION_FORMULAS:
                if formula["name"] not in existing_names:
                    await db.execute(text("""
                        INSERT INTO v3_deduction_formulas 
                        (name, formula_type, value, description, is_default, is_active, sort_order, created_by, created_at, updated_at)
                        VALUES (:name, :formula_type, :value, :description, :is_default, 1, :sort_order, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """), formula)
            
            await db.commit()
            result["action"] = "updated"
            result["details"].append("已补充缺失的扣重公式")
            logger.info("扣重公式已补充完整")
        else:
            result["action"] = "ok"
            result["details"].append("扣重公式配置正确，无需更新")
            
    except Exception as e:
        logger.error(f"检查扣重公式失败: {e}")
        result["action"] = "error"
        result["details"].append(str(e))
        # 尝试回滚
        try:
            await db.rollback()
        except Exception:
            pass
    
    return result


async def ensure_misc_expense_entity(db: AsyncSession) -> dict:
    """
    确保"杂费支出"系统客商存在
    
    用于关联其他费用产生的账款
    """
    result = {
        "checked": True,
        "action": "none",
        "entity_id": None
    }
    
    # 检查表是否存在
    if not await check_table_exists(db, "v3_entities"):
        result["action"] = "table_not_exists"
        return result
    
    try:
        # 检查是否已存在
        query = await db.execute(text(
            "SELECT id FROM v3_entities WHERE code = :code"
        ), {"code": SYSTEM_MISC_EXPENSE_ENTITY["code"]})
        existing = query.fetchone()
        
        if existing:
            result["action"] = "exists"
            result["entity_id"] = existing[0]
        else:
            # 创建杂费客商
            await db.execute(text("""
                INSERT INTO v3_entities 
                (code, name, entity_type, credit_level, is_active, is_system, created_by, created_at, updated_at)
                VALUES (:code, :name, :entity_type, 5, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), SYSTEM_MISC_EXPENSE_ENTITY)
            await db.commit()
            
            # 获取新创建的ID
            query = await db.execute(text(
                "SELECT id FROM v3_entities WHERE code = :code"
            ), {"code": SYSTEM_MISC_EXPENSE_ENTITY["code"]})
            new_entity = query.fetchone()
            
            result["action"] = "created"
            result["entity_id"] = new_entity[0] if new_entity else None
            logger.info(f"已创建系统客商: {SYSTEM_MISC_EXPENSE_ENTITY['name']}")
            
    except Exception as e:
        logger.error(f"确保杂费客商失败: {e}")
        result["action"] = "error"
        result["error"] = str(e)
        try:
            await db.rollback()
        except Exception:
            pass
    
    return result


async def fix_null_fields(db: AsyncSession) -> dict:
    """
    修复数据库中的 NULL 字段，设置为默认值
    """
    result = {"fixed": 0}
    
    try:
        # 修复 v3_entities 中的 credit_level 为 NULL 的记录
        await db.execute(text(
            "UPDATE v3_entities SET credit_level = 5 WHERE credit_level IS NULL"
        ))
        await db.commit()
        result["fixed"] += 1
    except Exception as e:
        logger.warning(f"修复 NULL 字段时出错: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
    
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
        
        # ★ 修复 NULL 字段 ★
        await fix_null_fields(db)
        
        # ★ 检查并修复基础数据 ★
        formula_result = await ensure_deduction_formulas(db)
        result["deduction_formulas"] = formula_result
        if formula_result["action"] in ["rebuilt", "updated"]:
            logger.info("基础数据已修复: 扣重公式")
        
        # ★ 确保杂费客商存在 ★
        misc_entity_result = await ensure_misc_expense_entity(db)
        result["misc_expense_entity"] = misc_entity_result
        if misc_entity_result["action"] == "created":
            logger.info("基础数据已创建: 杂费支出客商")
        
        # 更新版本号
        if current_version != CURRENT_DB_VERSION:
            await set_db_version(db, CURRENT_DB_VERSION)
            logger.info(f"数据库版本已更新为: {CURRENT_DB_VERSION}")
        
    except Exception as e:
        error_msg = f"数据库迁移出错: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)
    
    return result

