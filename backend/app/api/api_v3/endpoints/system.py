"""系统管理API - 数据刷新、重算、演示数据等"""

from typing import Any, Dict
from decimal import Decimal
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.entity import Entity
from app.models.v3.category import Category
from app.models.v3.product import Product
from app.models.v3.stock import Stock, StockFlow
from app.models.v3.stock_batch import StockBatch
from app.models.v3.account_balance import AccountBalance
from app.models.v3.payment_method import PaymentMethod
from app.models.v3.payment_record import PaymentRecord
from app.models.v3.vehicle import Vehicle
from app.models.v3.deduction_formula import DeductionFormula
from app.models.v3.unit import UnitGroup, Unit, CompositeUnit
from app.models.v3.product_spec import ProductSpec

router = APIRouter()

@router.post("/recalculate-stocks")
async def recalculate_all_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")) -> Any:
    """
    根据已完成的业务单重新计算所有库存
    
    这是一个危险操作，会清除所有库存记录并根据业务单重新计算。
    用于修复库存数据不一致的情况。
    """
    # 单机版无需权限检查
    
    if not confirm:
        # 预览模式：返回将要进行的操作
        result = await db.execute(
            select(BusinessOrder).where(
                BusinessOrder.status == "completed",
                BusinessOrder.order_type.in_(["purchase", "sale", "transfer", "return_in", "return_out"])
            )
        )
        orders = result.scalars().all()
        
        stock_count = (await db.execute(select(Stock))).scalars().all()
        
        return {
            "preview": True,
            "message": "预览模式 - 未实际执行",
            "will_process_orders": len(orders),
            "will_delete_stocks": len(stock_count),
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 实际执行
    # 1. 清除所有库存流水和库存记录
    await db.execute(delete(StockFlow))
    await db.execute(delete(Stock))
    await db.flush()
    
    # 2. 获取所有已完成的业务单（按完成时间排序）
    result = await db.execute(
        select(BusinessOrder).where(
            BusinessOrder.status == "completed",
            BusinessOrder.order_type.in_(["purchase", "sale", "transfer", "return_in", "return_out"])
        ).order_by(BusinessOrder.completed_at)
    )
    orders = result.scalars().all()
    
    # 3. 按仓库-商品跟踪库存记录并生成流水
    stock_records: Dict[tuple, Stock] = {}
    flow_count = 0
    
    async def get_or_create_stock(warehouse_id: int, product_id: int) -> Stock:
        """获取或创建库存记录"""
        key = (warehouse_id, product_id)
        if key not in stock_records:
            stock = Stock(warehouse_id=warehouse_id, product_id=product_id, quantity=0, reserved_quantity=0, safety_stock=10)
            db.add(stock)
            await db.flush()
            stock_records[key] = stock
        return stock_records[key]
    
    async def add_stock_flow(stock: Stock, order: BusinessOrder, qty_change: int, flow_type: str):
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
            reason=order.order_no,
            operator_id=1,
            operated_at=order.completed_at or order.order_date
        )
        db.add(flow)
        flow_count += 1
    
    for order in orders:
        # 获取仓库ID
        source_warehouse_id = None
        target_warehouse_id = None
        
        if order.source_entity and "warehouse" in (order.source_entity.entity_type or ""):
            source_warehouse_id = order.source_id
        if order.target_entity and "warehouse" in (order.target_entity.entity_type or ""):
            target_warehouse_id = order.target_id
        
        # 获取订单项
        items_result = await db.execute(
            select(OrderItem).where(OrderItem.order_id == order.id)
        )
        items = items_result.scalars().all()
        
        for item in items:
            qty = item.quantity or 0
            
            if order.order_type == "purchase" and target_warehouse_id:
                stock = await get_or_create_stock(target_warehouse_id, item.product_id)
                await add_stock_flow(stock, order, qty, "in")
                
            elif order.order_type == "sale" and source_warehouse_id:
                stock = await get_or_create_stock(source_warehouse_id, item.product_id)
                await add_stock_flow(stock, order, -qty, "out")
                
            elif order.order_type == "transfer":
                if source_warehouse_id:
                    stock = await get_or_create_stock(source_warehouse_id, item.product_id)
                    await add_stock_flow(stock, order, -qty, "out")
                if target_warehouse_id:
                    stock = await get_or_create_stock(target_warehouse_id, item.product_id)
                    await add_stock_flow(stock, order, qty, "in")
                    
            elif order.order_type == "return_in" and target_warehouse_id:
                stock = await get_or_create_stock(target_warehouse_id, item.product_id)
                await add_stock_flow(stock, order, qty, "in")
                
            elif order.order_type == "return_out" and source_warehouse_id:
                stock = await get_or_create_stock(source_warehouse_id, item.product_id)
                await add_stock_flow(stock, order, -qty, "out")
    
    await db.commit()
    
    return {
        "success": True,
        "message": "库存重算完成",
        "processed_orders": len(orders),
        "created_stocks": len(stock_records),
        "created_flows": flow_count
    }

@router.post("/recalculate-accounts")
async def recalculate_all_accounts(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")) -> Any:
    """
    根据已完成的业务单重新计算所有应收应付账款
    
    注意：如果已有收付款记录，需要先处理再执行此操作。
    """
    # 单机版无需权限检查
    
    # 检查是否有收付款记录
    payment_count = (await db.execute(
        select(PaymentRecord)
    )).scalars().all()
    
    if len(payment_count) > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"系统中有 {len(payment_count)} 条收付款记录，无法重算账款。请先清理收付款记录。"
        )
    
    if not confirm:
        result = await db.execute(
            select(BusinessOrder).where(
                BusinessOrder.status == "completed",
                BusinessOrder.order_type.in_(["purchase", "sale", "return_in", "return_out"])
            )
        )
        orders = result.scalars().all()
        
        account_count = (await db.execute(select(AccountBalance))).scalars().all()
        
        return {
            "preview": True,
            "message": "预览模式 - 未实际执行",
            "will_process_orders": len(orders),
            "will_delete_accounts": len(account_count),
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 实际执行
    # 1. 清除所有账款记录
    await db.execute(delete(AccountBalance))
    
    # 重置所有实体的当前余额
    await db.execute(text("UPDATE v3_entities SET current_balance = 0"))
    
    # 2. 获取所有已完成的业务单
    result = await db.execute(
        select(BusinessOrder).where(
            BusinessOrder.status == "completed",
            BusinessOrder.order_type.in_(["purchase", "sale", "return_in", "return_out"])
        ).order_by(BusinessOrder.completed_at)
    )
    orders = result.scalars().all()
    
    # 3. 创建账款记录
    created_count = 0
    for order in orders:
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
        
        if not balance_type or not entity_id:
            continue
        
        account = AccountBalance(
            entity_id=entity_id,
            order_id=order.id,
            balance_type=balance_type,
            amount=final_amount,
            paid_amount=Decimal("0"),
            balance=final_amount,
            status="pending" if final_amount > Decimal("0") else "paid",
            notes=f"重算生成 - 来自业务单 {order.order_no}",
            created_by=1
        )
        db.add(account)
        created_count += 1
        
        # 更新实体余额
        entity = await db.get(Entity, entity_id)
        if entity:
            if balance_type == "receivable":
                entity.current_balance = (entity.current_balance or Decimal("0")) + final_amount
            else:
                entity.current_balance = (entity.current_balance or Decimal("0")) - final_amount
    
    await db.commit()
    
    return {
        "success": True,
        "message": "账款重算完成",
        "processed_orders": len(orders),
        "created_accounts": created_count
    }

@router.post("/clear-demo-data")
async def clear_demo_data_api(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")) -> Any:
    """
    清除所有业务数据，保留管理员账户
    用于用户学习完演示数据后开始正式使用
    """
    # 单机版无需权限检查
    
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将清除所有业务数据",
            "will_clear": [
                "审计日志", "收付款记录", "往来账款", 
                "订单项批次分配", "库存批次", "库存流水", "库存", 
                "业务单", "商品规格", "商品", "分类", "车辆", "实体", 
                "扣重公式", "复式单位", "单位", "单位组", "规格模板"
            ],
            "will_keep": ["管理员账户"],
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 按照外键依赖顺序删除
    tables_to_clear = [
        "v3_audit_logs",
        "v3_payment_records",
        "v3_payment_methods",  # 收付款方式
        "v3_account_balances",
        "v3_order_item_batches",  # 订单项批次分配（依赖order_items和stock_batches）
        "v3_stock_batches",       # 库存批次（依赖products和entities）
        "v3_stock_flows",
        "v3_stocks",
        "v3_order_flows",
        "v3_order_items",
        "v3_business_orders",
        "v3_product_specs",       # 商品规格（依赖products）
        "v3_products",
        "v3_categories",
        "v3_vehicles",            # 车辆（依赖entities）
        "v3_units",
        "v3_composite_units",
        "v3_unit_groups",
        "v3_specifications",
        "v3_entities",
        "v3_deduction_formulas",  # 扣重公式
    ]
    
    cleared = []
    for table in tables_to_clear:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
            cleared.append(table)
        except Exception as e:
            pass  # 忽略不存在的表
    
    await db.commit()
    
    return {
        "success": True,
        "message": "演示数据已清除",
        "cleared_tables": cleared,
        "tip": "系统已重置为空白状态，可以开始正式使用"
    }

@router.post("/init-demo-data")
async def init_demo_data_api(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")) -> Any:
    """
    初始化演示数据
    会清除所有业务数据并创建演示用的实体、商品、业务单等
    """
    # 单机版无需权限检查
    
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将初始化演示数据",
            "will_create": {
                "suppliers": 3,
                "customers": 4,
                "warehouses": 3,
                "logistics_companies": 2,
                "vehicles": 4,
                "categories": 4,
                "unit_groups": 3,
                "units": 6,
                "composite_units": 2,
                "deduction_formulas": 3,
                "products": 10,
                "product_specs": 8,  # 商品规格
                "orders": 6
            },
            "warning": "此操作将清除所有现有业务数据！",
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 1. 清除所有业务数据
    tables_to_clear = [
        "v3_audit_logs", "v3_payment_records", "v3_payment_methods",  # 收付款
        "v3_account_balances",
        "v3_order_item_batches", "v3_stock_batches",  # 批次相关
        "v3_stock_flows", "v3_stocks", "v3_order_flows", "v3_order_items",
        "v3_business_orders", "v3_product_specs", "v3_products", "v3_categories",
        "v3_vehicles",  # 车辆
        "v3_units", "v3_composite_units", "v3_unit_groups",
        "v3_specifications", "v3_entities", "v3_deduction_formulas",
    ]
    for table in tables_to_clear:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
        except:
            pass
    
    admin_id = 1
    today = datetime.now()
    
    # 2. 创建扣重公式
    formulas = {}
    formula_data = [
        {"name": "不扣重", "formula_type": "none", "value": Decimal("1.00"), "description": "净重等于毛重，不扣除任何重量", "is_default": True, "sort_order": 1},
        {"name": "扣1%", "formula_type": "percentage", "value": Decimal("0.99"), "description": "扣除1%的冰块/包装重量，净重=毛重×0.99", "sort_order": 2},
        {"name": "每件扣0.5kg", "formula_type": "fixed_per_unit", "value": Decimal("0.50"), "description": "按件扣重，净重=毛重-(件数×0.5kg)", "sort_order": 3},
    ]
    for data in formula_data:
        formula = DeductionFormula(**data, is_active=True, created_by=admin_id)
        db.add(formula)
        await db.flush()
        formulas[data["name"]] = formula
    
    # 3. 创建单位组和单位
    unit_groups = {}
    units = {}
    
    # 重量单位组
    weight_group = UnitGroup(name="重量", base_unit="kg", description="用于称重计量的商品", is_active=True)
    db.add(weight_group)
    await db.flush()
    unit_groups["重量"] = weight_group
    
    kg_unit = Unit(group_id=weight_group.id, name="千克", symbol="kg", conversion_rate=1.0, is_base=True, is_active=True)
    db.add(kg_unit)
    await db.flush()
    units["kg"] = kg_unit
    
    g_unit = Unit(group_id=weight_group.id, name="克", symbol="g", conversion_rate=0.001, is_base=False, is_active=True)
    db.add(g_unit)
    await db.flush()
    units["g"] = g_unit
    
    # 数量单位组
    count_group = UnitGroup(name="数量", base_unit="个", description="用于按个数计量的商品", is_active=True)
    db.add(count_group)
    await db.flush()
    unit_groups["数量"] = count_group
    
    ge_unit = Unit(group_id=count_group.id, name="个", symbol="个", conversion_rate=1.0, is_base=True, is_active=True)
    db.add(ge_unit)
    await db.flush()
    units["个"] = ge_unit
    
    # 容量单位组
    volume_group = UnitGroup(name="容量", base_unit="L", description="用于液体容量计量", is_active=True)
    db.add(volume_group)
    await db.flush()
    unit_groups["容量"] = volume_group
    
    l_unit = Unit(group_id=volume_group.id, name="升", symbol="L", conversion_rate=1.0, is_base=True, is_active=True)
    db.add(l_unit)
    await db.flush()
    units["L"] = l_unit
    
    ml_unit = Unit(group_id=volume_group.id, name="毫升", symbol="mL", conversion_rate=0.001, is_base=False, is_active=True)
    db.add(ml_unit)
    await db.flush()
    units["mL"] = ml_unit
    
    # 4. 创建复式单位（用于鱼类按件计价）
    composite_units = {}
    
    cu1 = CompositeUnit(
        name="件(15kg)", 
        container_name="件", unit_id=kg_unit.id,
        quantity=15.0, description="1件=15kg，适用于冷冻鱼类",
        is_active=True, created_by=admin_id
    )
    db.add(cu1)
    await db.flush()
    composite_units["件(15kg)"] = cu1
    
    cu2 = CompositeUnit(
        name="箱(20kg)", 
        container_name="箱", unit_id=kg_unit.id,
        quantity=20.0, description="1箱=20kg",
        is_active=True, created_by=admin_id
    )
    db.add(cu2)
    await db.flush()
    composite_units["箱(20kg)"] = cu2
    
    # 5. 创建实体（包括物流公司）
    entities = {}
    entity_data = [
        {"code": "SP001", "name": "华东电子供应商", "entity_type": "supplier", "contact_name": "张经理", "phone": "13800001111"},
        {"code": "SP002", "name": "北方五金批发", "entity_type": "supplier", "contact_name": "李总", "phone": "13800002222"},
        {"code": "SP003", "name": "东海冷库水产", "entity_type": "supplier", "contact_name": "陈老板", "phone": "13800003333", "notes": "主要供应冷冻鱼类"},
        {"code": "CU001", "name": "阳光超市", "entity_type": "customer", "contact_name": "王店长", "phone": "13900001111", "credit_limit": Decimal("50000")},
        {"code": "CU002", "name": "便利蜂连锁", "entity_type": "customer", "contact_name": "赵采购", "phone": "13900002222", "credit_limit": Decimal("100000")},
        {"code": "CU003", "name": "社区小卖部", "entity_type": "customer", "contact_name": "刘老板", "phone": "13900003333", "credit_limit": Decimal("10000")},
        {"code": "CU004", "name": "永和食品加工厂", "entity_type": "customer", "contact_name": "林主任", "phone": "13900004444", "credit_limit": Decimal("200000"), "notes": "大客户，月结"},
        {"code": "WH001", "name": "总仓", "entity_type": "warehouse", "address": "本市工业园区A栋"},
        {"code": "WH002", "name": "门店仓", "entity_type": "warehouse", "address": "本市商业街1号"},
        {"code": "WH003", "name": "海鲜冷库", "entity_type": "warehouse", "address": "港口冷链园区3号库", "notes": "专门存放冷冻水产"},
        {"code": "LG001", "name": "顺丰冷链", "entity_type": "logistics", "contact_name": "孙调度", "phone": "13700001111"},
        {"code": "LG002", "name": "京东物流", "entity_type": "logistics", "contact_name": "周师傅", "phone": "13700002222"},
    ]
    for data in entity_data:
        entity = Entity(**data, is_active=True, created_by=admin_id)
        db.add(entity)
        await db.flush()
        entities[data["code"]] = entity
    
    # 6. 创建车辆
    vehicles = {}
    vehicle_data = [
        {"plate_number": "粤B12345", "logistics_company_id": entities["LG001"].id, "vehicle_type": "冷藏车", "notes": "4.2米冷藏车"},
        {"plate_number": "粤B67890", "logistics_company_id": entities["LG001"].id, "vehicle_type": "冷藏车", "notes": "6.8米冷藏车"},
        {"plate_number": "京A11111", "logistics_company_id": entities["LG002"].id, "vehicle_type": "普通货车"},
        {"plate_number": "京A22222", "logistics_company_id": entities["LG002"].id, "vehicle_type": "冷藏车"},
    ]
    for data in vehicle_data:
        vehicle = Vehicle(**data, is_active=True, created_by=admin_id)
        db.add(vehicle)
        await db.flush()
        vehicles[data["plate_number"]] = vehicle
    
    # 6.5 创建收付款方式
    payment_methods = {}
    pm_data = [
        {"name": "现金", "method_type": "cash", "is_default": True, "sort_order": 1},
        {"name": "工商银行尾号1234", "method_type": "bank", "bank_name": "中国工商银行", "account_no": "1234", "account_name": "张三", "sort_order": 2},
        {"name": "微信收款", "method_type": "wechat", "account_name": "鱼老板", "sort_order": 3},
        {"name": "支付宝收款", "method_type": "alipay", "account_name": "鱼老板", "sort_order": 4},
        {"name": "李四代收", "method_type": "proxy", "is_proxy": True, "proxy_entity_id": entities["CU001"].id, "proxy_balance": Decimal("5000"), "notes": "李四帮忙代收的钱", "sort_order": 5},
    ]
    for data in pm_data:
        pm = PaymentMethod(**data, is_active=True, created_by=admin_id)
        db.add(pm)
        await db.flush()
        payment_methods[data["name"]] = pm
    
    # 7. 创建分类
    categories = {}
    cat_data = [
        ("ELEC", "电子产品"), 
        ("FOOD", "食品饮料"), 
        ("DAILY", "日用百货"),
        ("FISH", "冷冻水产"),
    ]
    for code, name in cat_data:
        cat = Category(code=code, name=name, is_active=True, created_by=admin_id)
        db.add(cat)
        await db.flush()
        categories[code] = cat
    
    # 8. 创建商品
    products = {}
    # 普通商品（按个计价）
    prod_data = [
        {"code": "P001", "name": "无线蓝牙耳机", "cat": "ELEC", "cost": Decimal("45"), "price": Decimal("99"), "unit": "个", "unit_id": units["个"].id},
        {"code": "P002", "name": "充电宝10000mAh", "cat": "ELEC", "cost": Decimal("35"), "price": Decimal("79"), "unit": "个", "unit_id": units["个"].id},
        {"code": "P003", "name": "USB数据线", "cat": "ELEC", "cost": Decimal("3"), "price": Decimal("15"), "unit": "条", "unit_id": units["个"].id},
        {"code": "P004", "name": "农夫山泉550ml", "cat": "FOOD", "cost": Decimal("0.8"), "price": Decimal("2"), "unit": "瓶", "unit_id": units["个"].id},
        {"code": "P005", "name": "康师傅方便面", "cat": "FOOD", "cost": Decimal("2.5"), "price": Decimal("5"), "unit": "袋", "unit_id": units["个"].id},
        {"code": "P006", "name": "洗衣液2L", "cat": "DAILY", "cost": Decimal("15"), "price": Decimal("35"), "unit": "瓶", "unit_id": units["个"].id},
        {"code": "P007", "name": "抽纸巾3包装", "cat": "DAILY", "cost": Decimal("8"), "price": Decimal("18"), "unit": "提", "unit_id": units["个"].id},
    ]
    for data in prod_data:
        prod = Product(
            code=data["code"], name=data["name"], category_id=categories[data["cat"]].id,
            cost_price=data["cost"], suggested_price=data["price"], unit=data["unit"],
            unit_id=data.get("unit_id"), is_active=True, created_by=admin_id
        )
        db.add(prod)
        await db.flush()
        products[data["code"]] = prod
    
    # 水产商品（使用商品规格，支持多种包装方式）
    fish_data = [
        {"code": "F001", "name": "冷冻带鱼", "cat": "FISH", "cost": Decimal("180"), "price": Decimal("220"), 
         "unit": "件(15kg)", "spec": "一级品",
         "specs": [
             {"name": "大件", "container_name": "件", "quantity": 15.0, "is_default": True},
             {"name": "散装", "container_name": "kg", "quantity": 1.0, "is_default": False},
         ]},
        {"code": "F002", "name": "冷冻黄花鱼", "cat": "FISH", "cost": Decimal("250"), "price": Decimal("320"), 
         "unit": "件(15kg)", "spec": "大号",
         "specs": [
             {"name": "大件", "container_name": "件", "quantity": 15.0, "is_default": True},
             {"name": "小件", "container_name": "件", "quantity": 10.0, "is_default": False},
             {"name": "散装", "container_name": "kg", "quantity": 1.0, "is_default": False},
         ]},
        {"code": "F003", "name": "冷冻鲅鱼", "cat": "FISH", "cost": Decimal("200"), "price": Decimal("260"), 
         "unit": "箱(20kg)", "spec": "中号",
         "specs": [
             {"name": "大箱", "container_name": "箱", "quantity": 20.0, "is_default": True},
             {"name": "小箱", "container_name": "箱", "quantity": 10.0, "is_default": False},
             {"name": "散装", "container_name": "kg", "quantity": 1.0, "is_default": False},
         ]},
    ]
    for data in fish_data:
        prod = Product(
            code=data["code"], name=data["name"], category_id=categories[data["cat"]].id,
            cost_price=data["cost"], suggested_price=data["price"], unit=data["unit"],
            specification=data.get("spec"), unit_id=kg_unit.id,
            is_active=True, created_by=admin_id
        )
        db.add(prod)
        await db.flush()
        products[data["code"]] = prod
        
        # 为水产商品创建包装规格
        for idx, spec_data in enumerate(data.get("specs", [])):
            spec = ProductSpec(
                product_id=prod.id,
                name=spec_data["name"],
                container_name=spec_data["container_name"],
                quantity=spec_data["quantity"],
                unit_id=kg_unit.id,  # 基础单位都是 kg
                is_default=spec_data.get("is_default", False),
                is_active=True,
                sort_order=idx
            )
            db.add(spec)
    
    # 5. 创建业务单
    orders = []
    
    # 采购单1
    po1 = BusinessOrder(
        order_no=f"PO{today.strftime('%Y%m%d')}001", order_type="purchase", status="completed",
        source_id=entities["SP001"].id, target_id=entities["WH001"].id,
        order_date=today - timedelta(days=2), completed_at=today - timedelta(days=2),
        loading_date=today - timedelta(days=2),
        unloading_date=today - timedelta(days=2),
        notes="演示数据 - 电子产品采购", created_by=admin_id
    )
    db.add(po1)
    await db.flush()
    po1_items = [("P001", 100, Decimal("45")), ("P002", 50, Decimal("35")), ("P003", 200, Decimal("3"))]
    po1_total = Decimal("0")
    for code, qty, price in po1_items:
        prod = products[code]
        amount = qty * price
        po1_total += amount
        item = OrderItem(order_id=po1.id, product_id=prod.id, quantity=qty, unit_price=price, amount=amount, subtotal=amount, cost_price=prod.cost_price, cost_amount=qty * prod.cost_price)
        db.add(item)
    po1.total_quantity = sum(i[1] for i in po1_items)
    po1.total_amount = po1_total
    po1.final_amount = po1_total
    orders.append(po1)
    
    # 采购单2
    po2 = BusinessOrder(
        order_no=f"PO{today.strftime('%Y%m%d')}002", order_type="purchase", status="completed",
        source_id=entities["SP002"].id, target_id=entities["WH001"].id,
        order_date=today - timedelta(days=1), completed_at=today - timedelta(days=1),
        loading_date=today - timedelta(days=1),
        unloading_date=today - timedelta(days=1),
        notes="演示数据 - 日用品采购", created_by=admin_id
    )
    db.add(po2)
    await db.flush()
    po2_items = [("P004", 500, Decimal("0.8")), ("P005", 200, Decimal("2.5")), ("P006", 50, Decimal("15")), ("P007", 100, Decimal("8"))]
    po2_total = Decimal("0")
    for code, qty, price in po2_items:
        prod = products[code]
        amount = qty * price
        po2_total += amount
        item = OrderItem(order_id=po2.id, product_id=prod.id, quantity=qty, unit_price=price, amount=amount, subtotal=amount, cost_price=prod.cost_price, cost_amount=qty * prod.cost_price)
        db.add(item)
    po2.total_quantity = sum(i[1] for i in po2_items)
    po2.total_amount = po2_total
    po2.final_amount = po2_total
    orders.append(po2)
    
    # 销售单
    so1 = BusinessOrder(
        order_no=f"SO{today.strftime('%Y%m%d')}001", order_type="sale", status="completed",
        source_id=entities["WH001"].id, target_id=entities["CU001"].id,
        order_date=today, completed_at=today,
        loading_date=today,
        unloading_date=today,
        notes="演示数据 - 销售给阳光超市", created_by=admin_id
    )
    db.add(so1)
    await db.flush()
    so1_items = [("P001", 20, Decimal("99")), ("P004", 100, Decimal("2")), ("P007", 30, Decimal("18"))]
    so1_total = Decimal("0")
    for code, qty, price in so1_items:
        prod = products[code]
        amount = qty * price
        cost = qty * prod.cost_price
        profit = amount - cost
        so1_total += amount
        item = OrderItem(order_id=so1.id, product_id=prod.id, quantity=qty, unit_price=price, amount=amount, subtotal=amount, cost_price=prod.cost_price, cost_amount=cost, profit=profit)
        db.add(item)
    so1.total_quantity = sum(i[1] for i in so1_items)
    so1.total_amount = so1_total
    so1.final_amount = so1_total
    orders.append(so1)
    
    # 水产采购单（带运费、物流信息、毛重和扣重公式）
    po3 = BusinessOrder(
        order_no=f"PO{today.strftime('%Y%m%d')}003", order_type="purchase", status="completed",
        source_id=entities["SP003"].id, target_id=entities["WH003"].id,
        order_date=today - timedelta(days=3), completed_at=today - timedelta(days=3),
        loading_date=today - timedelta(days=3),
        unloading_date=today - timedelta(days=3),
        total_shipping=Decimal("500"),  # 运费500元
        total_storage_fee=Decimal("30"),  # 开库费30元
        notes="演示数据 - 水产采购（冷链运输，带毛重扣重）", created_by=admin_id
    )
    db.add(po3)
    await db.flush()
    # 水产按件采购：10件带鱼（每件15kg，共150kg），单价180元/件
    # 毛重155kg，扣1%后净重153.45kg（约10件多一点）
    po3_items = [
        {"code": "F001", "qty": 10, "price": Decimal("180"), "gross": Decimal("155"), 
         "spec_name": "大件", "container_name": "件", "unit_quantity": 15.0},
        {"code": "F002", "qty": 5, "price": Decimal("250"), "gross": Decimal("78"),
         "spec_name": "大件", "container_name": "件", "unit_quantity": 15.0},
    ]
    po3_total = Decimal("0")
    for item_data in po3_items:
        prod = products[item_data["code"]]
        qty = item_data["qty"]
        price = item_data["price"]
        gross = item_data["gross"]
        # 使用扣1%公式计算净重
        net_weight = gross * Decimal("0.99")  # 扣1%
        amount = qty * price
        po3_total += amount
        item = OrderItem(
            order_id=po3.id, product_id=prod.id, 
            quantity=qty,  # 按件数记录
            unit_price=price, amount=amount, subtotal=amount, 
            cost_price=prod.cost_price, cost_amount=qty * prod.cost_price,
            # 毛重和扣重
            gross_weight=gross,
            deduction_formula_id=formulas["扣1%"].id,
            storage_rate=Decimal("0.01"),  # 仓储费率 0.01元/斤/天
            # 规格快照
            spec_name=item_data["spec_name"],
            composite_unit_name=f"{item_data['container_name']}({int(item_data['unit_quantity'])}kg)",
            container_name=item_data["container_name"],
            unit_quantity=item_data["unit_quantity"],
            base_unit_symbol="kg",
            pricing_mode="container",  # 按件计价
            container_count=Decimal(str(qty)),
            # 物流信息
            logistics_company_id=entities["LG001"].id, vehicle_id=vehicles["粤B12345"].id,
            plate_number="粤B12345", driver_phone="13712345678"
        )
        db.add(item)
    po3.total_quantity = sum(i["qty"] for i in po3_items)
    po3.total_amount = po3_total
    po3.final_amount = po3_total + po3.total_shipping
    orders.append(po3)
    
    # 水产销售单（给加工厂，大批量，带规格快照）
    so2 = BusinessOrder(
        order_no=f"SO{today.strftime('%Y%m%d')}002", order_type="sale", status="completed",
        source_id=entities["WH003"].id, target_id=entities["CU004"].id,
        order_date=today, completed_at=today,
        loading_date=today,
        unloading_date=today,
        total_shipping=Decimal("300"),  # 送货运费
        total_storage_fee=Decimal("150"),  # 存储费150元（3天存储）
        notes="演示数据 - 销售给永和食品加工厂（按件计价）", created_by=admin_id
    )
    db.add(so2)
    await db.flush()
    so2_items = [
        {"code": "F001", "qty": 5, "price": Decimal("220"), 
         "spec_name": "大件", "container_name": "件", "unit_quantity": 15.0},
        {"code": "F002", "qty": 3, "price": Decimal("320"),
         "spec_name": "大件", "container_name": "件", "unit_quantity": 15.0},
    ]
    so2_total = Decimal("0")
    for item_data in so2_items:
        prod = products[item_data["code"]]
        qty = item_data["qty"]
        price = item_data["price"]
        amount = qty * price
        cost = qty * prod.cost_price
        profit = amount - cost
        so2_total += amount
        item = OrderItem(
            order_id=so2.id, product_id=prod.id, quantity=qty, unit_price=price, 
            amount=amount, subtotal=amount, cost_price=prod.cost_price, cost_amount=cost, profit=profit,
            # 规格快照
            spec_name=item_data["spec_name"],
            composite_unit_name=f"{item_data['container_name']}({int(item_data['unit_quantity'])}kg)",
            container_name=item_data["container_name"],
            unit_quantity=item_data["unit_quantity"],
            base_unit_symbol="kg",
            pricing_mode="container",  # 按件计价
            container_count=Decimal(str(qty)),
            # 物流信息
            logistics_company_id=entities["LG002"].id, vehicle_id=vehicles["京A22222"].id,
            plate_number="京A22222", driver_phone="13987654321"
        )
        db.add(item)
    so2.total_quantity = sum(i["qty"] for i in so2_items)
    so2.total_amount = so2_total
    so2.final_amount = so2_total + so2.total_shipping
    orders.append(so2)
    
    await db.flush()
    
    # 6. 计算库存并生成流水记录
    # 按仓库-商品跟踪库存记录
    stock_records: Dict[tuple, Stock] = {}
    flow_count = 0
    
    async def get_or_create_stock(warehouse_id: int, product_id: int) -> Stock:
        """获取或创建库存记录"""
        key = (warehouse_id, product_id)
        if key not in stock_records:
            stock = Stock(warehouse_id=warehouse_id, product_id=product_id, quantity=0, safety_stock=10)
            db.add(stock)
            await db.flush()
            stock_records[key] = stock
        return stock_records[key]
    
    async def add_stock_flow(stock: Stock, order: BusinessOrder, qty_change: int, flow_type: str):
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
            reason=order.order_no,
            operator_id=admin_id,
            operated_at=order.completed_at or order.order_date
        )
        db.add(flow)
        flow_count += 1
    
    # 按时间顺序处理订单，生成库存和流水
    sorted_orders = sorted(orders, key=lambda o: o.completed_at or o.order_date)
    
    # 获取所有仓库ID
    warehouse_ids = {
        entities["WH001"].id: "WH001",
        entities["WH002"].id: "WH002",
        entities["WH003"].id: "WH003",
    }
    
    batch_count = 0
    
    async def generate_batch_no(prefix: str) -> str:
        """生成批次号"""
        nonlocal batch_count
        batch_count += 1
        return f"{prefix}{batch_count:04d}"
    
    for order in sorted_orders:
        if order.status != "completed":
            continue
        
        source_wh = order.source_id if order.source_id in warehouse_ids else None
        target_wh = order.target_id if order.target_id in warehouse_ids else None
        
        items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        items = items_result.scalars().all()
        
        for item in items:
            if order.order_type == "purchase" and target_wh:
                # 创建批次
                product = await db.get(Product, item.product_id)
                batch_no = await generate_batch_no(f"B{today.strftime('%Y%m%d')}")
                
                # 计算净重（如果有毛重和扣重公式）
                net_weight = Decimal(str(item.quantity))
                gross_weight = item.gross_weight
                tare_weight = Decimal("0")
                if gross_weight and item.deduction_formula_id:
                    formula = formulas.get("扣1%")  # 使用扣1%公式
                    if formula:
                        net_weight = gross_weight * Decimal("0.99")
                        tare_weight = gross_weight - net_weight
                elif gross_weight:
                    net_weight = gross_weight
                
                batch = StockBatch(
                    batch_no=batch_no,
                    product_id=item.product_id,
                    storage_entity_id=target_wh,
                    source_entity_id=order.source_id,
                    source_order_id=order.id,
                    gross_weight=gross_weight,
                    tare_weight=tare_weight,
                    deduction_formula_id=item.deduction_formula_id,
                    initial_quantity=net_weight,
                    current_quantity=net_weight,
                    reserved_quantity=Decimal("0"),
                    cost_price=item.unit_price,
                    cost_amount=item.amount,
                    freight_cost=item.shipping_cost or Decimal("0"),
                    storage_rate=item.storage_rate,
                    received_at=order.completed_at or order.order_date,
                    status="active",
                    is_initial=False,
                    notes=f"由采购单 {order.order_no} 自动生成",
                    created_by=admin_id
                )
                db.add(batch)
                await db.flush()
                
                # 关联批次到订单项
                item.batch_id = batch.id
                
                # 创建库存和流水
                stock = await get_or_create_stock(target_wh, item.product_id)
                await add_stock_flow(stock, order, item.quantity, "in")
            elif order.order_type == "sale" and source_wh:
                stock = await get_or_create_stock(source_wh, item.product_id)
                await add_stock_flow(stock, order, -item.quantity, "out")
            elif order.order_type == "transfer":
                if source_wh:
                    stock = await get_or_create_stock(source_wh, item.product_id)
                    await add_stock_flow(stock, order, -item.quantity, "out")
                if target_wh:
                    stock = await get_or_create_stock(target_wh, item.product_id)
                    await add_stock_flow(stock, order, item.quantity, "in")
    
    # 7. 生成账款（货款和运费分开）
    for order in orders:
        if order.order_type == "transfer":
            continue
        
        # 1. 生成货款账单
        goods_amount = order.total_amount or Decimal("0")
        if goods_amount > Decimal("0"):
            if order.order_type == "sale":
                balance_type, entity_id = "receivable", order.target_id
                notes_prefix = "销售货款"
            elif order.order_type == "purchase":
                balance_type, entity_id = "payable", order.source_id
                notes_prefix = "采购货款"
            else:
                continue
            
            goods_account = AccountBalance(
                entity_id=entity_id, order_id=order.id, balance_type=balance_type,
                amount=goods_amount, paid_amount=Decimal("0"), balance=goods_amount,
                status="pending", notes=f"{notes_prefix} - 由业务单 {order.order_no} 自动生成", 
                created_by=admin_id
            )
            db.add(goods_account)
            
            entity = await db.get(Entity, entity_id)
            if entity:
                if balance_type == "receivable":
                    entity.current_balance = (entity.current_balance or Decimal("0")) + goods_amount
                else:
                    entity.current_balance = (entity.current_balance or Decimal("0")) - goods_amount
        
        # 2. 生成运费账单（运费总是我方支付给物流公司）
        shipping_amount = order.total_shipping or Decimal("0")
        if shipping_amount > Decimal("0"):
            # 查找订单项中的物流公司
            items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
            order_items = items_result.scalars().all()
            logistics_company_id = None
            plate_number = None
            for item in order_items:
                if item.logistics_company_id:
                    logistics_company_id = item.logistics_company_id
                    plate_number = item.plate_number
                    break
            
            # 不管是采购还是销售，运费都是我方支付给物流公司（应付）
            # 如果运费由对方自负，那就不在账单里录入运费
            if logistics_company_id:
                order_type_label = "采购" if order.order_type == "purchase" else "销售"
                shipping_account = AccountBalance(
                    entity_id=logistics_company_id, order_id=order.id, balance_type="payable",
                    amount=shipping_amount, paid_amount=Decimal("0"), balance=shipping_amount,
                    status="pending", 
                    notes=f"{order_type_label}运费（车牌：{plate_number or 'N/A'}） - 由业务单 {order.order_no} 自动生成", 
                    created_by=admin_id
                )
                db.add(shipping_account)
                
                logistics_entity = await db.get(Entity, logistics_company_id)
                if logistics_entity:
                    logistics_entity.current_balance = (logistics_entity.current_balance or Decimal("0")) - shipping_amount
        
        # 3. 生成冷藏费账单（冷藏费应付给冷库/仓库）
        storage_fee = order.total_storage_fee or Decimal("0")
        if storage_fee > Decimal("0"):
            # 采购时冷库是目标方（入库），销售时冷库是来源方（出库）
            if order.order_type == "purchase":
                warehouse_entity_id = order.target_id
                notes_text = "入库冷藏费"
            else:
                warehouse_entity_id = order.source_id
                notes_text = "出库冷藏费"
            
            storage_account = AccountBalance(
                entity_id=warehouse_entity_id, order_id=order.id, balance_type="payable",
                amount=storage_fee, paid_amount=Decimal("0"), balance=storage_fee,
                status="pending", 
                notes=f"{notes_text} - 由业务单 {order.order_no} 自动生成", 
                created_by=admin_id
            )
            db.add(storage_account)
            
            warehouse_entity = await db.get(Entity, warehouse_entity_id)
            if warehouse_entity:
                warehouse_entity.current_balance = (warehouse_entity.current_balance or Decimal("0")) - storage_fee
    
    await db.commit()
    
    return {
        "success": True,
        "message": "演示数据初始化完成",
        "created": {
            "deduction_formulas": len(formula_data),
            "unit_groups": len(unit_groups),
            "units": len(units),
            "composite_units": len(composite_units),
            "entities": len(entity_data),
            "vehicles": len(vehicle_data),
            "payment_methods": len(pm_data),
            "categories": len(cat_data),
            "products": len(prod_data) + len(fish_data),
            "orders": len(orders),
            "stocks": len(stock_records),
            "stock_flows": flow_count
        },
        "highlights": [
            "✅ 物流公司 2 家，车辆 4 辆",
            "✅ 水产商品 3 种（使用复式单位）",
            "✅ 扣重公式 3 个",
            "✅ 带运费的采购/销售单",
        ],
        "tip": "演示数据已准备就绪，可以开始体验系统功能"
    }

