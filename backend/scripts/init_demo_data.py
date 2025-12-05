"""
演示数据初始化脚本
- 重置数据库（保留表结构）
- 创建管理员账户
- 创建演示用的实体、商品、业务单等数据
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.core.auth.security import get_password_hash

# 导入所有模型
from app.models.user import User
from app.models.v3 import (
    Entity, Category, Product, BusinessOrder, OrderItem, OrderFlow,
    Stock, StockFlow, AccountBalance, PaymentRecord, AuditLog,
    Role, UnitGroup, Unit
)


async def clear_all_data(db: AsyncSession):
    """清除所有业务数据（保留表结构）"""
    print("🗑️  清除所有数据...")
    
    # 按照外键依赖顺序删除
    tables_to_clear = [
        "v3_audit_logs",
        "v3_payment_records",
        "v3_account_balances",
        "v3_stock_flows",
        "v3_stocks",
        "v3_order_flows",
        "v3_order_items",
        "v3_business_orders",
        "v3_products",
        "v3_categories",
        "v3_units",
        "v3_composite_units",
        "v3_unit_groups",
        "v3_specifications",
        "v3_entities",
        "v3_user_roles",
        "v3_roles",
        "sys_user",
    ]
    
    for table in tables_to_clear:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
            print(f"   ✓ 清除 {table}")
        except Exception as e:
            print(f"   ⚠ 跳过 {table}: {e}")
    
    await db.commit()
    print("   完成！\n")


async def create_admin_user(db: AsyncSession) -> User:
    """创建管理员用户"""
    print("👤 创建管理员用户...")
    
    admin = User(
        username="admin",
        password=get_password_hash("admin123"),
        role="admin",
        status=True
    )
    db.add(admin)
    await db.flush()
    
    print(f"   ✓ 管理员: admin / admin123")
    return admin


async def create_entities(db: AsyncSession, admin_id: int) -> dict:
    """创建实体（供应商、客户、仓库）"""
    print("🏢 创建实体...")
    
    entities = {}
    
    # 供应商
    suppliers = [
        {"code": "SP001", "name": "华东电子供应商", "entity_type": "supplier", "contact_name": "张经理", "phone": "13800001111", "address": "上海市浦东新区"},
        {"code": "SP002", "name": "北方五金批发", "entity_type": "supplier", "contact_name": "李总", "phone": "13800002222", "address": "北京市朝阳区"},
    ]
    
    # 客户
    customers = [
        {"code": "CU001", "name": "阳光超市", "entity_type": "customer", "contact_name": "王店长", "phone": "13900001111", "address": "杭州市西湖区", "credit_limit": Decimal("50000")},
        {"code": "CU002", "name": "便利蜂连锁", "entity_type": "customer", "contact_name": "赵采购", "phone": "13900002222", "address": "深圳市南山区", "credit_limit": Decimal("100000")},
        {"code": "CU003", "name": "社区小卖部", "entity_type": "customer", "contact_name": "刘老板", "phone": "13900003333", "address": "广州市天河区", "credit_limit": Decimal("10000")},
    ]
    
    # 仓库
    warehouses = [
        {"code": "WH001", "name": "总仓", "entity_type": "warehouse", "address": "本市工业园区A栋"},
        {"code": "WH002", "name": "门店仓", "entity_type": "warehouse", "address": "本市商业街1号"},
    ]
    
    for data in suppliers + customers + warehouses:
        entity = Entity(
            **data,
            is_active=True,
            created_by=admin_id
        )
        db.add(entity)
        await db.flush()
        entities[data["code"]] = entity
        print(f"   ✓ {data['entity_type']}: {data['name']} ({data['code']})")
    
    return entities


async def create_categories(db: AsyncSession, admin_id: int) -> dict:
    """创建商品分类"""
    print("📁 创建分类...")
    
    categories = {}
    cat_data = [
        {"code": "ELEC", "name": "电子产品"},
        {"code": "FOOD", "name": "食品饮料"},
        {"code": "DAILY", "name": "日用百货"},
    ]
    
    for data in cat_data:
        cat = Category(**data, is_active=True, created_by=admin_id)
        db.add(cat)
        await db.flush()
        categories[data["code"]] = cat
        print(f"   ✓ {data['name']}")
    
    return categories


async def create_products(db: AsyncSession, admin_id: int, categories: dict) -> dict:
    """创建商品"""
    print("📦 创建商品...")
    
    products = {}
    prod_data = [
        {"code": "P001", "name": "无线蓝牙耳机", "category": "ELEC", "cost_price": Decimal("45"), "suggested_price": Decimal("99"), "unit": "个"},
        {"code": "P002", "name": "充电宝10000mAh", "category": "ELEC", "cost_price": Decimal("35"), "suggested_price": Decimal("79"), "unit": "个"},
        {"code": "P003", "name": "USB数据线", "category": "ELEC", "cost_price": Decimal("3"), "suggested_price": Decimal("15"), "unit": "条"},
        {"code": "P004", "name": "农夫山泉550ml", "category": "FOOD", "cost_price": Decimal("0.8"), "suggested_price": Decimal("2"), "unit": "瓶"},
        {"code": "P005", "name": "康师傅方便面", "category": "FOOD", "cost_price": Decimal("2.5"), "suggested_price": Decimal("5"), "unit": "袋"},
        {"code": "P006", "name": "洗衣液2L", "category": "DAILY", "cost_price": Decimal("15"), "suggested_price": Decimal("35"), "unit": "瓶"},
        {"code": "P007", "name": "抽纸巾3包装", "category": "DAILY", "cost_price": Decimal("8"), "suggested_price": Decimal("18"), "unit": "提"},
    ]
    
    for data in prod_data:
        prod = Product(
            code=data["code"],
            name=data["name"],
            category_id=categories[data["category"]].id,
            cost_price=data["cost_price"],
            suggested_price=data["suggested_price"],
            unit=data["unit"],  # 使用unit字符串字段而不是base_unit关系
            is_active=True,
            created_by=admin_id
        )
        db.add(prod)
        await db.flush()
        products[data["code"]] = prod
        print(f"   ✓ {data['name']} ({data['code']}) 成本¥{data['cost_price']} 售价¥{data['suggested_price']}")
    
    return products


async def create_demo_orders(db: AsyncSession, admin_id: int, entities: dict, products: dict):
    """创建演示业务单"""
    print("📋 创建演示业务单...")
    
    today = datetime.now()
    
    # === 采购单1: 从华东电子采购电子产品到总仓 ===
    po1 = BusinessOrder(
        order_no="PO" + today.strftime("%Y%m%d") + "001",
        order_type="purchase",
        status="completed",
        source_id=entities["SP001"].id,  # 供应商
        target_id=entities["WH001"].id,  # 总仓
        order_date=today - timedelta(days=2),
        completed_at=today - timedelta(days=2),
        notes="演示数据 - 电子产品采购",
        created_by=admin_id
    )
    db.add(po1)
    await db.flush()
    
    # 采购明细
    po1_items = [
        {"product": "P001", "qty": 100, "price": Decimal("45")},  # 蓝牙耳机
        {"product": "P002", "qty": 50, "price": Decimal("35")},   # 充电宝
        {"product": "P003", "qty": 200, "price": Decimal("3")},   # 数据线
    ]
    total = Decimal("0")
    for item_data in po1_items:
        prod = products[item_data["product"]]
        amount = item_data["qty"] * item_data["price"]
        total += amount
        item = OrderItem(
            order_id=po1.id,
            product_id=prod.id,
            quantity=item_data["qty"],
            unit_price=item_data["price"],
            amount=amount,
            subtotal=amount,
            cost_price=prod.cost_price,
            cost_amount=item_data["qty"] * prod.cost_price
        )
        db.add(item)
    
    po1.total_quantity = sum(i["qty"] for i in po1_items)
    po1.total_amount = total
    po1.final_amount = total
    
    print(f"   ✓ 采购单 {po1.order_no}: 电子产品 ¥{total}")
    
    # === 采购单2: 从北方五金采购日用品到总仓 ===
    po2 = BusinessOrder(
        order_no="PO" + today.strftime("%Y%m%d") + "002",
        order_type="purchase",
        status="completed",
        source_id=entities["SP002"].id,
        target_id=entities["WH001"].id,
        order_date=today - timedelta(days=1),
        completed_at=today - timedelta(days=1),
        notes="演示数据 - 日用品采购",
        created_by=admin_id
    )
    db.add(po2)
    await db.flush()
    
    po2_items = [
        {"product": "P004", "qty": 500, "price": Decimal("0.8")},  # 矿泉水
        {"product": "P005", "qty": 200, "price": Decimal("2.5")},  # 方便面
        {"product": "P006", "qty": 50, "price": Decimal("15")},    # 洗衣液
        {"product": "P007", "qty": 100, "price": Decimal("8")},    # 抽纸
    ]
    total = Decimal("0")
    for item_data in po2_items:
        prod = products[item_data["product"]]
        amount = item_data["qty"] * item_data["price"]
        total += amount
        item = OrderItem(
            order_id=po2.id,
            product_id=prod.id,
            quantity=item_data["qty"],
            unit_price=item_data["price"],
            amount=amount,
            subtotal=amount,
            cost_price=prod.cost_price,
            cost_amount=item_data["qty"] * prod.cost_price
        )
        db.add(item)
    
    po2.total_quantity = sum(i["qty"] for i in po2_items)
    po2.total_amount = total
    po2.final_amount = total
    
    print(f"   ✓ 采购单 {po2.order_no}: 日用品 ¥{total}")
    
    # === 销售单1: 卖给阳光超市 ===
    so1 = BusinessOrder(
        order_no="SO" + today.strftime("%Y%m%d") + "001",
        order_type="sale",
        status="completed",
        source_id=entities["WH001"].id,  # 从总仓出货
        target_id=entities["CU001"].id,  # 卖给客户
        order_date=today,
        completed_at=today,
        notes="演示数据 - 销售给阳光超市",
        created_by=admin_id
    )
    db.add(so1)
    await db.flush()
    
    so1_items = [
        {"product": "P001", "qty": 20, "price": Decimal("99")},   # 蓝牙耳机
        {"product": "P004", "qty": 100, "price": Decimal("2")},   # 矿泉水
        {"product": "P007", "qty": 30, "price": Decimal("18")},   # 抽纸
    ]
    total = Decimal("0")
    profit = Decimal("0")
    for item_data in so1_items:
        prod = products[item_data["product"]]
        amount = item_data["qty"] * item_data["price"]
        cost = item_data["qty"] * prod.cost_price
        total += amount
        profit += (amount - cost)
        item = OrderItem(
            order_id=so1.id,
            product_id=prod.id,
            quantity=item_data["qty"],
            unit_price=item_data["price"],
            amount=amount,
            subtotal=amount,
            cost_price=prod.cost_price,
            cost_amount=cost,
            profit=amount - cost
        )
        db.add(item)
    
    so1.total_quantity = sum(i["qty"] for i in so1_items)
    so1.total_amount = total
    so1.final_amount = total
    
    print(f"   ✓ 销售单 {so1.order_no}: 阳光超市 ¥{total} (利润 ¥{profit})")
    
    # === 调拨单: 总仓到门店仓 ===
    to1 = BusinessOrder(
        order_no="TO" + today.strftime("%Y%m%d") + "001",
        order_type="transfer",
        status="completed",
        source_id=entities["WH001"].id,
        target_id=entities["WH002"].id,
        order_date=today,
        completed_at=today,
        notes="演示数据 - 调拨到门店",
        created_by=admin_id
    )
    db.add(to1)
    await db.flush()
    
    to1_items = [
        {"product": "P002", "qty": 10, "price": Decimal("0")},
        {"product": "P005", "qty": 50, "price": Decimal("0")},
    ]
    for item_data in to1_items:
        prod = products[item_data["product"]]
        item = OrderItem(
            order_id=to1.id,
            product_id=prod.id,
            quantity=item_data["qty"],
            unit_price=Decimal("0"),
            amount=Decimal("0"),
            subtotal=Decimal("0")
        )
        db.add(item)
    
    to1.total_quantity = sum(i["qty"] for i in to1_items)
    to1.total_amount = Decimal("0")
    to1.final_amount = Decimal("0")
    
    print(f"   ✓ 调拨单 {to1.order_no}: 总仓→门店仓")
    
    await db.flush()
    return [po1, po2, so1, to1]


async def recalculate_stocks(db: AsyncSession, admin_id: int, entities: dict, products: dict, orders: list):
    """根据业务单重新计算库存（同时生成流水记录）"""
    print("📊 根据业务单计算库存...")
    
    # 清除现有库存和流水
    await db.execute(delete(StockFlow))
    await db.execute(delete(Stock))
    await db.flush()
    
    # 用于跟踪每个仓库-商品的库存记录和当前数量
    stock_records = {}  # {(warehouse_id, product_id): Stock}
    flow_count = 0
    
    async def get_or_create_stock(warehouse_id: int, product_id: int) -> Stock:
        """获取或创建库存记录"""
        key = (warehouse_id, product_id)
        if key not in stock_records:
            stock = Stock(
                warehouse_id=warehouse_id,
                product_id=product_id,
                quantity=0,
                safety_stock=10
            )
            db.add(stock)
            await db.flush()
            stock_records[key] = stock
        return stock_records[key]
    
    async def add_flow(stock: Stock, order: BusinessOrder, qty_change: int, flow_type: str):
        """添加库存流水"""
        nonlocal flow_count
        old_qty = stock.quantity
        stock.quantity += qty_change
        
        flow = StockFlow(
            stock_id=stock.id,
            order_id=order.id,
            flow_type=flow_type,
            quantity_change=qty_change,
            quantity_before=old_qty,
            quantity_after=stock.quantity,
            reason=f"{order.order_no}",
            operator_id=admin_id,
            operated_at=order.completed_at or order.order_date
        )
        db.add(flow)
        flow_count += 1
    
    # 按时间顺序处理订单
    sorted_orders = sorted(orders, key=lambda o: o.completed_at or o.order_date)
    
    for order in sorted_orders:
        if order.status != "completed":
            continue
            
        # 获取订单项
        items = []
        for item in await db.execute(
            text("SELECT id, product_id, quantity FROM v3_order_items WHERE order_id = :oid"),
            {"oid": order.id}
        ):
            items.append({"id": item[0], "product_id": item[1], "quantity": item[2]})
        
        for item in items:
            product_id = item["product_id"]
            qty = item["quantity"]
            
            if order.order_type == "purchase":
                # 采购：目标仓库入库
                stock = await get_or_create_stock(order.target_id, product_id)
                await add_flow(stock, order, qty, "in")
                
            elif order.order_type == "sale":
                # 销售：来源仓库出库
                stock = await get_or_create_stock(order.source_id, product_id)
                await add_flow(stock, order, -qty, "out")
                
            elif order.order_type == "transfer":
                # 调拨：来源出库，目标入库
                src_stock = await get_or_create_stock(order.source_id, product_id)
                await add_flow(src_stock, order, -qty, "out")
                
                tgt_stock = await get_or_create_stock(order.target_id, product_id)
                await add_flow(tgt_stock, order, qty, "in")
    
    await db.flush()
    print(f"   ✓ 计算完成，共 {len(stock_records)} 条库存记录，{flow_count} 条流水记录")


async def recalculate_accounts(db: AsyncSession, admin_id: int, orders: list):
    """根据业务单重新计算应收应付账款"""
    print("💰 根据业务单计算账款...")
    
    # 清除现有账款
    await db.execute(delete(PaymentRecord))
    await db.execute(delete(AccountBalance))
    
    count = 0
    for order in orders:
        if order.status != "completed":
            continue
        if order.order_type == "transfer":
            continue  # 调拨不产生账款
        
        final_amount = order.final_amount or Decimal("0")
        if final_amount <= Decimal("0"):
            continue
        
        balance_type = None
        entity_id = None
        
        if order.order_type == "sale":
            balance_type = "receivable"
            entity_id = order.target_id
        elif order.order_type == "purchase":
            balance_type = "payable"
            entity_id = order.source_id
        elif order.order_type == "return_in":
            balance_type = "receivable"
            entity_id = order.source_id
            final_amount = -final_amount
        elif order.order_type == "return_out":
            balance_type = "payable"
            entity_id = order.target_id
            final_amount = -final_amount
        
        if balance_type and entity_id:
            account = AccountBalance(
                entity_id=entity_id,
                order_id=order.id,
                balance_type=balance_type,
                amount=final_amount,
                paid_amount=Decimal("0"),
                balance=final_amount,
                status="pending" if final_amount > Decimal("0") else "paid",
                notes=f"由业务单 {order.order_no} 自动生成",
                created_by=admin_id
            )
            db.add(account)
            count += 1
    
    await db.flush()
    print(f"   ✓ 生成 {count} 条账款记录")


async def main():
    """主函数"""
    print("=" * 60)
    print("🚀 财务系统 - 演示数据初始化")
    print("=" * 60 + "\n")
    
    async with SessionLocal() as db:
        try:
            # 1. 清除所有数据
            await clear_all_data(db)
            
            # 2. 创建管理员
            admin = await create_admin_user(db)
            
            # 3. 创建基础数据
            entities = await create_entities(db, admin.id)
            categories = await create_categories(db, admin.id)
            products = await create_products(db, admin.id, categories)
            
            # 4. 创建演示业务单
            orders = await create_demo_orders(db, admin.id, entities, products)
            
            # 5. 根据业务单计算库存和流水
            await recalculate_stocks(db, admin.id, entities, products, orders)
            
            # 6. 根据业务单计算账款
            await recalculate_accounts(db, admin.id, orders)
            
            # 提交所有更改
            await db.commit()
            
            print("\n" + "=" * 60)
            print("✅ 演示数据初始化完成！")
            print("=" * 60)
            print("\n📝 登录信息:")
            print("   用户名: admin")
            print("   密码:   admin123")
            print("\n📦 已创建数据:")
            print("   - 2 个供应商")
            print("   - 3 个客户")
            print("   - 2 个仓库")
            print("   - 7 个商品")
            print("   - 4 张业务单（2采购+1销售+1调拨）")
            print("   - 库存和账款已自动计算")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ 初始化失败: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(main())

