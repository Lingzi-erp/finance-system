"""
业务单状态变更操作模块
- 确认、发货、收货、完成、取消
- 退货处理
"""

from typing import Any, Optional, List, Dict
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
from app.models.v3.entity import Entity
from app.schemas.v3.business_order import (
    BusinessOrderResponse, OrderStatusChange, OrderItemCreate, ReturnItemInput
)

from .core import generate_order_no, build_order_response, load_order
from .stock_ops import handle_stock_changes
from .account_ops import create_account_balance
from .storage_fee import update_order_storage_fee

router = APIRouter()

def _scale_value(value: Optional[Decimal], qty: int, total_qty: int) -> Decimal:
    """按比例缩放金额"""
    if not value:
        return Decimal("0")
    if total_qty <= 0:
        return Decimal("0")
    ratio = Decimal(str(qty)) / Decimal(str(total_qty))
    return (Decimal(str(value)) * ratio).quantize(Decimal("0.01"))

async def _get_returned_map(
    db: AsyncSession,
    original_item_ids: List[int]) -> Dict[int, int]:
    """获取已退货数量映射"""
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
    """准备退货明细"""
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
        
        # 计算运费
        if t.shipping_cost is not None:
            item_shipping = float(t.shipping_cost)
        elif total_return_shipping is not None and total_return_amount > 0:
            item_amount = Decimal(str(original.unit_price)) * Decimal(str(t.quantity))
            ratio = item_amount / total_return_amount
            item_shipping = float(Decimal(str(total_return_shipping)) * ratio)
        else:
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
                original_item_id=original.id,
                # === 复制规格信息（同商品不同规格视为不同商品）===
                spec_id=original.spec_id,
                spec_name=original.spec_name,
                # === 复制包装换算信息 ===
                container_name=original.container_name,
                unit_quantity=original.unit_quantity,
                base_unit_symbol=original.base_unit_symbol,
                pricing_mode=original.pricing_mode,
                container_count=float(Decimal(str(t.quantity)) / Decimal(str(original.unit_quantity))) if original.unit_quantity and original.unit_quantity > 0 else None,
                # === 批次分配（如果前端指定了批次）===
                batch_allocations=t.batch_allocations)
        )
        returned_map[original.id] = returned_map.get(original.id, 0) + t.quantity
    
    return result

async def _auto_create_return_order(
    db: AsyncSession,
    order: BusinessOrder,
    action_in: OrderStatusChange) -> Optional[BusinessOrder]:
    """根据原业务单自动创建退货单"""
    from .core import set_order_items
    
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
    await set_order_items(db, new_order, items_payload)
    
    db.add(OrderFlow(
        order_id=new_order.id,
        flow_type="created",
        flow_status="completed",
        description="自动创建退货业务单",
        operator_id=1,
        operated_at=datetime.utcnow()))
    
    return new_order

@router.post("/{order_id}/action", response_model=BusinessOrderResponse)
async def change_order_status(
    *,
    db: AsyncSession = Depends(get_db),
    order_id: int,
    action_in: OrderStatusChange) -> Any:
    """变更业务单状态 - 简化流程：草稿 → 完成"""
    order = await load_order(db, order_id)
    
    if not order:
        raise HTTPException(status_code=404, detail="业务单不存在")
    
    action = action_in.action
    current_status = order.status
    
    # 简化的状态转换：只有两种操作
    # complete: 草稿 → 完成（执行库存和账款操作）
    # return: 已完成 → 创建退货单（不改变原单状态）
    transitions = {
        "complete": {"from": ["draft"], "to": "completed", "flow": "completed", "perm": "order.confirm"},
        # 退货操作：原单保持"已完成"状态，只记录流程，不改变状态
        "return": {"from": ["completed"], "to": None, "flow": "returned", "perm": "order.confirm"},
    }
    
    if action not in transitions:
        raise HTTPException(status_code=400, detail=f"无效操作: {action}，只支持 complete/return")
    
    trans = transitions[action]
    
    # 单机版无需权限检查
    
    if current_status not in trans["from"]:
        raise HTTPException(
            status_code=400, 
            detail=f"当前状态 '{order.status_display}' 不允许执行 '{action}' 操作"
        )
    
    created_return_order = None
    if action == "return":
        if action_in.return_shipping is None:
            raise HTTPException(status_code=400, detail="退货运费为必填项")
        created_return_order = await _auto_create_return_order(db, order, action_in)
    
    # ===== 库存变动逻辑 =====
    await handle_stock_changes(db, order, action)
    
    # ===== 冷藏费自动计算 =====
    if action == "complete":
        # 采购单：固定15元，销售单：15 + 每吨每天1.5元
        await update_order_storage_fee(db, order)
    
    # ===== 应收/应付账款逻辑 =====
    if action == "complete" and trans["to"] == "completed":
        await create_account_balance(db, order)
    
    # 更新状态（退货操作不改变原单状态）
    if trans["to"] is not None:
        order.status = trans["to"]
        if trans["to"] == "completed":
            order.completed_at = datetime.utcnow()
    
    flow = OrderFlow(
        order_id=order.id,
        flow_type=trans["flow"],
        flow_status="completed",
        description=action_in.description or ("完成业务单" if action == "complete" else "发起退货"),
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
    
    # 强制刷新 session 缓存，确保关联关系被重新加载
    db.expire_all()
    
    order = await load_order(db, order_id)
    
    return build_order_response(order)

