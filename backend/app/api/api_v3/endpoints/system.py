"""系统管理API - 数据刷新、重算、演示数据等"""

from typing import Any, Dict
from decimal import Decimal
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
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
from app.models.v3.specification import Specification

router = APIRouter()


@router.post("/clear-demo-data")
async def clear_demo_data(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")
) -> Any:
    """
    清除所有业务数据，保留管理员账户
    """
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将清除所有业务数据",
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 按外键依赖顺序删除（从子表到父表）
    tables = [
        "v3_audit_logs",
        "v3_payment_records",
        "v3_account_balances",
        "v3_order_item_batches",
        "v3_stock_batches",
        "v3_stock_flows",
        "v3_stocks",
        "v3_order_flows",
        "v3_order_items",
        "v3_business_orders",
        "v3_product_specs",
        "v3_products",
        "v3_categories",
        "v3_vehicles",
        "v3_entities",
        "v3_payment_methods",
        "v3_deduction_formulas",
        "v3_composite_units",
        "v3_units",
        "v3_unit_groups",
        "v3_specifications",
    ]
    
    cleared = []
    for table in tables:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
            cleared.append(table)
        except Exception:
            pass
    
    await db.commit()
    
    return {
        "success": True,
        "message": "数据已清除",
        "cleared_tables": len(cleared)
    }


@router.post("/init-demo-data")
async def init_demo_data(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")
) -> Any:
    """
    初始化演示数据
    """
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将初始化演示数据",
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    try:
        # ========== 1. 先清除所有数据 ==========
        tables = [
            "v3_audit_logs", "v3_payment_records", "v3_account_balances",
            "v3_order_item_batches", "v3_stock_batches", "v3_stock_flows", "v3_stocks",
            "v3_order_flows", "v3_order_items", "v3_business_orders",
            "v3_product_specs", "v3_products", "v3_categories",
            "v3_vehicles", "v3_entities", "v3_payment_methods",
            "v3_deduction_formulas", "v3_composite_units", "v3_units",
            "v3_unit_groups", "v3_specifications",
        ]
        for table in tables:
            try:
                await db.execute(text(f"DELETE FROM {table}"))
            except Exception:
                pass
        await db.flush()
        
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        admin_id = 1
        
        # ========== 2. 创建扣重公式 ==========
        formulas = [
            DeductionFormula(name="标准1%扣重", formula_type="percentage", value=Decimal("1"), is_active=True, created_by=admin_id),
            DeductionFormula(name="标准2%扣重", formula_type="percentage", value=Decimal("2"), is_active=True, created_by=admin_id),
            DeductionFormula(name="固定5kg扣重", formula_type="fixed", value=Decimal("5"), is_active=True, created_by=admin_id),
        ]
        for f in formulas:
            db.add(f)
        await db.flush()
        
        # ========== 3. 创建单位组和单位 ==========
        # 重量单位组
        weight_group = UnitGroup(name="重量", base_unit="kg", description="重量单位", is_active=True)
        db.add(weight_group)
        await db.flush()
        
        kg = Unit(group_id=weight_group.id, name="千克", symbol="kg", conversion_rate=1.0, is_base=True, is_active=True)
        g = Unit(group_id=weight_group.id, name="克", symbol="g", conversion_rate=0.001, is_base=False, is_active=True)
        db.add(kg)
        db.add(g)
        await db.flush()
        
        # 数量单位组
        count_group = UnitGroup(name="数量", base_unit="件", description="计数单位", is_active=True)
        db.add(count_group)
        await db.flush()
        
        pcs = Unit(group_id=count_group.id, name="件", symbol="件", conversion_rate=1.0, is_base=True, is_active=True)
        box = Unit(group_id=count_group.id, name="箱", symbol="箱", conversion_rate=1.0, is_base=False, is_active=True)
        db.add(pcs)
        db.add(box)
        await db.flush()
        
        # ========== 4. 创建商品分类 ==========
        cat_seafood = Category(name="水产海鲜", code="SF", level=1, sort_order=1, is_active=True, created_by=admin_id)
        cat_meat = Category(name="肉类", code="MT", level=1, sort_order=2, is_active=True, created_by=admin_id)
        db.add(cat_seafood)
        db.add(cat_meat)
        await db.flush()
        
        # ========== 5. 创建实体 ==========
        # 供应商
        sp1 = Entity(name="东海水产", code="SP001", entity_type="supplier", contact_name="张经理", phone="13800001111", is_active=True, created_by=admin_id)
        sp2 = Entity(name="北方冷库", code="SP002", entity_type="supplier", contact_name="李经理", phone="13800002222", is_active=True, created_by=admin_id)
        db.add(sp1)
        db.add(sp2)
        
        # 客户
        cu1 = Entity(name="阳光超市", code="CU001", entity_type="customer", contact_name="王店长", phone="13800003333", is_active=True, created_by=admin_id)
        cu2 = Entity(name="永和餐饮", code="CU002", entity_type="customer", contact_name="陈经理", phone="13800004444", is_active=True, created_by=admin_id)
        db.add(cu1)
        db.add(cu2)
        
        # 仓库
        wh1 = Entity(name="中心冷库", code="WH001", entity_type="warehouse", address="工业园区1号", is_active=True, created_by=admin_id)
        db.add(wh1)
        
        # 物流公司
        lg1 = Entity(name="顺达冷链", code="LG001", entity_type="logistics", contact_name="赵师傅", phone="13800005555", is_active=True, created_by=admin_id)
        db.add(lg1)
        
        await db.flush()
        
        # ========== 6. 创建商品 ==========
        p1 = Product(
            name="冷冻带鱼", code="F001", category_id=cat_seafood.id, category="水产海鲜",
            unit="kg", cost_price=Decimal("25"), suggested_price=Decimal("35"),
            is_active=True, created_by=admin_id
        )
        p2 = Product(
            name="冷冻黄花鱼", code="F002", category_id=cat_seafood.id, category="水产海鲜",
            unit="kg", cost_price=Decimal("30"), suggested_price=Decimal("45"),
            is_active=True, created_by=admin_id
        )
        p3 = Product(
            name="冷冻猪肉", code="M001", category_id=cat_meat.id, category="肉类",
            unit="kg", cost_price=Decimal("20"), suggested_price=Decimal("28"),
            is_active=True, created_by=admin_id
        )
        db.add(p1)
        db.add(p2)
        db.add(p3)
        await db.flush()
        
        # ========== 7. 创建采购单 ==========
        po1 = BusinessOrder(
            order_no=f"PO{today.strftime('%Y%m%d')}001",
            order_type="purchase",
            status="completed",
            source_id=sp1.id,
            target_id=wh1.id,
            order_date=today - timedelta(days=3),
            loading_date=today - timedelta(days=3),
            unloading_date=today - timedelta(days=3),
            completed_at=today - timedelta(days=3),
            total_quantity=100,
            total_amount=Decimal("2500"),
            total_shipping=Decimal("100"),
            total_storage_fee=Decimal("1.5"),  # 0.1吨 × 15元/吨 = 1.5元
            final_amount=Decimal("2601.5"),
            calculate_storage_fee=True,
            notes="演示采购单",
            created_by=admin_id
        )
        db.add(po1)
        await db.flush()
        
        # 采购单明细（关联物流公司用于运费账单）
        poi1 = OrderItem(
            order_id=po1.id, product_id=p1.id,
            quantity=100, unit_price=Decimal("25"),
            amount=Decimal("2500"), subtotal=Decimal("2500"),
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("100")
        )
        db.add(poi1)
        
        # 采购流程
        pof1 = OrderFlow(
            order_id=po1.id, flow_type="created", flow_status="completed",
            description="创建采购单", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        pof2 = OrderFlow(
            order_id=po1.id, flow_type="completed", flow_status="completed",
            description="采购完成", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(pof1)
        db.add(pof2)
        await db.flush()
        
        # ========== 8. 创建库存和批次 ==========
        stock1 = Stock(
            warehouse_id=wh1.id, product_id=p1.id,
            quantity=Decimal("100"), reserved_quantity=Decimal("0")
        )
        db.add(stock1)
        await db.flush()
        
        batch1 = StockBatch(
            batch_no=f"PH{today.strftime('%Y%m%d')}-001",
            product_id=p1.id,
            storage_entity_id=wh1.id,
            source_entity_id=sp1.id,
            source_order_id=po1.id,
            initial_quantity=Decimal("100"),
            current_quantity=Decimal("100"),
            cost_price=Decimal("25"),
            cost_amount=Decimal("2500"),
            received_at=today - timedelta(days=3),
            status="active",
            created_by=admin_id
        )
        db.add(batch1)
        
        flow1 = StockFlow(
            stock_id=stock1.id, order_id=po1.id,
            flow_type="in", quantity_change=Decimal("100"),
            quantity_before=Decimal("0"), quantity_after=Decimal("100"),
            reason="采购入库", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(flow1)
        await db.flush()
        
        # ========== 9. 创建销售单 ==========
        # 冷藏费计算：0.03吨 × 15元/吨（出库费）+ 0.03吨 × 2天 × 1.5元/吨/天 = 0.45 + 0.09 = 0.54元
        so1 = BusinessOrder(
            order_no=f"SO{today.strftime('%Y%m%d')}001",
            order_type="sale",
            status="completed",
            source_id=wh1.id,
            target_id=cu1.id,
            order_date=today - timedelta(days=1),
            loading_date=today - timedelta(days=1),
            unloading_date=today - timedelta(days=1),
            completed_at=today - timedelta(days=1),
            total_quantity=30,
            total_amount=Decimal("1050"),
            total_shipping=Decimal("50"),
            total_storage_fee=Decimal("0.54"),
            final_amount=Decimal("1100.54"),
            calculate_storage_fee=True,
            notes="演示销售单",
            created_by=admin_id
        )
        db.add(so1)
        await db.flush()
        
        soi1 = OrderItem(
            order_id=so1.id, product_id=p1.id,
            quantity=30, unit_price=Decimal("35"),
            amount=Decimal("1050"), subtotal=Decimal("1050"),
            cost_price=Decimal("25"),  # 成本单价（采购价）
            cost_amount=Decimal("750"),  # 成本金额 = 30 × 25
            profit=Decimal("249.46"),  # 利润 = 1050 - 750 - 50(运费) - 0.54(冷藏费)
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("50"),
            total_storage_fee=Decimal("0.54")
        )
        db.add(soi1)
        await db.flush()
        
        # 创建批次出库记录（用于批次追溯）
        from app.models.v3.order_item_batch import OrderItemBatch
        oib1 = OrderItemBatch(
            order_item_id=soi1.id,
            batch_id=batch1.id,
            quantity=Decimal("30"),
            cost_price=Decimal("25"),
            cost_amount=Decimal("750")
        )
        db.add(oib1)
        
        sof1 = OrderFlow(
            order_id=so1.id, flow_type="created", flow_status="completed",
            description="创建销售单", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        sof2 = OrderFlow(
            order_id=so1.id, flow_type="completed", flow_status="completed",
            description="销售完成", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        db.add(sof1)
        db.add(sof2)
        
        # 更新库存
        stock1.quantity = Decimal("70")
        batch1.current_quantity = Decimal("70")
        
        flow2 = StockFlow(
            stock_id=stock1.id, order_id=so1.id,
            flow_type="out", quantity_change=Decimal("-30"),
            quantity_before=Decimal("100"), quantity_after=Decimal("70"),
            reason="销售出库", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        db.add(flow2)
        await db.flush()
        
        # ========== 10. 创建往来账款（货款、运费、冷藏费分开生成）==========
        # --- 采购单账款 ---
        # 1. 货款应付给供应商
        po1_goods = po1.total_amount  # 2500
        db.add(AccountBalance(
            entity_id=sp1.id, order_id=po1.id,
            balance_type="payable", amount=po1_goods,
            paid_amount=Decimal("0"), balance=po1_goods,
            status="pending", notes="采购货款", created_by=admin_id
        ))
        
        # 2. 运费应付给物流公司
        po1_shipping = po1.total_shipping  # 100
        db.add(AccountBalance(
            entity_id=lg1.id, order_id=po1.id,
            balance_type="payable", amount=po1_shipping,
            paid_amount=Decimal("0"), balance=po1_shipping,
            status="pending", notes="采购运费", created_by=admin_id
        ))
        
        # 3. 冷藏费应付给仓库
        po1_storage = po1.total_storage_fee  # 15
        db.add(AccountBalance(
            entity_id=wh1.id, order_id=po1.id,
            balance_type="payable", amount=po1_storage,
            paid_amount=Decimal("0"), balance=po1_storage,
            status="pending", notes="入库冷藏费", created_by=admin_id
        ))
        
        # --- 销售单账款 ---
        # 1. 货款应收自客户
        so1_goods = so1.total_amount  # 1050
        db.add(AccountBalance(
            entity_id=cu1.id, order_id=so1.id,
            balance_type="receivable", amount=so1_goods,
            paid_amount=Decimal("0"), balance=so1_goods,
            status="pending", notes="销售货款", created_by=admin_id
        ))
        
        # 2. 运费应付给物流公司
        so1_shipping = so1.total_shipping  # 50
        db.add(AccountBalance(
            entity_id=lg1.id, order_id=so1.id,
            balance_type="payable", amount=so1_shipping,
            paid_amount=Decimal("0"), balance=so1_shipping,
            status="pending", notes="销售运费", created_by=admin_id
        ))
        
        # 3. 冷藏费应付给仓库
        so1_storage = so1.total_storage_fee  # 15.09
        db.add(AccountBalance(
            entity_id=wh1.id, order_id=so1.id,
            balance_type="payable", amount=so1_storage,
            paid_amount=Decimal("0"), balance=so1_storage,
            status="pending", notes="出库冷藏费", created_by=admin_id
        ))
        
        # 更新实体余额
        sp1.current_balance = -po1_goods  # 供应商：应付货款
        cu1.current_balance = so1_goods   # 客户：应收货款
        lg1.current_balance = -(po1_shipping + so1_shipping)  # 物流：应付运费
        wh1.current_balance = -(po1_storage + so1_storage)    # 仓库：应付冷藏费
        
        await db.commit()
        
        return {
            "success": True,
            "message": "演示数据初始化完成",
            "created": {
                "suppliers": 2,
                "customers": 2,
                "warehouses": 1,
                "logistics": 1,
                "products": 3,
                "orders": 2,
                "accounts": 6  # 货款2 + 运费2 + 冷藏费2
            }
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"初始化失败: {str(e)}")


@router.post("/recalculate-stocks")
async def recalculate_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")
) -> Any:
    """根据业务单重新计算库存"""
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式",
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    # 清除库存数据
    await db.execute(delete(StockFlow))
    await db.execute(delete(Stock))
    await db.flush()
    
    # 获取已完成订单
    result = await db.execute(
        select(BusinessOrder).where(
            BusinessOrder.status == "completed",
            BusinessOrder.order_type.in_(["purchase", "sale", "transfer", "return_in", "return_out"])
        ).order_by(BusinessOrder.order_date)
    )
    orders = result.scalars().all()
    
    stock_map: Dict[tuple, Stock] = {}
    
    async def get_stock(wh_id: int, prod_id: int) -> Stock:
        key = (wh_id, prod_id)
        if key not in stock_map:
            s = Stock(warehouse_id=wh_id, product_id=prod_id, quantity=Decimal("0"), reserved_quantity=Decimal("0"))
            db.add(s)
            await db.flush()
            stock_map[key] = s
        return stock_map[key]
    
    for order in orders:
        src_wh = order.source_id if order.source_entity and "warehouse" in (order.source_entity.entity_type or "") else None
        tgt_wh = order.target_id if order.target_entity and "warehouse" in (order.target_entity.entity_type or "") else None
        
        items = (await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
        
        for item in items:
            qty = Decimal(str(item.quantity or 0))
            
            if order.order_type == "purchase" and tgt_wh:
                s = await get_stock(tgt_wh, item.product_id)
                old = s.quantity
                s.quantity += qty
                db.add(StockFlow(stock_id=s.id, order_id=order.id, flow_type="in", quantity_change=qty, quantity_before=old, quantity_after=s.quantity, reason=order.order_no, operator_id=1, operated_at=order.order_date))
            
            elif order.order_type == "sale" and src_wh:
                s = await get_stock(src_wh, item.product_id)
                old = s.quantity
                s.quantity -= qty
                db.add(StockFlow(stock_id=s.id, order_id=order.id, flow_type="out", quantity_change=-qty, quantity_before=old, quantity_after=s.quantity, reason=order.order_no, operator_id=1, operated_at=order.order_date))
            
            elif order.order_type == "transfer":
                if src_wh:
                    s = await get_stock(src_wh, item.product_id)
                    old = s.quantity
                    s.quantity -= qty
                    db.add(StockFlow(stock_id=s.id, order_id=order.id, flow_type="out", quantity_change=-qty, quantity_before=old, quantity_after=s.quantity, reason=order.order_no, operator_id=1, operated_at=order.order_date))
                if tgt_wh:
                    s = await get_stock(tgt_wh, item.product_id)
                    old = s.quantity
                    s.quantity += qty
                    db.add(StockFlow(stock_id=s.id, order_id=order.id, flow_type="in", quantity_change=qty, quantity_before=old, quantity_after=s.quantity, reason=order.order_no, operator_id=1, operated_at=order.order_date))
    
    await db.commit()
    return {"success": True, "message": "库存重算完成", "orders": len(orders), "stocks": len(stock_map)}


@router.post("/recalculate-accounts")
async def recalculate_accounts(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")
) -> Any:
    """
    根据业务单重新计算账款
    
    按照正常业务逻辑，货款、运费、冷藏费分开生成账单：
    - 货款 → 供应商/客户
    - 运费 → 物流公司
    - 冷藏费 → 仓库
    """
    # 检查收付款
    payments = (await db.execute(select(PaymentRecord))).scalars().all()
    if payments:
        raise HTTPException(status_code=400, detail=f"有 {len(payments)} 条收付款记录，请先清理")
    
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将重新生成所有往来账款",
            "tip": "添加 ?confirm=true 参数确认执行",
            "warning": "此操作会删除所有账款记录并重新生成"
        }
    
    # 清空账款和实体余额
    await db.execute(delete(AccountBalance))
    await db.execute(text("UPDATE v3_entities SET current_balance = 0"))
    await db.flush()
    
    # 获取所有已完成订单（按业务日期排序）
    result = await db.execute(
        select(BusinessOrder)
        .options(selectinload(BusinessOrder.items))
        .where(
            BusinessOrder.status == "completed",
            BusinessOrder.order_type.in_(["purchase", "sale", "return_in", "return_out"])
        ).order_by(BusinessOrder.order_date)
    )
    orders = result.scalars().all()
    
    account_count = 0
    entity_balances: Dict[int, Decimal] = {}  # 实体ID -> 余额变化
    
    async def add_account(entity_id: int, order_id: int, balance_type: str, amount: Decimal, notes: str):
        nonlocal account_count
        if amount <= Decimal("0"):
            return
        db.add(AccountBalance(
            entity_id=entity_id, order_id=order_id,
            balance_type=balance_type, amount=amount,
            paid_amount=Decimal("0"), balance=amount,
            status="pending", notes=notes, created_by=1
        ))
        # 累计实体余额变化
        delta = amount if balance_type == "receivable" else -amount
        entity_balances[entity_id] = entity_balances.get(entity_id, Decimal("0")) + delta
        account_count += 1
    
    for order in orders:
        goods_amount = order.total_amount or Decimal("0")
        shipping_amount = order.total_shipping or Decimal("0")
        storage_fee = order.total_storage_fee or Decimal("0")
        
        # 获取物流公司ID（从订单明细）
        logistics_company_id = None
        for item in order.items:
            if item.logistics_company_id:
                logistics_company_id = item.logistics_company_id
                break
        
        if order.order_type == "sale":
            # 销售：货款应收自客户
            await add_account(order.target_id, order.id, "receivable", goods_amount, f"销售货款")
            # 运费应付给物流公司
            if logistics_company_id:
                await add_account(logistics_company_id, order.id, "payable", shipping_amount, f"销售运费")
            # 冷藏费应付给仓库（来源方）
            await add_account(order.source_id, order.id, "payable", storage_fee, f"出库冷藏费")
            
        elif order.order_type == "purchase":
            # 采购：货款应付给供应商
            await add_account(order.source_id, order.id, "payable", goods_amount, f"采购货款")
            # 运费应付给物流公司
            if logistics_company_id:
                await add_account(logistics_company_id, order.id, "payable", shipping_amount, f"采购运费")
            # 冷藏费应付给仓库（目标方）
            await add_account(order.target_id, order.id, "payable", storage_fee, f"入库冷藏费")
            
        elif order.order_type == "return_in":
            # 客户退货：应付给客户
            final = order.final_amount or Decimal("0")
            await add_account(order.source_id, order.id, "payable", final, f"客户退货应退")
            
        elif order.order_type == "return_out":
            # 退供应商：应收自供应商
            final = order.final_amount or Decimal("0")
            await add_account(order.target_id, order.id, "receivable", final, f"退供应商应收")
    
    # 更新所有实体的当前余额
    for entity_id, balance in entity_balances.items():
        entity = await db.get(Entity, entity_id)
        if entity:
            entity.current_balance = balance
    
    await db.commit()
    return {
        "success": True, 
        "message": "账款重算完成", 
        "orders_processed": len(orders), 
        "accounts_created": account_count,
        "entities_updated": len(entity_balances)
    }
