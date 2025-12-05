"""商品规格系统迁移脚本"""
import asyncio
from sqlalchemy import text
from app.db.session import engine

async def run_migration():
    async with engine.begin() as conn:
        print("=" * 50)
        print("商品规格系统迁移开始")
        print("=" * 50)
        
        # 1. 创建 v3_product_specs 表
        print("\n1. 创建 v3_product_specs 表...")
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS v3_product_specs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    name VARCHAR(50) NOT NULL,
                    container_name VARCHAR(20) NOT NULL,
                    quantity FLOAT NOT NULL DEFAULT 1.0,
                    unit_id INTEGER NOT NULL,
                    is_default BOOLEAN DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES v3_products(id),
                    FOREIGN KEY (unit_id) REFERENCES v3_units(id)
                )
            """))
            print("  ✓ v3_product_specs 表创建成功")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("  - v3_product_specs 表已存在，跳过")
            else:
                print(f"  ! 创建表失败: {e}")
        
        # 2. 添加索引
        print("\n2. 添加索引...")
        try:
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_product_specs_product_id ON v3_product_specs(product_id)"
            ))
            print("  ✓ 索引创建成功")
        except Exception as e:
            print(f"  - 索引创建跳过: {e}")
        
        # 3. 添加 v3_order_items 新字段（如果不存在）
        print("\n3. 检查/添加 v3_order_items 字段...")
        new_columns = [
            ("composite_unit_id", "INTEGER"),
            ("composite_unit_name", "VARCHAR(50)"),
            ("container_name", "VARCHAR(20)"),
            ("unit_quantity", "FLOAT"),
            ("base_unit_symbol", "VARCHAR(10)"),
            ("pricing_mode", "VARCHAR(20) DEFAULT 'weight'"),
            ("container_count", "DECIMAL(12, 2)"),
            ("spec_id", "INTEGER"),  # 新增：关联的规格ID快照
            ("spec_name", "VARCHAR(50)"),  # 新增：规格名称快照
        ]
        for col_name, col_def in new_columns:
            try:
                await conn.execute(text(f"ALTER TABLE v3_order_items ADD COLUMN {col_name} {col_def}"))
                print(f"  ✓ 添加字段 {col_name}")
            except Exception as e:
                if "duplicate column" in str(e).lower():
                    print(f"  - 字段 {col_name} 已存在，跳过")
                else:
                    print(f"  ! 添加 {col_name} 失败: {e}")
        
        # 4. 迁移现有复式单位数据到 product_specs
        print("\n4. 迁移现有复式单位数据...")
        try:
            # 查找有 composite_unit_id 的商品
            result = await conn.execute(text("""
                SELECT p.id, p.composite_unit_id, cu.name, cu.container_name, cu.quantity, cu.unit_id
                FROM v3_products p
                JOIN v3_composite_units cu ON p.composite_unit_id = cu.id
                WHERE p.composite_unit_id IS NOT NULL
            """))
            products_with_composite = result.fetchall()
            
            migrated_count = 0
            for row in products_with_composite:
                product_id, composite_unit_id, cu_name, container_name, quantity, unit_id = row
                
                # 检查是否已有规格
                existing = await conn.execute(text(
                    "SELECT id FROM v3_product_specs WHERE product_id = :pid LIMIT 1"
                ), {"pid": product_id})
                if existing.fetchone():
                    continue
                
                # 创建规格
                await conn.execute(text("""
                    INSERT INTO v3_product_specs (product_id, name, container_name, quantity, unit_id, is_default, is_active)
                    VALUES (:product_id, :name, :container_name, :quantity, :unit_id, 1, 1)
                """), {
                    "product_id": product_id,
                    "name": cu_name or container_name,
                    "container_name": container_name,
                    "quantity": quantity,
                    "unit_id": unit_id,
                })
                migrated_count += 1
            
            print(f"  ✓ 迁移了 {migrated_count} 个商品的复式单位到规格")
        except Exception as e:
            print(f"  ! 迁移复式单位失败: {e}")
        
        print("\n" + "=" * 50)
        print("迁移完成!")
        print("=" * 50)

if __name__ == "__main__":
    asyncio.run(run_migration())
