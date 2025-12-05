"""插入v2演示数据"""
import asyncio
from sqlalchemy import text
from app.db.session import engine

async def insert_demo():
    async with engine.begin() as conn:
        # 检查是否已有数据
        result = await conn.execute(text('SELECT COUNT(*) FROM partners'))
        count = result.scalar()
        if count > 0:
            print('已存在数据，跳过')
            return
        
        # 插入合作方
        await conn.execute(text("""
            INSERT INTO partners (name, code, partner_type, contact_name, phone, credit_level, created_by)
            VALUES 
                ('张三供应商', 'S0001', 'supplier', '张三', '13800138001', 8, 1),
                ('李四客户', 'C0001', 'customer', '李四', '13800138002', 7, 1),
                ('王五贸易', 'B0001', 'both', '王五', '13800138003', 9, 1)
        """))
        print('✓ 插入合作方')
        
        # 插入产品
        await conn.execute(text("""
            INSERT INTO products (name, code, category, unit, purchase_price, sale_price, created_by)
            VALUES 
                ('办公桌', 'P0001', '办公家具', '张', 500.00, 800.00, 1),
                ('办公椅', 'P0002', '办公家具', '把', 200.00, 350.00, 1),
                ('打印纸', 'P0003', '办公用品', '箱', 80.00, 120.00, 1)
        """))
        print('✓ 插入产品')
        
        # 插入仓库
        await conn.execute(text("""
            INSERT INTO warehouses (name, code, address, created_by)
            VALUES 
                ('主仓库', 'WH001', '北京市朝阳区', 1),
                ('分仓库', 'WH002', '北京市海淀区', 1)
        """))
        print('✓ 插入仓库')
        
        # 插入交易
        await conn.execute(text("""
            INSERT INTO transactions 
                (transaction_no, transaction_type, partner_id, product_id, warehouse_id, 
                 quantity, unit_price, total_amount, created_by)
            VALUES 
                ('IN202312001', 'inbound', 1, 1, 1, 10, 500.00, 5000.00, 1),
                ('IN202312002', 'inbound', 1, 2, 1, 20, 200.00, 4000.00, 1),
                ('OUT202312001', 'outbound', 2, 1, 1, 3, 800.00, 2400.00, 1)
        """))
        print('✓ 插入交易记录')
        print('演示数据插入完成!')

if __name__ == "__main__":
    asyncio.run(insert_demo())

