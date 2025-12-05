"""
业务单核心功能模块
- 单号生成
- 响应构建
- 基础查询
"""

from typing import Dict, List, Optional
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
from app.models.v3.product import Product
from app.models.v3.stock_batch import StockBatch, OrderItemBatch
from app.schemas.v3.business_order import (
    BusinessOrderResponse, OrderItemResponse, OrderFlowResponse,
    OrderItemCreate, RelatedOrderInfo
)

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
        total_storage_fee=float(order.total_storage_fee or 0),
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
            # 运输信息
            plate_number=item.plate_number,
            driver_phone=item.driver_phone,
            logistics_company=item.logistics_company,
            invoice_no=item.invoice_no,
            # 商品信息
            product_name=item.product.name if item.product else "",
            product_code=item.product.code if item.product else "",
            product_unit=item.product.unit if item.product else "",
            original_item_id=item.original_item_id,
            returned_quantity=returned_qty,
            returnable_quantity=returnable_qty,
            # 商品规格快照（从 ProductSpec 获取）
            spec_id=item.spec_id,
            spec_name=item.spec_name,
            # 包装换算信息（从订单明细快照读取，确保历史数据准确）
            container_name=item.container_name,
            unit_quantity=item.unit_quantity,
            base_unit_symbol=item.base_unit_symbol,
            # 计价方式和件数
            pricing_mode=item.pricing_mode or "weight",
            container_count=float(item.container_count) if item.container_count else None,
            # 批次相关
            gross_weight=float(item.gross_weight) if item.gross_weight else None,
            deduction_formula_id=item.deduction_formula_id,
            deduction_formula_name=item.deduction_formula.name if item.deduction_formula else "",
            storage_rate=float(item.storage_rate) if item.storage_rate else None,
            batch_id=item.batch_id,
            batch_no=item.batch.batch_no if item.batch else "",
            # 成本相关
            cost_price=float(item.cost_price) if item.cost_price else None,
            cost_amount=float(item.cost_amount) if item.cost_amount else None,
            profit=float(item.profit) if item.profit else None,
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

def base_order_query():
    """构建包含常用关联关系的基础查询"""
    return select(BusinessOrder).options(
        selectinload(BusinessOrder.source_entity),
        selectinload(BusinessOrder.target_entity),
        selectinload(BusinessOrder.related_order),
        selectinload(BusinessOrder.return_orders),
        selectinload(BusinessOrder.items).selectinload(OrderItem.product),
        selectinload(BusinessOrder.items).selectinload(OrderItem.deduction_formula),
        selectinload(BusinessOrder.items).selectinload(OrderItem.batch),
        selectinload(BusinessOrder.return_orders).selectinload(BusinessOrder.items).selectinload(OrderItem.product),
        selectinload(BusinessOrder.flows).selectinload(OrderFlow.operator))

async def load_order(db: AsyncSession, order_id: int) -> Optional[BusinessOrder]:
    """加载包含关联的业务单"""
    result = await db.execute(
        base_order_query().where(BusinessOrder.id == order_id)
    )
    return result.scalar_one_or_none()

async def set_order_items(
    db: AsyncSession,
    order: BusinessOrder,
    items_data: List[OrderItemCreate]) -> None:
    """根据明细数据重新构建订单明细并计算汇总"""
    from fastapi import HTTPException
    from sqlalchemy import delete
    
    if not items_data:
        raise HTTPException(status_code=400, detail="请提供至少一条商品明细")
    
    # 删除旧的批次关联记录
    await db.execute(
        delete(OrderItemBatch).where(
            OrderItemBatch.order_item_id.in_(
                select(OrderItem.id).where(OrderItem.order_id == order.id)
            )
        )
    )
    
    # 直接删除旧明细，避免异步 lazy load
    await db.execute(
        delete(OrderItem).where(OrderItem.order_id == order.id)
    )
    await db.flush()
    
    total_quantity = 0
    total_amount = Decimal("0")
    total_shipping = Decimal("0")
    total_cost = Decimal("0")
    
    for item_in in items_data:
        product = await db.get(Product, item_in.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"商品ID {item_in.product_id} 不存在")
        
        amount = Decimal(str(item_in.quantity)) * Decimal(str(item_in.unit_price))
        shipping = Decimal(str(item_in.shipping_cost or 0))
        discount = Decimal(str(item_in.discount or 0))
        subtotal = amount + shipping - discount
        
        # 获取规格快照信息（从 ProductSpec 获取，已由前端传入）
        spec_id = item_in.spec_id
        spec_name = item_in.spec_name
        
        # 包装规格换算信息（前端从 ProductSpec 获取并传入）
        # 这些字段用于历史订单的显示，确保即使商品规格修改了也不影响历史数据
        container_name = item_in.container_name
        unit_quantity = item_in.unit_quantity
        base_unit_symbol = item_in.base_unit_symbol
        
        # 创建明细
        order_item = OrderItem(
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
            original_item_id=item_in.original_item_id,
            # === 商品规格快照（从 ProductSpec 获取）===
            spec_id=spec_id,
            spec_name=spec_name,
            # === 包装换算信息快照（确保历史订单显示正确）===
            container_name=container_name,
            unit_quantity=unit_quantity,
            base_unit_symbol=base_unit_symbol,
            # === 计价方式 ===
            pricing_mode=item_in.pricing_mode or "weight",
            container_count=Decimal(str(item_in.container_count)) if item_in.container_count else None,
            # 运输信息
            plate_number=item_in.plate_number,
            driver_phone=item_in.driver_phone,
            logistics_company=item_in.logistics_company,
            invoice_no=item_in.invoice_no,
            # 批次相关字段（采购用）
            gross_weight=Decimal(str(item_in.gross_weight)) if item_in.gross_weight is not None else None,
            deduction_formula_id=item_in.deduction_formula_id,
            storage_rate=Decimal(str(item_in.storage_rate)) if item_in.storage_rate is not None else None)
        db.add(order_item)
        await db.flush()  # 获取order_item.id
        
        # 处理批次分配（销售单使用）
        item_cost = Decimal("0")
        if item_in.batch_allocations and order.order_type == "sale":
            for alloc in item_in.batch_allocations:
                batch = await db.get(StockBatch, alloc.batch_id)
                if not batch:
                    raise HTTPException(status_code=400, detail=f"批次ID {alloc.batch_id} 不存在")
                
                alloc_qty = Decimal(str(alloc.quantity))
                
                if batch.available_quantity < alloc_qty:
                    raise HTTPException(
                        status_code=400,
                        detail=f"批次 {batch.batch_no} 可用数量不足：可用 {batch.available_quantity}，需要 {alloc_qty}"
                    )
                
                # 使用真实成本价（含仓储费）
                cost_price = batch.real_cost_price
                cost_amount = cost_price * alloc_qty
                
                # 创建批次关联记录
                batch_record = OrderItemBatch(
                    order_item_id=order_item.id,
                    batch_id=batch.id,
                    quantity=alloc_qty,
                    cost_price=cost_price,
                    cost_amount=cost_amount)
                db.add(batch_record)
                
                # 扣减批次数量
                batch.current_quantity -= alloc_qty
                batch.update_status()
                
                item_cost += cost_amount
            
            # 更新明细的成本信息
            order_item.cost_amount = item_cost
            order_item.cost_price = item_cost / Decimal(str(item_in.quantity)) if item_in.quantity > 0 else Decimal("0")
            order_item.profit = amount - item_cost
            total_cost += item_cost
        
        total_quantity += item_in.quantity
        total_amount += amount
        total_shipping += shipping
    
    order.total_quantity = total_quantity
    order.total_amount = total_amount
    order.total_shipping = total_shipping
    total_discount = order.total_discount or Decimal("0")
    total_storage_fee = order.total_storage_fee or Decimal("0")
    order.final_amount = total_amount + total_shipping + total_storage_fee - total_discount

