"""
数据库迁移脚本：为v3_order_items表添加物流相关字段
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from sqlalchemy import text
from app.db.session import SessionLocal as AsyncSessionLocal


async def run_migration():
    """运行迁移"""
    async with AsyncSessionLocal() as db:
        try:
            # 检查并添加缺失的列
            columns_to_add = [
                ("plate_number", "VARCHAR(20)"),
                ("driver_phone", "VARCHAR(20)"),
                ("logistics_company", "VARCHAR(100)"),
                ("invoice_no", "VARCHAR(50)"),
            ]
            
            for column_name, column_type in columns_to_add:
                try:
                    # 尝试查询该列，如果不存在会报错
                    await db.execute(text(f"SELECT {column_name} FROM v3_order_items LIMIT 1"))
                    print(f"✓ 列 {column_name} 已存在")
                except Exception:
                    # 列不存在，添加它
                    await db.execute(text(f"ALTER TABLE v3_order_items ADD COLUMN {column_name} {column_type}"))
                    print(f"✓ 已添加列 {column_name}")
            
            await db.commit()
            print("\n迁移完成！")
            
        except Exception as e:
            print(f"迁移失败: {e}")
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(run_migration())

