"""业务单管理API"""

from typing import Any, Optional, List, Dict
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import inspect

from app.core.deps import get_db
from app.models.v3.stock import Stock, StockFlow
from app.models.v3.payment_record import PaymentRecord
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.account_balance import AccountBalance
from app.schemas.v3.business_order import (
    BusinessOrderCreate, BusinessOrderUpdate, BusinessOrderResponse, 
    BusinessOrderListResponse, OrderItemResponse, OrderFlowResponse,
    OrderStatusChange, OrderItemCreate, RelatedOrderInfo, ReturnItemInput
)
from app.api.api_v3.endpoints.stocks import (
    add_stock, reduce_stock, reserve_stock, release_stock
)

router = APIRouter()

async def generate_order_no(db: AsyncSession, order_type: str) -> str:
    """生成业务单号"""
    prefix_map = {
        "purchase": "PO",
        "sale": "SO",
        "transfer": "TO",
        "return_in": "RI",
        "return_out": "RO",
    }
    prefix = prefix_map.get(order_type, "BO")
    date_str = datetime.now().strftime("%Y%m%d")
    
    pattern = f"{prefix}{date_str}%"
    result = await db.execute(
        select(func.max(BusinessOrder.order_no)).where(BusinessOrder.order_no.like(pattern))
    )
    max_no = result.scalar()
    
    if max_no:
        try:
            seq = int(max_no[-3:]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    
    return f"{prefix}{date_str}{seq:03d}"

def build_order_response(order: BusinessOrder) -> BusinessOrderResponse:
    """构建业务单响应"""
    returned_map: Dict[int, int] = {}
    if order.return_orders:
        for ret in order.return_orders:
            if ret.status == "cancelled":
                continue
            for child_item in ret.items:
                if child_item.original_item_id:
                    returned_map[child_item.original_item_id] = returned_map.get(child_item.original_item_id, 0) + (child_item.quantity or 0)

    resp = BusinessOrderResponse(
        id=order.id,
        order_no=order.order_no,
        order_type=order.order_type,
        status=order.status,
        source_id=order.source_id,
        target_id=order.target_id,
        order_date=order.order_date,
        total_discount=float(order.total_discount or 0),
        notes=order.notes,
        type_display=order.type_display,
        status_display=order.status_display,
        source_name=order.source_entity.name if order.source_entity else "",
        source_code=order.source_entity.code if order.source_entity else "",
        target_name=order.target_entity.name if order.target_entity else "",
        target_code=order.target_entity.code if order.target_entity else "",
        total_quantity=order.total_quantity or 0,
        total_amount=float(order.total_amount or 0),
        total_shipping=float(order.total_shipping or 0),
        final_amount=float(order.final_amount or 0),
        loading_date=order.loading_date,
        unloading_date=order.unloading_date,
        created_at=order.created_at,
        updated_at=order.updated_at,
        completed_at=order.completed_at,
        items=[],
        flows=[]
    )
    resp.related_order_id = order.related_order_id
    
    if order.related_order:
        related = order.related_order
        resp.related_order = RelatedOrderInfo(
            id=related.id,
            order_no=related.order_no,
            order_type=related.order_type,
            type_display=related.type_display,
            status=related.status,
            status_display=related.status_display,
            total_quantity=related.total_quantity or 0,
            final_amount=float(related.final_amount or 0),
            created_at=related.created_at,
            completed_at=related.completed_at)
    
    if order.return_orders:
        resp.return_orders = [
            RelatedOrderInfo(
                id=ret.id,
                order_no=ret.order_no,
                order_type=ret.order_type,
                type_display=ret.type_display,
                status=ret.status,
                status_display=ret.status_display,
                total_quantity=ret.total_quantity or 0,
                final_amount=float(ret.final_amount or 0),
                created_at=ret.created_at,
                completed_at=ret.completed_at)
            for ret in order.return_orders
        ]
    
    for item in order.items:
        returned_qty = 0
        returnable_qty = 0
        if not item.original_item_id:
            returned_qty = returned_map.get(item.id, 0)
            returnable_qty = max((item.quantity or 0) - returned_qty, 0)
        item_resp = OrderItemResponse(
            id=item.id,
            order_id=item.order_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=float(item.unit_price),
            amount=float(item.amount),
            shipping_cost=float(item.shipping_cost or 0),
            shipping_type=item.shipping_type,
            shipping_rate=float(item.shipping_rate) if item.shipping_rate else None,
            discount=float(item.discount or 0),
            subtotal=float(item.subtotal or 0),
            notes=item.notes,
            product_name=item.product.name if item.product else "",
            product_code=item.product.code if item.product else "",
            product_unit=item.product.unit if item.product else "",
            original_item_id=item.original_item_id,
            returned_quantity=returned_qty,
            returnable_quantity=returnable_qty,
            created_at=item.created_at
        )
        resp.items.append(item_resp)
    
    for flow in order.flows:
        flow_resp = OrderFlowResponse(
            id=flow.id,
            order_id=flow.order_id,
            flow_type=flow.flow_type,
            flow_status=flow.flow_status,
            description=flow.description,
            meta_data=flow.meta_data,
            notes=flow.notes,
            type_display=flow.type_display,
            operator_id=flow.operator_id,
            operator_name=flow.operator.username if flow.operator else "",
            operated_at=flow.operated_at
        )
        resp.flows.append(flow_resp)
    
    return resp

def _base_order_query():
    """构建包含常用关联关系的基础查询"""
    return select(BusinessOrder).options(
        selectinload(BusinessOrder.source_entity),
        selectinload(BusinessOrder.target_entity),
        selectinload(BusinessOrder.creator),
        selectinload(BusinessOrder.related_order),
        selectinload(BusinessOrder.return_orders),
        selectinload(BusinessOrder.items).selectinload(OrderItem.product),
        selectinload(BusinessOrder.return_orders).selectinload(BusinessOrder.items).selectinload(OrderItem.product),
        selectinload(BusinessOrder.flows).selectinload(OrderFlow.operator))

async def _set_order_items(
    db: AsyncSession,
    order: BusinessOrder,
    items_data: List[OrderItemCreate]) -> None:
    """根据明细数据重新构建订单明细并计算汇总"""
    if not items_data:
        raise HTTPException(status_code=400, detail="请提供至少一条商品明细")
    
    # 直接删除旧明细，避免异步 lazy load
    await db.execute(
        delete(OrderItem).where(OrderItem.order_id == order.id)
    )
    await db.flush()
    
    total_quantity = 0
    total_amount = Decimal("0")
    total_shipping = Decimal("0")
    
    for item_in in items_data:
        product = await db.get(Product, item_in.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"商品ID {item_in.product_id} 不存在")
        
        amount = Decimal(str(item_in.quantity)) * Decimal(str(item_in.unit_price))
        shipping = Decimal(str(item_in.shipping_cost or 0))
        discount = Decimal(str(item_in.discount or 0))
        subtotal = amount + shipping - discount
        
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=item_in.product_id,
                quantity=item_in.quantity,
                unit_price=Decimal(str(item_in.unit_price)),
                amount=amount,
                shipping_cost=shipping,
                shipping_type=item_in.shipping_type,
                shipping_rate=Decimal(str(item_in.shipping_rate)) if item_in.shipping_rate is not None else None,
                discount=discount,
                subtotal=subtotal,
                notes=item_in.notes,
                original_item_id=item_in.original_item_id)
        )
        
        total_quantity += item_in.quantity
        total_amount += amount
        total_shipping += shipping
    
    order.total_quantity = total_quantity
    order.total_amount = total_amount
    order.total_shipping = total_shipping
    total_discount = order.total_discount or Decimal("0")
    order.final_amount = total_amount + total_shipping - total_discount

def _scale_value(value: Optional[Decimal], qty: int, total_qty: int) -> Decimal:
    if not value:
        return Decimal("0")
    if total_qty <= 0:
        return Decimal("0")
    ratio = Decimal(str(qty)) / Decimal(str(total_qty))
    return (Decimal(str(value)) * ratio).quantize(Decimal("0.01"))

async def _get_returned_map(
    db: AsyncSession,
    original_item_ids: List[int]) -> Dict[int, int]:
    if not original_item_ids:
        return {}
    result = await db.execute(
        select(
            OrderItem.original_item_id,
            func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
        .where(OrderItem.original_item_id.in_(original_item_ids))
        .where(BusinessOrder.status != "cancelled")
        .group_by(OrderItem.original_item_id)
    )
    return {row[0]: row[1] for row in result}

async def _prepare_return_items(
    db: AsyncSession,
    order: BusinessOrder,
    payloads: Optional[List[ReturnItemInput]],
    total_return_shipping: Optional[float] = None) -> List[OrderItemCreate]:
    item_map = {item.id: item for item in order.items}
    if payloads and len(payloads) > 0:
        targets = payloads
    else:
        returned_map = await _get_returned_map(db, list(item_map.keys()))
        targets = []
        for item in order.items:
            available = (item.quantity or 0) - returned_map.get(item.id, 0)
            if available > 0:
                targets.append(ReturnItemInput(order_item_id=item.id, quantity=available))
        if not targets:
            raise HTTPException(status_code=400, detail="当前单据没有可退数量")
    
    requested_ids = [t.order_item_id for t in targets]
    returned_map = await _get_returned_map(db, requested_ids)
    result: List[OrderItemCreate] = []
    
    # 如果指定了总运费，则按退货金额比例分摊到各明细
    # 先计算总退货金额用于分摊
    total_return_amount = Decimal("0")
    if total_return_shipping is not None:
        for t in targets:
            original = item_map.get(t.order_item_id)
            if original:
                total_return_amount += Decimal(str(original.unit_price)) * Decimal(str(t.quantity))
    
    for idx, t in enumerate(targets):
        original = item_map.get(t.order_item_id)
        if not original:
            raise HTTPException(status_code=400, detail=f"明细ID {t.order_item_id} 不存在")
        available = (original.quantity or 0) - returned_map.get(original.id, 0)
        if available <= 0:
            raise HTTPException(status_code=400, detail=f"{original.product.name if original.product else '该商品'} 已无可退数量")
        if t.quantity > available:
            raise HTTPException(status_code=400, detail=f"退货数量超出可退范围（可退 {available}）")
        
        # 计算运费：优先使用单品指定的运费，其次使用总运费按比例分摊，最后使用原单按比例计算
        if t.shipping_cost is not None:
            # 用户为该商品单独指定了运费
            item_shipping = float(t.shipping_cost)
        elif total_return_shipping is not None and total_return_amount > 0:
            # 按金额比例分摊总运费
            item_amount = Decimal(str(original.unit_price)) * Decimal(str(t.quantity))
            ratio = item_amount / total_return_amount
            item_shipping = float(Decimal(str(total_return_shipping)) * ratio)
        else:
            # 默认按原单比例计算
            item_shipping = float(_scale_value(original.shipping_cost, t.quantity, original.quantity))
        
        result.append(
            OrderItemCreate(
                product_id=original.product_id,
                quantity=t.quantity,
                unit_price=float(original.unit_price),
                shipping_cost=item_shipping,
                shipping_type=original.shipping_type,
                shipping_rate=float(original.shipping_rate) if original.shipping_rate is not None else None,
                discount=float(_scale_value(original.discount, t.quantity, original.quantity)),
                notes=f"退货自 {order.order_no}",
                original_item_id=original.id)
        )
        returned_map[original.id] = returned_map.get(original.id, 0) + t.quantity
    
    return result

async def _auto_create_return_order(
    db: AsyncSession,
    order: BusinessOrder,
    action_in: OrderStatusChange,
    current_user: User) -> Optional[BusinessOrder]:
    """根据原业务单自动创建退货单"""
    config = {
        "sale": {
            "order_type": "return_in",
            "source_attr": "target_id",
            "default_target_attr": "source_id",
        },
        "purchase": {
            "order_type": "return_out",
            "source_attr": "target_id",
            "default_target_attr": "source_id",
        },
    }.get(order.order_type)
    
    if not config:
        return None
    
    source_id = getattr(order, config["source_attr"])
    default_target_id = getattr(order, config["default_target_attr"])
    target_id = action_in.return_target_id or default_target_id
    
    source_entity = await db.get(Entity, source_id)
    if not source_entity:
        raise HTTPException(status_code=400, detail="退货来源实体不存在")
    
    target_entity = await db.get(Entity, target_id)
    if not target_entity:
        raise HTTPException(status_code=400, detail="退货目标实体不存在")
    
    new_order = BusinessOrder(
        order_no=await generate_order_no(db, config["order_type"]),
        order_type=config["order_type"],
        status="draft",
        source_id=source_id,
        target_id=target_id,
        order_date=action_in.return_date or datetime.utcnow(),
        total_discount=Decimal("0"),
        notes=f"自动生成退货单，源自 {order.order_no}",
        created_by=1,
        related_order_id=order.id)
    db.add(new_order)
    await db.flush()
    
    items_payload = await _prepare_return_items(db, order, action_in.return_items, action_in.return_shipping)
    await _set_order_items(db, new_order, items_payload)
    
    db.add(OrderFlow(
        order_id=new_order.id,
        flow_type="created",
        flow_status="completed",
        description="自动创建退货业务单",
        operator_id=1,
        operated_at=datetime.utcnow()))
    
    return new_order

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
    query = _base_order_query()
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
    
    user_perms = current_user.get_all_permissions()
    if "order.view_all" not in user_perms:
        conditions.append(BusinessOrder.created_by == 1)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    count_query = select(func.count()).select_from(
        select(BusinessOrder.id).where(and_(*conditions)).subquery() if conditions else BusinessOrder
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    query = query.order_by(BusinessOrder.created_at.desc())
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
    
    order = BusinessOrder(
        order_no=order_no,
        order_type=order_in.order_type,
        status="draft",
        source_id=order_in.source_id,
        target_id=order_in.target_id,
        order_date=order_in.order_date or datetime.utcnow(),
        total_discount=Decimal(str(order_in.total_discount)),
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
    order.total_shipping = total_shipping
    order.final_amount = total_amount + total_shipping - Decimal(str(order_in.total_discount))
    
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
        _base_order_query().where(BusinessOrder.id == order.id)
    )
    order = result.scalar_one()
    
    return build_order_response(order)

async def _load_order(db: AsyncSession, order_id: int) -> Optional[BusinessOrder]:
    """加载包含关联的业务单"""
    result = await db.execute(
        _base_order_query().where(BusinessOrder.id == order_id)
    )
    return result.scalar_one_or_none()

@router.get("/{order_id}", response_model=BusinessOrderResponse)
async def get_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int) -> Any:
    """获取业务单详情 - 需要 order.view 权限"""
    order = await _load_order(db, order_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    user_perms = current_user.get_all_permissions()
    if "order.view_all" not in user_perms and order.created_by != 1:
        raise HTTPException(status_code=403, detail="无权查看此业务单")
    
    return build_order_response(order)

@router.put("/{order_id}", response_model=BusinessOrderResponse)
async def update_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int,
    order_in: BusinessOrderUpdate) -> Any:
    """更新业务单内容，草稿可自由编辑，其他状态需 order.edit 权限且仅限商品明细"""
    order = await _load_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    user_perms = current_user.get_all_permissions()
    is_creator = order.created_by == 1
    can_view_all = "order.view_all" in user_perms
    has_edit_permission = "order.edit" in user_perms
    
    if order.status == "draft":
        if not is_creator and not can_view_all:
            raise HTTPException(status_code=403, detail="只能编辑自己创建的草稿")
        if "order.create" not in user_perms and not has_edit_permission:
            raise HTTPException(status_code=403, detail="权限不足，需要: order.create 或 order.edit")
        allow_basic_fields = True
    else:
        if not has_edit_permission:
            raise HTTPException(status_code=403, detail="仅持有 order.edit 权限的用户可以修改已确认业务单")
        allow_basic_fields = False
    
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
        if order_in.order_date is not None:
            order.order_date = order_in.order_date
        if order_in.total_discount is not None:
            order.total_discount = Decimal(str(order_in.total_discount))
        if order_in.total_shipping is not None:
            order.total_shipping = Decimal(str(order_in.total_shipping))
        if order_in.notes is not None:
            order.notes = order_in.notes
    
    # 更新明细
    if order_in.items is not None:
        await _set_order_items(db, order, order_in.items)
    elif not allow_basic_fields:
        raise HTTPException(status_code=400, detail="修改已确认业务单时必须提交新的商品明细")
    
    # 如果手动设置了整单运费，覆盖明细计算的运费并重新计算最终金额
    if order_in.total_shipping is not None:
        order.total_shipping = Decimal(str(order_in.total_shipping))
        order.final_amount = order.total_amount + order.total_shipping - (order.total_discount or Decimal("0"))
    
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
    order = await _load_order(db, order_id)
    return build_order_response(order)

@router.post("/{order_id}/action", response_model=BusinessOrderResponse)
async def change_order_status(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int,
    action_in: OrderStatusChange) -> Any:
    """变更业务单状态 - 需要对应操作权限"""
    order = await _load_order(db, order_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    action = action_in.action
    current_status = order.status
    
    transitions = {
        "confirm": {"from": ["draft"], "to": "confirmed", "flow": "confirmed", "perm": "order.confirm"},
        "ship": {"from": ["confirmed"], "to": "shipping", "flow": "shipped", "perm": "order.ship"},
        "receive": {"from": ["shipping"], "to": "completed", "flow": "received", "perm": "order.receive"},
        "complete": {"from": ["confirmed", "shipping"], "to": "completed", "flow": "completed", "perm": "order.confirm"},
        "cancel": {"from": ["draft", "confirmed"], "to": "cancelled", "flow": "cancelled", "perm": "order.cancel"},
        # 退货操作：原单保持"已完成"状态，只记录流程，不改变状态
        "return": {"from": ["completed"], "to": None, "flow": "returned", "perm": "order.confirm"},
    }
    
    if action not in transitions:
        raise HTTPException(status_code=400, detail=f"无效操作: {action}")
    
    trans = transitions[action]
    
    user_perms = current_user.get_all_permissions()
    required_perm = trans.get("perm")
    if required_perm and required_perm not in user_perms:
        raise HTTPException(status_code=403, detail=f"权限不足，需要: {required_perm}")
    
    if current_status not in trans["from"]:
        raise HTTPException(
            status_code=400, 
            detail=f"当前状态 '{order.status_display}' 不允许执行 '{action}' 操作"
        )
    
    created_return_order = None
    if action == "return":
        if action_in.return_shipping is None:
            raise HTTPException(status_code=400, detail="退货运费为必填项")
        created_return_order = await _auto_create_return_order(db, order, action_in, current_user)
    
    # ===== 库存变动逻辑 =====
    await _handle_stock_changes(db, order, action, current_user)
    
    # ===== 应收/应付账款逻辑 =====
    if action in ("receive", "complete") and trans["to"] == "completed":
        await _create_account_balance(db, order, current_user)
    
    # 更新状态（退货操作不改变原单状态）
    if trans["to"] is not None:
        order.status = trans["to"]
        if trans["to"] == "completed":
            order.completed_at = datetime.utcnow()
    
    flow = OrderFlow(
        order_id=order.id,
        flow_type=trans["flow"],
        flow_status="completed",
        description=action_in.description,
        meta_data=action_in.meta_data or {},
        notes=action_in.notes,
        operator_id=1,
        operated_at=datetime.utcnow()
    )
    if created_return_order:
        flow.meta_data["return_order_id"] = created_return_order.id
        flow.meta_data["return_order_no"] = created_return_order.order_no
        flow.meta_data["return_target_id"] = created_return_order.target_id
    db.add(flow)
    
    await db.commit()
    
    # 强制刷新 session 缓存，确保关联关系（如 return_orders）被重新加载
    db.expire_all()
    
    order = await _load_order(db, order_id)
    
    return build_order_response(order)

async def _create_account_balance(
    db: AsyncSession,
    order: BusinessOrder,
    current_user: User) -> None:
    """
    业务单完成时自动创建应收/应付账款
    
    规则：
    - 销售完成 → 应收账款（客户欠我们钱）
    - 采购完成 → 应付账款（我们欠供应商钱）
    - 客户退货完成 → 应付账款（我们要退钱给客户）
    - 退供应商完成 → 应收账款（供应商要退钱给我们）
    - 调拨不产生账款（内部转移）
    
    注意：退货单独立创建账款记录，不自动抵扣原订单。
    抵扣/核销操作由用户在收付款时手动进行。
    """
    order_type = order.order_type
    final_amount = order.final_amount or Decimal("0")
    
    if final_amount <= Decimal("0"):
        return  # 金额为0不创建账款
    
    balance_type = None
    entity_id = None
    notes_prefix = ""
    
    if order_type == "sale":
        # 销售 → 应收账款，实体是客户（目标方）
        balance_type = "receivable"
        entity_id = order.target_id
        notes_prefix = "销售应收"
    elif order_type == "purchase":
        # 采购 → 应付账款，实体是供应商（来源方）
        balance_type = "payable"
        entity_id = order.source_id
        notes_prefix = "采购应付"
    elif order_type == "return_in":
        # 客户退货 → 应付账款（我们要退钱给客户）
        # 实体是客户（来源方，退货时客户是来源）
        balance_type = "payable"
        entity_id = order.source_id
        notes_prefix = "客户退货应退"
    elif order_type == "return_out":
        # 退供应商 → 应收账款（供应商要退钱给我们）
        # 实体是供应商（目标方，退货时供应商是目标）
        balance_type = "receivable"
        entity_id = order.target_id
        notes_prefix = "退供应商应收"
    
    if not balance_type or not entity_id:
        return  # 调拨等不产生账款
    
    # 创建账款记录
    account = AccountBalance(
        entity_id=entity_id,
        order_id=order.id,
        balance_type=balance_type,
        amount=final_amount,
        paid_amount=Decimal("0"),
        balance=final_amount,
        status="pending",
        notes=f"{notes_prefix} - 由业务单 {order.order_no} 自动生成",
        created_by=1
    )
    db.add(account)
    
    # 更新实体的当前余额
    entity = await db.get(Entity, entity_id)
    if entity:
        if balance_type == "receivable":
            # 应收增加
            entity.current_balance = (entity.current_balance or Decimal("0")) + final_amount
        else:
            # 应付增加（用负数表示）
            entity.current_balance = (entity.current_balance or Decimal("0")) - final_amount

async def _handle_stock_changes(
    db: AsyncSession,
    order: BusinessOrder,
    action: str,
    current_user: User) -> None:
    """
    根据业务单类型和操作处理库存变动
    
    库存变动规则：
    - 采购 (purchase): 完成时 目标仓库 +入库
    - 销售 (sale): 确认时 来源仓库 预留；完成时 来源仓库 -出库
    - 调拨 (transfer): 确认时 来源仓库 预留；完成时 来源仓库 -出库，目标仓库 +入库
    - 客户退货 (return_in): 完成时 目标仓库 +入库
    - 退供应商 (return_out): 确认时 来源仓库 预留；完成时 来源仓库 -出库
    - 取消 (cancel): 释放预留
    """
    order_type = order.order_type
    
    # 确定仓库ID（根据业务类型，来源或目标可能是仓库）
    source_warehouse_id = None
    target_warehouse_id = None
    
    # 检查来源/目标是否是仓库
    if order.source_entity and "warehouse" in order.source_entity.entity_type:
        source_warehouse_id = order.source_id
    if order.target_entity and "warehouse" in order.target_entity.entity_type:
        target_warehouse_id = order.target_id
    
    # 根据操作类型处理库存
    if action == "confirm":
        # 确认时：需要出库的业务单预留库存
        if order_type in ("sale", "transfer", "return_out"):
            if not source_warehouse_id:
                raise HTTPException(status_code=400, detail="来源必须是仓库才能执行出库操作")
            for item in order.items:
                await reserve_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"确认业务单 {order.order_no}")
    
    elif action == "receive" or action == "complete":
        # 完成时：执行实际库存变动
        if order_type == "purchase":
            # 采购：目标仓库入库
            if not target_warehouse_id:
                raise HTTPException(status_code=400, detail="采购目标必须是仓库")
            for item in order.items:
                await add_stock(
                    db=db,
                    warehouse_id=target_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"采购入库 {order.order_no}")
        
        elif order_type == "sale":
            # 销售：来源仓库出库
            if not source_warehouse_id:
                raise HTTPException(status_code=400, detail="销售来源必须是仓库")
            for item in order.items:
                await reduce_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"销售出库 {order.order_no}",
                    check_available=False,  # 已经预留过了
                )
        
        elif order_type == "transfer":
            # 调拨：来源仓库出库，目标仓库入库
            if not source_warehouse_id or not target_warehouse_id:
                raise HTTPException(status_code=400, detail="调拨的来源和目标都必须是仓库")
            for item in order.items:
                await reduce_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"调拨出库 {order.order_no}",
                    check_available=False)
                await add_stock(
                    db=db,
                    warehouse_id=target_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"调拨入库 {order.order_no}")
        
        elif order_type == "return_in":
            # 客户退货：目标仓库入库
            if not target_warehouse_id:
                raise HTTPException(status_code=400, detail="退货目标必须是仓库")
            for item in order.items:
                await add_stock(
                    db=db,
                    warehouse_id=target_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"客户退货入库 {order.order_no}")
        
        elif order_type == "return_out":
            # 退供应商：来源仓库出库
            if not source_warehouse_id:
                raise HTTPException(status_code=400, detail="退货来源必须是仓库")
            for item in order.items:
                await reduce_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"退供应商出库 {order.order_no}",
                    check_available=False)
    
    elif action == "cancel":
        # 取消时：释放预留的库存
        if order_type in ("sale", "transfer", "return_out") and source_warehouse_id:
            for item in order.items:
                await release_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"取消业务单 {order.order_no}")

async def _rollback_stock_for_delete(
    db: AsyncSession,
    order: BusinessOrder,
    current_user: User) -> None:
    """
    删除业务单时回滚库存变动
    
    根据订单当前状态和类型，逆向执行库存操作：
    - confirmed: 释放预留（销售/调拨/退供应商）
    - shipping: 入库回滚已出库的（销售/调拨/退供应商）
    - completed: 完全回滚所有库存变动
    """
    order_type = order.order_type
    status = order.status
    
    # 确定仓库ID
    source_warehouse_id = None
    target_warehouse_id = None
    if order.source_entity and "warehouse" in order.source_entity.entity_type:
        source_warehouse_id = order.source_id
    if order.target_entity and "warehouse" in order.target_entity.entity_type:
        target_warehouse_id = order.target_id
    
    if status == "confirmed":
        # 已确认：释放预留
        if order_type in ("sale", "transfer", "return_out") and source_warehouse_id:
            for item in order.items:
                await release_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"删除业务单释放预留 {order.order_no}")
    
    elif status == "shipping":
        # 运输中：已出库的需要入库回滚
        if order_type in ("sale", "transfer", "return_out") and source_warehouse_id:
            for item in order.items:
                await add_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"删除业务单回滚出库 {order.order_no}")
    
    elif status == "completed":
        # 已完成：完全回滚
        if order_type == "purchase":
            # 采购完成后入库了，需要出库回滚
            if target_warehouse_id:
                for item in order.items:
                    await reduce_stock(
                        db=db,
                        warehouse_id=target_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除采购单回滚入库 {order.order_no}",
                        check_available=False)
        
        elif order_type == "sale":
            # 销售完成后出库了，需要入库回滚
            if source_warehouse_id:
                for item in order.items:
                    await add_stock(
                        db=db,
                        warehouse_id=source_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除销售单回滚出库 {order.order_no}")
        
        elif order_type == "transfer":
            # 调拨完成后：来源出库、目标入库，需要双向回滚
            if source_warehouse_id:
                for item in order.items:
                    await add_stock(
                        db=db,
                        warehouse_id=source_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除调拨单回滚出库 {order.order_no}")
            if target_warehouse_id:
                for item in order.items:
                    await reduce_stock(
                        db=db,
                        warehouse_id=target_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除调拨单回滚入库 {order.order_no}",
                        check_available=False)
        
        elif order_type == "return_in":
            # 客户退货完成后入库了，需要出库回滚
            if target_warehouse_id:
                for item in order.items:
                    await reduce_stock(
                        db=db,
                        warehouse_id=target_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除客户退货单回滚入库 {order.order_no}",
                        check_available=False)
        
        elif order_type == "return_out":
            # 退供应商完成后出库了，需要入库回滚
            if source_warehouse_id:
                for item in order.items:
                    await add_stock(
                        db=db,
                        warehouse_id=source_warehouse_id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        operator_id=1,
                        order_id=order.id,
                        order_item_id=item.id,
                        reason=f"删除退供应商单回滚出库 {order.order_no}")

@router.delete("/{order_id}")
async def delete_order(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int) -> Any:
    """删除业务单（仅草稿状态可删除，管理员可删除任何状态但会回滚库存和账款）- 需要 order.delete 权限"""
    # 加载订单及关联
    result = await db.execute(
        _base_order_query().where(BusinessOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    is_admin = getattr(current_user, "is_admin", False)
    if order.status != "draft" and not is_admin:
        raise HTTPException(status_code=400, detail="只有草稿状态的业务单可以删除")
    
    user_perms = current_user.get_all_permissions()
    if not is_admin and "order.view_all" not in user_perms and order.created_by != 1:
        raise HTTPException(status_code=403, detail="无权删除此业务单")
    
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
        await _rollback_stock_for_delete(db, order, current_user)
    
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
