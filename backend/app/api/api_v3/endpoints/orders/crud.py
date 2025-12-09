"""
业务单 CRUD 操作模块
- 列表查询
- 创建
- 更新
- 删除
"""

from typing import Any, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.account_balance import AccountBalance
from app.models.v3.stock import Stock, StockFlow
from app.models.v3.payment_record import PaymentRecord
from app.schemas.v3.business_order import (
    BusinessOrderCreate, BusinessOrderUpdate, BusinessOrderResponse, 
    BusinessOrderListResponse
)

from .core import generate_order_no, build_order_response, base_order_query, load_order, set_order_items
from .stock_ops import rollback_stock_for_delete

router = APIRouter()

@router.get("/", response_model=BusinessOrderListResponse)
async def list_orders(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    order_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    source_id: Optional[int] = Query(None),
    target_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)) -> Any:
    """获取业务单列表 - 需要 order.view 权限"""
    query = base_order_query()
    conditions = []
    
    if order_type:
        conditions.append(BusinessOrder.order_type == order_type)
    if status:
        conditions.append(BusinessOrder.status == status)
    if source_id:
        conditions.append(BusinessOrder.source_id == source_id)
    if target_id:
        conditions.append(BusinessOrder.target_id == target_id)
    if search:
        conditions.append(BusinessOrder.order_no.contains(search))
    if start_date:
        conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(BusinessOrder.order_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    count_query = select(func.count()).select_from(
        select(BusinessOrder.id).where(and_(*conditions)).subquery() if conditions else BusinessOrder
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 按业务日期（装货/卸货日期）排序，而非系统创建时间
    query = query.order_by(BusinessOrder.order_date.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    orders = result.scalars().unique().all()
    
    return BusinessOrderListResponse(
        data=[build_order_response(o) for o in orders],
        total=total,
        page=page,
        limit=limit
    )

@router.post("/", response_model=BusinessOrderResponse)
async def create_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_in: BusinessOrderCreate) -> Any:
    """创建业务单 - 需要 order.create 权限"""
    source = await db.get(Entity, order_in.source_id)
    if not source:
        raise HTTPException(status_code=400, detail="来源实体不存在")
    
    target = await db.get(Entity, order_in.target_id)
    if not target:
        raise HTTPException(status_code=400, detail="目标实体不存在")
    
    order_no = await generate_order_no(db, order_in.order_type)
    
    # 验证物流公司（如果提供了）
    if order_in.logistics_company_id:
        logistics = await db.get(Entity, order_in.logistics_company_id)
        if not logistics or not logistics.is_logistics:
            raise HTTPException(status_code=400, detail="物流公司不存在或类型不正确")
    
    # 业务日期根据订单类型自动设置：
    # - loading(装货单)：使用order_date作为装货日期
    # - unloading(卸货单)：使用order_date作为卸货日期
    # - purchase(旧类型)：卸货日期（入库日期）
    # - sale(旧类型)：装货日期（出库日期）
    if order_in.order_type == "loading":
        business_date = order_in.order_date or datetime.utcnow()
    elif order_in.order_type == "unloading":
        business_date = order_in.order_date or datetime.utcnow()
    elif order_in.order_type == "purchase":
        business_date = order_in.unloading_date or order_in.order_date or datetime.utcnow()
    elif order_in.order_type == "sale":
        business_date = order_in.loading_date or order_in.order_date or datetime.utcnow()
    else:
        business_date = order_in.unloading_date or order_in.loading_date or order_in.order_date or datetime.utcnow()
    
    order = BusinessOrder(
        order_no=order_no,
        order_type=order_in.order_type,
        status="draft",
        source_id=order_in.source_id,
        target_id=order_in.target_id,
        logistics_company_id=order_in.logistics_company_id,
        order_date=business_date,
        loading_date=order_in.loading_date,
        unloading_date=order_in.unloading_date,
        total_discount=Decimal(str(order_in.total_discount)),
        total_storage_fee=Decimal(str(order_in.total_storage_fee)),
        other_fee=Decimal(str(order_in.other_fee)),
        calculate_storage_fee=order_in.calculate_storage_fee,
        notes=order_in.notes,
        created_by=1
    )
    db.add(order)
    await db.flush()
    
    total_quantity = 0
    total_amount = Decimal("0")
    total_shipping = Decimal("0")
    
    for item_in in order_in.items:
        product = await db.get(Product, item_in.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"商品ID {item_in.product_id} 不存在")
        
        amount = Decimal(str(item_in.quantity)) * Decimal(str(item_in.unit_price))
        shipping = Decimal(str(item_in.shipping_cost))
        discount = Decimal(str(item_in.discount))
        subtotal = amount + shipping - discount
        
        item = OrderItem(
            order_id=order.id,
            product_id=item_in.product_id,
            quantity=item_in.quantity,
            unit_price=Decimal(str(item_in.unit_price)),
            amount=amount,
            shipping_cost=shipping,
            shipping_type=item_in.shipping_type,
            shipping_rate=Decimal(str(item_in.shipping_rate)) if item_in.shipping_rate else None,
            discount=discount,
            subtotal=subtotal,
            notes=item_in.notes
        )
        db.add(item)
        
        total_quantity += item_in.quantity
        total_amount += amount
        total_shipping += shipping
    
    order.total_quantity = total_quantity
    order.total_amount = total_amount
    # 优先使用前端传入的整单运费，否则使用明细累加的运费
    if order_in.total_shipping and order_in.total_shipping > 0:
        order.total_shipping = Decimal(str(order_in.total_shipping))
    else:
        order.total_shipping = total_shipping
    order.final_amount = (
        total_amount 
        + order.total_shipping 
        + Decimal(str(order_in.total_storage_fee)) 
        + Decimal(str(order_in.other_fee))
        - Decimal(str(order_in.total_discount))
    )
    
    flow = OrderFlow(
        order_id=order.id,
        flow_type="created",
        flow_status="completed",
        description="创建业务单",
        operator_id=1,
        operated_at=datetime.utcnow()
    )
    db.add(flow)
    
    await db.commit()
    
    # 重新加载订单（使用完整的关联查询）
    result = await db.execute(
        base_order_query().where(BusinessOrder.id == order.id)
    )
    order = result.scalar_one()
    
    return build_order_response(order)

@router.get("/{order_id}", response_model=BusinessOrderResponse)
async def get_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int) -> Any:
    """获取业务单详情 - 需要 order.view 权限"""
    order = await load_order(db, order_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    return build_order_response(order)

@router.put("/{order_id}", response_model=BusinessOrderResponse)
async def update_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int,
    order_in: BusinessOrderUpdate) -> Any:
    """更新业务单内容，草稿可自由编辑，其他状态需 order.edit 权限且仅限商品明细"""
    order = await load_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    # 单机版：草稿可编辑，非草稿仅可编辑明细
    allow_basic_fields = order.status == "draft"
    
    # 更新基础信息（仅草稿）
    if allow_basic_fields:
        if order_in.source_id is not None and order_in.source_id != order.source_id:
            source = await db.get(Entity, order_in.source_id)
            if not source:
                raise HTTPException(status_code=400, detail="来源实体不存在")
            order.source_id = order_in.source_id
        if order_in.target_id is not None and order_in.target_id != order.target_id:
            target = await db.get(Entity, order_in.target_id)
            if not target:
                raise HTTPException(status_code=400, detail="目标实体不存在")
            order.target_id = order_in.target_id
        if order_in.logistics_company_id is not None:
            if order_in.logistics_company_id > 0:
                logistics = await db.get(Entity, order_in.logistics_company_id)
                if not logistics or not logistics.is_logistics:
                    raise HTTPException(status_code=400, detail="物流公司不存在或类型不正确")
                order.logistics_company_id = order_in.logistics_company_id
            else:
                order.logistics_company_id = None
        if order_in.order_date is not None:
            order.order_date = order_in.order_date
        if order_in.loading_date is not None:
            order.loading_date = order_in.loading_date
        if order_in.unloading_date is not None:
            order.unloading_date = order_in.unloading_date
        if order_in.total_discount is not None:
            order.total_discount = Decimal(str(order_in.total_discount))
        if order_in.total_shipping is not None:
            order.total_shipping = Decimal(str(order_in.total_shipping))
        if order_in.total_storage_fee is not None:
            order.total_storage_fee = Decimal(str(order_in.total_storage_fee))
        if order_in.other_fee is not None:
            order.other_fee = Decimal(str(order_in.other_fee))
        if order_in.notes is not None:
            order.notes = order_in.notes
    
    # 更新明细
    if order_in.items is not None:
        await set_order_items(db, order, order_in.items)
    elif not allow_basic_fields:
        raise HTTPException(status_code=400, detail="修改已确认业务单时必须提交新的商品明细")
    
    # 如果手动设置了整单运费、冷藏费或其他费用，重新应用并计算最终金额
    # (因为 set_order_items 可能会覆盖这些值)
    if order_in.total_shipping is not None:
        order.total_shipping = Decimal(str(order_in.total_shipping))
    if order_in.total_storage_fee is not None:
        order.total_storage_fee = Decimal(str(order_in.total_storage_fee))
    if order_in.other_fee is not None:
        order.other_fee = Decimal(str(order_in.other_fee))
    
    # 重新计算最终金额
    order.final_amount = (
        (order.total_amount or Decimal("0"))
        + (order.total_shipping or Decimal("0")) 
        + (order.total_storage_fee or Decimal("0")) 
        + (order.other_fee or Decimal("0"))
        - (order.total_discount or Decimal("0"))
    )
    
    # 记录流程
    flow = OrderFlow(
        order_id=order.id,
        flow_type="edited" if allow_basic_fields else "force_edited",
        flow_status="completed",
        description="修改业务单（草稿）" if allow_basic_fields else "高权限修改商品明细",
        operator_id=1,
        operated_at=datetime.utcnow(),
        notes=order_in.notes)
    db.add(flow)
    
    await db.commit()
    order = await load_order(db, order_id)
    return build_order_response(order)

@router.delete("/{order_id}")
async def delete_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int) -> Any:
    """删除业务单（仅草稿状态可删除，管理员可删除任何状态但会回滚库存和账款）- 需要 order.delete 权限"""
    # 加载订单及关联
    result = await db.execute(
        base_order_query().where(BusinessOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    # 单机版：仅草稿可删除
    if order.status != "draft":
        raise HTTPException(status_code=400, detail="只有草稿状态的业务单可以删除")
    
    # 检查是否有关联的收付款记录
    account_result = await db.execute(
        select(AccountBalance).where(AccountBalance.order_id == order_id)
    )
    account = account_result.scalar_one_or_none()
    
    if account:
        # 检查是否有收付款记录
        payment_count = (await db.execute(
            select(func.count(PaymentRecord.id)).where(PaymentRecord.account_balance_id == account.id)
        )).scalar() or 0
        
        if payment_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"该业务单关联的账款已有 {payment_count} 条收付款记录，无法删除。请先删除收付款记录。"
            )
        
        # 回滚实体余额
        entity = await db.get(Entity, account.entity_id)
        if entity:
            if account.balance_type == "receivable":
                entity.current_balance = (entity.current_balance or Decimal("0")) - account.amount
            else:
                entity.current_balance = (entity.current_balance or Decimal("0")) + account.amount
        
        # 删除账款记录
        await db.delete(account)
    
    # 如果不是草稿状态，需要先回滚库存变动
    if order.status != "draft":
        await rollback_stock_for_delete(db, order)
    
    # 删除该业务单关联的所有库存流水
    await db.execute(
        delete(StockFlow).where(StockFlow.order_id == order_id)
    )
    
    # 删除业务单（会级联删除订单项和流程记录）
    await db.delete(order)
    
    # 清理空的库存记录（数量和预留都为0，且没有其他流水记录的）
    empty_stocks_result = await db.execute(
        select(Stock.id).where(
            Stock.quantity == 0,
            Stock.reserved_quantity == 0
        )
    )
    empty_stock_ids = [row[0] for row in empty_stocks_result.fetchall()]
    
    if empty_stock_ids:
        for stock_id in empty_stock_ids:
            flow_count = (await db.execute(
                select(func.count(StockFlow.id)).where(StockFlow.stock_id == stock_id)
            )).scalar() or 0
            
            if flow_count == 0:
                stock = await db.get(Stock, stock_id)
                if stock:
                    await db.delete(stock)
    
    await db.commit()
    
    return {"message": "删除成功"}

