"""
业务单库存操作模块
- 库存预留、释放、入库、出库
- 采购完成时自动创建批次
- 销售完成时自动分配批次（FIFO）并计算利润
- 删除订单时的库存回滚
"""

from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.v3.business_order import BusinessOrder
from app.models.v3.deduction_formula import DeductionFormula
from app.models.v3.stock_batch import StockBatch, OrderItemBatch
from app.api.api_v3.endpoints.stocks import (
    add_stock, reduce_stock, reserve_stock, release_stock
)
from app.api.api_v3.endpoints.batches import create_batch_from_purchase


async def _allocate_batches_fifo(
    db: AsyncSession,
    item,  # OrderItem
    warehouse_id: int
) -> None:
    """
    使用FIFO（先进先出）原则为销售明细分配批次并计算成本
    
    利润计算依赖批次追溯数据，所以必须在销售确认时自动分配批次。
    批次成本已包含采购时的运费和冷藏费（real_cost_price）。
    """
    quantity_needed = Decimal(str(item.quantity))
    total_cost = Decimal("0")
    
    # 查找该仓库中该商品的可用批次（FIFO：按入库时间升序）
    result = await db.execute(
        select(StockBatch)
        .where(
            StockBatch.product_id == item.product_id,
            StockBatch.storage_entity_id == warehouse_id,
            StockBatch.current_quantity > 0,
            StockBatch.status != "depleted"
        )
        .order_by(StockBatch.received_at.asc())  # 先进先出
    )
    batches = result.scalars().all()
    
    for batch in batches:
        if quantity_needed <= 0:
            break
            
        # 计算从该批次分配的数量
        alloc_qty = min(batch.current_quantity, quantity_needed)
        
        # 获取该批次的真实成本价（含采购运费、仓储费等）
        cost_price = batch.real_cost_price
        cost_amount = cost_price * alloc_qty
        
        # 创建批次关联记录（出库追溯）
        batch_record = OrderItemBatch(
            order_item_id=item.id,
            batch_id=batch.id,
            quantity=alloc_qty,
            cost_price=cost_price,
            cost_amount=cost_amount
        )
        db.add(batch_record)
        
        # 扣减批次数量
        batch.current_quantity -= alloc_qty
        batch.update_status()
        
        total_cost += cost_amount
        quantity_needed -= alloc_qty
    
    # 更新明细的成本信息（用于快速查询，但利润以批次追溯为准）
    if total_cost > 0:
        item.cost_amount = total_cost
        item.cost_price = total_cost / Decimal(str(item.quantity)) if item.quantity > 0 else Decimal("0")
        # 注意：这里不计算 profit，利润统一从批次追溯计算（需扣除销售端运费和冷藏费）

async def handle_stock_changes(
    db: AsyncSession,
    order: BusinessOrder,
    action: str) -> None:
    """
    根据业务单类型和操作处理库存变动（简化流程）
    
    库存变动规则（仅在 complete 时执行）：
    - 采购 (purchase): 目标仓库 +入库
    - 销售 (sale): 来源仓库 -出库
    - 调拨 (transfer): 来源仓库 -出库，目标仓库 +入库
    - 客户退货 (return_in): 目标仓库 +入库
    - 退供应商 (return_out): 来源仓库 -出库
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
    
    # 只在 complete 操作时处理库存
    if action == "complete":
        # 完成时：执行实际库存变动
        if order_type == "purchase":
            # 采购：目标仓库入库 + 创建批次
            if not target_warehouse_id:
                raise HTTPException(status_code=400, detail="采购目标必须是仓库")
            for item in order.items:
                # 1. 每个采购明细都创建批次（用于追溯）
                # 计算净重/入库数量
                net_weight = Decimal(str(item.quantity))  # 默认使用订单数量
                tare_weight = Decimal("0")
                gross_weight = item.gross_weight
                
                # 如果有毛重和扣重公式，使用公式计算净重
                if gross_weight and item.deduction_formula_id:
                    deduction_formula = await db.get(DeductionFormula, item.deduction_formula_id)
                    if deduction_formula:
                        net_weight = deduction_formula.calculate_net_weight(gross_weight)
                        tare_weight = gross_weight - net_weight
                elif gross_weight:
                    # 有毛重但无公式，毛重=净重
                    net_weight = gross_weight
                
                # 创建批次
                batch = await create_batch_from_purchase(
                    db=db,
                    order=order,
                    item=item,
                    operator_id=1,
                    gross_weight=gross_weight,
                    tare_weight=tare_weight,
                    freight_cost=item.shipping_cost,
                    storage_rate=item.storage_rate)
                # 更新明细的批次ID
                item.batch_id = batch.id
                
                # 2. 更新库存（使用订单中的数量，因为用户已确认）
                await add_stock(
                    db=db,
                    warehouse_id=target_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"采购入库 {order.order_no} 批次:{batch.batch_no}")
        
        elif order_type == "sale":
            # 销售：来源仓库出库 + FIFO分配批次（用于成本和利润追溯）
            if not source_warehouse_id:
                raise HTTPException(status_code=400, detail="销售来源必须是仓库")
            for item in order.items:
                # 1. 扣减库存
                await reduce_stock(
                    db=db,
                    warehouse_id=source_warehouse_id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    operator_id=1,
                    order_id=order.id,
                    order_item_id=item.id,
                    reason=f"销售出库 {order.order_no}",
                    check_available=True,
                )
                # 2. FIFO分配批次并记录成本（批次追溯的关键）
                await _allocate_batches_fifo(db, item, source_warehouse_id)
        
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
                    check_available=True,  # 直接检查可用库存
                )
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
                    check_available=True,  # 直接检查可用库存
                )

async def rollback_stock_for_delete(
    db: AsyncSession,
    order: BusinessOrder) -> None:
    """
    删除业务单时回滚库存变动（简化流程）
    
    根据订单当前状态和类型，逆向执行库存操作：
    - draft: 无需回滚（未影响库存）
    - completed: 完全回滚所有库存变动
    """
    order_type = order.order_type
    status = order.status
    
    # 草稿状态无需回滚
    if status == "draft":
        return
    
    # 确定仓库ID
    source_warehouse_id = None
    target_warehouse_id = None
    if order.source_entity and "warehouse" in order.source_entity.entity_type:
        source_warehouse_id = order.source_id
    if order.target_entity and "warehouse" in order.target_entity.entity_type:
        target_warehouse_id = order.target_id
    
    if status == "completed":
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

