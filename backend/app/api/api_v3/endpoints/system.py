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
from app.models.v3.stock_batch import OrderItemBatch
from app.db.migrations import run_migrations, CURRENT_DB_VERSION

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
        
        # ========== 2. 创建扣重公式（硬编码三种） ==========
        # 注意：percentage 类型的 value 是乘数，0.99 表示扣1%（净重=毛重×0.99）
        formulas = [
            DeductionFormula(
                name="不扣重", formula_type="none", value=Decimal("1"), 
                description="净重等于毛重，不扣除任何重量",
                is_default=True, is_active=True, sort_order=1, created_by=admin_id
            ),
            DeductionFormula(
                name="扣1%", formula_type="percentage", value=Decimal("0.99"),  # 净重 = 毛重 × 0.99
                description="扣除1%的冰块/包装重量",
                is_default=False, is_active=True, sort_order=2, created_by=admin_id
            ),
            DeductionFormula(
                name="每件扣0.5kg", formula_type="fixed_per_unit", value=Decimal("0.5"),
                description="按件扣重，适用于有冰块包装的散件",
                is_default=False, is_active=True, sort_order=3, created_by=admin_id
            ),
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
        
        # ========== 3.5 创建默认收付款方式 ==========
        pm_cash = PaymentMethod(name="现金", method_type="cash", is_default=True, sort_order=1, created_by=admin_id)
        pm_bank = PaymentMethod(name="银行转账", method_type="bank", sort_order=2, created_by=admin_id)
        pm_wechat = PaymentMethod(name="微信收款", method_type="wechat", sort_order=3, created_by=admin_id)
        pm_alipay = PaymentMethod(name="支付宝收款", method_type="alipay", sort_order=4, created_by=admin_id)
        db.add(pm_cash)
        db.add(pm_bank)
        db.add(pm_wechat)
        db.add(pm_alipay)
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
        
        # ========== 6.5. 获取在途仓 ==========
        transit_result = await db.execute(
            select(Entity).where(Entity.code == "SYS_TRANSIT")
        )
        transit = transit_result.scalar_one_or_none()
        if not transit:
            # 如果不存在，创建在途仓
            transit = Entity(
                name="在途仓", code="SYS_TRANSIT", entity_type="transit",
                is_system=True, is_active=True, created_by=admin_id
            )
            db.add(transit)
            await db.flush()
        
        # ========== 7. 创建装货单（供应商→在途仓）==========
        po1 = BusinessOrder(
            order_no=f"ZH{today.strftime('%Y%m%d')}001",
            order_type="loading",
            status="completed",
            source_id=sp1.id,
            target_id=transit.id,
            order_date=today - timedelta(days=3),
            completed_at=today - timedelta(days=3),
            total_quantity=100,
            total_amount=Decimal("2500"),
            total_shipping=Decimal("0"),  # 装货单不填运费
            total_storage_fee=Decimal("0"),  # 供应商→在途仓无冷藏费
            final_amount=Decimal("2500"),
            calculate_storage_fee=False,
            notes="[演示数据] 演示装货单 - 可安全删除",
            created_by=admin_id
        )
        db.add(po1)
        await db.flush()
        
        # 装货单明细（关联物流公司）
        poi1 = OrderItem(
            order_id=po1.id, product_id=p1.id,
            quantity=100, unit_price=Decimal("25"),
            amount=Decimal("2500"), subtotal=Decimal("2500"),
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("0")
        )
        db.add(poi1)
        
        # 装货流程
        pof1 = OrderFlow(
            order_id=po1.id, flow_type="created", flow_status="completed",
            description="创建装货单", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        pof2 = OrderFlow(
            order_id=po1.id, flow_type="completed", flow_status="completed",
            description="装货完成", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(pof1)
        db.add(pof2)
        await db.flush()
        
        # ========== 8. 创建在途仓库存和批次 ==========
        # 装货单完成后，货物进入在途仓
        stock_transit = Stock(
            warehouse_id=transit.id, product_id=p1.id,
            quantity=Decimal("100"), reserved_quantity=Decimal("0")
        )
        db.add(stock_transit)
        await db.flush()
        
        # 使用动态生成的批次号（避免与用户数据冲突）
        from app.api.api_v3.endpoints.batches import generate_batch_no
        demo_batch_no = await generate_batch_no(db)
        
        batch1 = StockBatch(
            batch_no=demo_batch_no,
            product_id=p1.id,
            storage_entity_id=transit.id,  # 在途仓
            source_entity_id=sp1.id,
            source_order_id=po1.id,
            initial_quantity=Decimal("100"),
            current_quantity=Decimal("100"),
            cost_price=Decimal("25"),
            cost_amount=Decimal("2500"),
            received_at=today - timedelta(days=3),
            status="active",
            notes="[演示数据] 演示批次 - 可安全删除",
            created_by=admin_id
        )
        db.add(batch1)
        
        flow1 = StockFlow(
            stock_id=stock_transit.id, order_id=po1.id,
            flow_type="in", quantity_change=Decimal("100"),
            quantity_before=Decimal("0"), quantity_after=Decimal("100"),
            reason="装货入在途仓", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(flow1)
        await db.flush()
        
        # ========== 8.5. 创建卸货单（在途仓→仓库）==========
        unload1 = BusinessOrder(
            order_no=f"XH{today.strftime('%Y%m%d')}001",
            order_type="unloading",
            status="completed",
            source_id=transit.id,
            target_id=wh1.id,
            order_date=today - timedelta(days=3),
            completed_at=today - timedelta(days=3),
            total_quantity=100,
            total_amount=Decimal("2500"),
            total_shipping=Decimal("100"),  # 卸货单填运费
            total_storage_fee=Decimal("1.5"),  # 入库冷藏费：0.1吨 × 15元/吨
            final_amount=Decimal("2601.5"),
            calculate_storage_fee=True,
            notes="[演示数据] 演示卸货单（入库）- 可安全删除",
            created_by=admin_id
        )
        db.add(unload1)
        await db.flush()
        
        # 卸货单明细
        unload_item1 = OrderItem(
            order_id=unload1.id, product_id=p1.id,
            quantity=100, unit_price=Decimal("25"),
            amount=Decimal("2500"), subtotal=Decimal("2500"),
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("100")
        )
        db.add(unload_item1)
        
        # 卸货流程
        unload_flow1 = OrderFlow(
            order_id=unload1.id, flow_type="created", flow_status="completed",
            description="创建卸货单", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        unload_flow2 = OrderFlow(
            order_id=unload1.id, flow_type="completed", flow_status="completed",
            description="卸货完成", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(unload_flow1)
        db.add(unload_flow2)
        await db.flush()
        
        # 从在途仓出库
        stock_transit.quantity = Decimal("0")
        flow_out_transit = StockFlow(
            stock_id=stock_transit.id, order_id=unload1.id,
            flow_type="out", quantity_change=Decimal("-100"),
            quantity_before=Decimal("100"), quantity_after=Decimal("0"),
            reason="卸货出在途仓", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(flow_out_transit)
        
        # 入库到仓库
        stock1 = Stock(
            warehouse_id=wh1.id, product_id=p1.id,
            quantity=Decimal("100"), reserved_quantity=Decimal("0")
        )
        db.add(stock1)
        await db.flush()
        
        flow_in_wh = StockFlow(
            stock_id=stock1.id, order_id=unload1.id,
            flow_type="in", quantity_change=Decimal("100"),
            quantity_before=Decimal("0"), quantity_after=Decimal("100"),
            reason="卸货入仓库", operator_id=admin_id, operated_at=today - timedelta(days=3)
        )
        db.add(flow_in_wh)
        
        # 更新批次存储位置
        batch1.storage_entity_id = wh1.id
        await db.flush()
        
        # ========== 9. 创建销售装货单（仓库→在途仓）==========
        # 冷藏费计算：0.03吨 × 15元/吨 + 0.03吨 × 2天 × 1.5元/吨/天 = 0.45 + 0.09 = 0.54元
        so1 = BusinessOrder(
            order_no=f"ZH{today.strftime('%Y%m%d')}002",
            order_type="loading",
            status="completed",
            source_id=wh1.id,
            target_id=transit.id,
            order_date=today - timedelta(days=1),
            completed_at=today - timedelta(days=1),
            total_quantity=30,
            total_amount=Decimal("1050"),
            total_shipping=Decimal("0"),  # 装货单不填运费
            total_storage_fee=Decimal("0.54"),  # 从仓库装货需计算冷藏费
            final_amount=Decimal("1050.54"),
            calculate_storage_fee=True,
            notes="[演示数据] 演示装货单（出库）- 可安全删除",
            created_by=admin_id
        )
        db.add(so1)
        await db.flush()
        
        soi1 = OrderItem(
            order_id=so1.id, product_id=p1.id,
            quantity=30, unit_price=Decimal("35"),
            amount=Decimal("1050"), subtotal=Decimal("1050"),
            cost_price=Decimal("25"),
            cost_amount=Decimal("750"),
            profit=Decimal("249.46"),
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("0")
        )
        db.add(soi1)
        await db.flush()
        
        # 创建批次出库记录（用于批次追溯）
        oib1 = OrderItemBatch(
            order_item_id=soi1.id,
            batch_id=batch1.id,
            quantity=Decimal("30"),
            cost_price=Decimal("25"),
            cost_amount=Decimal("750")
        )
        db.add(oib1)
        await db.flush()
        
        sof1 = OrderFlow(
            order_id=so1.id, flow_type="created", flow_status="completed",
            description="创建装货单", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        sof2 = OrderFlow(
            order_id=so1.id, flow_type="completed", flow_status="completed",
            description="装货完成", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        db.add(sof1)
        db.add(sof2)
        
        # 从仓库出库到在途仓
        stock1.quantity = Decimal("70")
        batch1.current_quantity = Decimal("70")
        
        flow2 = StockFlow(
            stock_id=stock1.id, order_id=so1.id,
            flow_type="out", quantity_change=Decimal("-30"),
            quantity_before=Decimal("100"), quantity_after=Decimal("70"),
            reason="装货出仓库", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        db.add(flow2)
        await db.flush()
        
        # ========== 9.5. 创建销售卸货单（在途仓→客户）==========
        so2 = BusinessOrder(
            order_no=f"XH{today.strftime('%Y%m%d')}002",
            order_type="unloading",
            status="completed",
            source_id=transit.id,
            target_id=cu1.id,
            order_date=today - timedelta(days=1),
            completed_at=today - timedelta(days=1),
            total_quantity=30,
            total_amount=Decimal("1050"),
            total_shipping=Decimal("50"),  # 卸货单填运费
            total_storage_fee=Decimal("0"),  # 客户不是仓库，无冷藏费
            final_amount=Decimal("1100"),
            calculate_storage_fee=False,
            notes="[演示数据] 演示卸货单（销售）- 可安全删除",
            created_by=admin_id
        )
        db.add(so2)
        await db.flush()
        
        soi2 = OrderItem(
            order_id=so2.id, product_id=p1.id,
            quantity=30, unit_price=Decimal("35"),
            amount=Decimal("1050"), subtotal=Decimal("1050"),
            logistics_company_id=lg1.id,
            shipping_cost=Decimal("50")
        )
        db.add(soi2)
        
        sof3 = OrderFlow(
            order_id=so2.id, flow_type="created", flow_status="completed",
            description="创建卸货单", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        sof4 = OrderFlow(
            order_id=so2.id, flow_type="completed", flow_status="completed",
            description="卸货完成", operator_id=admin_id, operated_at=today - timedelta(days=1)
        )
        db.add(sof3)
        db.add(sof4)
        await db.flush()
        
        # ========== 10. 创建往来账款（新版X-D-Y模式）==========
        # --- 装货单1（供应商→在途仓）账款 ---
        # 货款应付给供应商
        db.add(AccountBalance(
            entity_id=sp1.id, order_id=po1.id,
            balance_type="payable", amount=po1.total_amount,
            paid_amount=Decimal("0"), balance=po1.total_amount,
            status="pending", notes="装货货款(供应商)", created_by=admin_id
        ))
        
        # --- 卸货单1（在途仓→仓库）账款 ---
        # 运费应付给物流公司
        db.add(AccountBalance(
            entity_id=lg1.id, order_id=unload1.id,
            balance_type="payable", amount=unload1.total_shipping,
            paid_amount=Decimal("0"), balance=unload1.total_shipping,
            status="pending", notes="卸货运费", created_by=admin_id
        ))
        # 冷藏费应付给仓库
        db.add(AccountBalance(
            entity_id=wh1.id, order_id=unload1.id,
            balance_type="payable", amount=unload1.total_storage_fee,
            paid_amount=Decimal("0"), balance=unload1.total_storage_fee,
            status="pending", notes="入库冷藏费", created_by=admin_id
        ))
        
        # --- 装货单2（仓库→在途仓）账款 ---
        # 冷藏费应付给仓库
        db.add(AccountBalance(
            entity_id=wh1.id, order_id=so1.id,
            balance_type="payable", amount=so1.total_storage_fee,
            paid_amount=Decimal("0"), balance=so1.total_storage_fee,
            status="pending", notes="出库冷藏费", created_by=admin_id
        ))
        
        # --- 卸货单2（在途仓→客户）账款 ---
        # 货款应收自客户
        db.add(AccountBalance(
            entity_id=cu1.id, order_id=so2.id,
            balance_type="receivable", amount=so2.total_amount,
            paid_amount=Decimal("0"), balance=so2.total_amount,
            status="pending", notes="卸货货款(客户)", created_by=admin_id
        ))
        # 运费应付给物流公司
        db.add(AccountBalance(
            entity_id=lg1.id, order_id=so2.id,
            balance_type="payable", amount=so2.total_shipping,
            paid_amount=Decimal("0"), balance=so2.total_shipping,
            status="pending", notes="卸货运费", created_by=admin_id
        ))
        
        # 更新实体余额
        sp1.current_balance = -po1.total_amount  # 供应商：应付货款
        cu1.current_balance = so2.total_amount   # 客户：应收货款
        lg1.current_balance = -(unload1.total_shipping + so2.total_shipping)  # 物流：应付运费
        wh1.current_balance = -(unload1.total_storage_fee + so1.total_storage_fee)  # 仓库：应付冷藏费
        
        await db.commit()
        
        return {
            "success": True,
            "message": "演示数据初始化完成",
            "created": {
                "suppliers": 2,
                "customers": 2,
                "warehouses": 1,
                "logistics": 1,
                "transit": 1,
                "products": 3,
                "orders": 4,  # 2个装货单 + 2个卸货单
                "accounts": 6
            }
        }
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"初始化失败: {str(e)}")


@router.post("/upgrade-database")
async def upgrade_database(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认执行")
) -> Any:
    """
    手动触发数据库升级
    
    此操作会：
    1. 检查并添加缺失的数据库列
    2. 修复/更新基础配置数据（扣重公式等）
    3. 确保系统客商存在（杂费支出等）
    
    不会影响用户的业务数据。
    """
    if not confirm:
        return {
            "preview": True,
            "message": "预览模式 - 将检查并升级数据库结构",
            "current_version": CURRENT_DB_VERSION,
            "tip": "添加 ?confirm=true 参数确认执行"
        }
    
    try:
        result = await run_migrations(db)
        
        # 汇总结果
        summary = {
            "success": True,
            "message": "数据库升级完成",
            "old_version": result.get("old_version"),
            "new_version": result.get("new_version"),
            "columns_added": len(result.get("columns_added", [])),
            "columns_detail": result.get("columns_added", []),
            "formulas_fixed": result.get("formulas_fixed", {}),
            "system_entity": result.get("misc_expense_entity", {}),
            "errors": result.get("errors", [])
        }
        
        if summary["errors"]:
            summary["message"] = f"数据库升级完成，但有 {len(summary['errors'])} 个警告"
        
        return summary
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库升级失败: {str(e)}")
