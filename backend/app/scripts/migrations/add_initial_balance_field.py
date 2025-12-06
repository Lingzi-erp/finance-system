"""
添加期初数据相关字段
- AccountBalance.is_initial: 标识是否为期初数据
- AccountBalance.order_id: 允许为空（期初数据无关联订单）

SQLite 不支持修改列约束，需要重建表
"""

import asyncio
from sqlalchemy import text
from app.db.session import engine

async def migrate():
    async with engine.begin() as conn:
        # 检查 is_initial 字段是否存在
        result = await conn.execute(text(
            "SELECT COUNT(*) FROM pragma_table_info('v3_account_balances') WHERE name='is_initial'"
        ))
        has_is_initial = result.scalar() > 0
        
        # 检查 order_id 是否允许 NULL
        result = await conn.execute(text(
            "SELECT \"notnull\" FROM pragma_table_info('v3_account_balances') WHERE name='order_id'"
        ))
        row = result.first()
        order_id_is_not_null = row[0] == 1 if row else False
        
        if order_id_is_not_null:
            print("需要重建表以允许 order_id 为空...")
            
            # SQLite 重建表步骤
            # 1. 创建新表
            await conn.execute(text("""
                CREATE TABLE v3_account_balances_new (
                    id INTEGER PRIMARY KEY,
                    entity_id INTEGER NOT NULL,
                    order_id INTEGER,
                    is_initial BOOLEAN DEFAULT 0,
                    balance_type VARCHAR(20) NOT NULL,
                    amount DECIMAL(12, 2) NOT NULL,
                    paid_amount DECIMAL(12, 2) DEFAULT 0.00,
                    balance DECIMAL(12, 2) DEFAULT 0.00,
                    due_date DATETIME,
                    status VARCHAR(20) DEFAULT 'pending',
                    notes TEXT,
                    created_by INTEGER NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY (entity_id) REFERENCES v3_entities(id),
                    FOREIGN KEY (order_id) REFERENCES v3_business_orders(id),
                    FOREIGN KEY (created_by) REFERENCES sys_user(id)
                )
            """))
            print("✓ 新表创建成功")
            
            # 2. 复制数据
            if has_is_initial:
                await conn.execute(text("""
                    INSERT INTO v3_account_balances_new 
                    SELECT id, entity_id, order_id, is_initial, balance_type, amount, 
                           paid_amount, balance, due_date, status, notes, 
                           created_by, created_at, updated_at
                    FROM v3_account_balances
                """))
            else:
                await conn.execute(text("""
                    INSERT INTO v3_account_balances_new 
                    (id, entity_id, order_id, is_initial, balance_type, amount, 
                     paid_amount, balance, due_date, status, notes, 
                     created_by, created_at, updated_at)
                    SELECT id, entity_id, order_id, 0, balance_type, amount, 
                           paid_amount, balance, due_date, status, notes, 
                           created_by, created_at, updated_at
                    FROM v3_account_balances
                """))
            print("✓ 数据迁移成功")
            
            # 3. 删除旧表
            await conn.execute(text("DROP TABLE v3_account_balances"))
            print("✓ 旧表删除成功")
            
            # 4. 重命名新表
            await conn.execute(text("ALTER TABLE v3_account_balances_new RENAME TO v3_account_balances"))
            print("✓ 表重命名成功")
            
            # 5. 重建索引
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_v3_account_balances_entity_id ON v3_account_balances(entity_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_v3_account_balances_order_id ON v3_account_balances(order_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_v3_account_balances_balance_type ON v3_account_balances(balance_type)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_v3_account_balances_status ON v3_account_balances(status)"))
            print("✓ 索引重建成功")
        else:
            print("✓ order_id 已允许为空")
            
            # 只需添加 is_initial 字段
            if not has_is_initial:
                print("添加 is_initial 字段...")
                await conn.execute(text(
                    "ALTER TABLE v3_account_balances ADD COLUMN is_initial BOOLEAN DEFAULT 0"
                ))
                print("✓ is_initial 字段添加成功")
            else:
                print("✓ is_initial 字段已存在")
        
        print("\n迁移完成！")

if __name__ == "__main__":
    asyncio.run(migrate())

