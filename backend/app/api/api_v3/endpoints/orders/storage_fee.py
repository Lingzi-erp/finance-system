"""
冷藏费自动计算模块

新架构规则（在途仓架构）：
- 装货单(loading) X→D：
  - 如果 X 是仓库(B)：计算 出库费(15元/吨) + 存储费(1.5元/吨/天)
  - 如果 X 是供应商(A) 或客户(C)：不计算冷藏费
- 卸货单(unloading) D→Y：
  - 如果 Y 是仓库(B)：只计算 入库费(15元/吨)
  - 如果 Y 是客户(C) 或供应商(A)：不计算冷藏费

兼容旧类型：
- 采购单(purchase)：每吨 15 元（入库费）
- 销售单(sale)：每吨 15 元（出库费） + 每吨每天 1.5 元（存储费）
  
注意：所有日期计算都基于用户输入的业务日期（order_date），而非系统时间戳
"""

from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.v3.business_order import BusinessOrder
from app.models.v3.stock_batch import StockBatch, OrderItemBatch

# 常量配置
BASE_RATE_PER_TON = Decimal("15.00")  # 进出库基础费率：每吨15元
STORAGE_RATE_PER_TON_PER_DAY = Decimal("1.5")  # 每吨每天的存储费率


async def calculate_storage_fee(
    db: AsyncSession,
    order: BusinessOrder
) -> Decimal:
    """
    计算订单的冷藏费
    
    Args:
        db: 数据库会话
        order: 业务订单
        
    Returns:
        计算出的冷藏费（元）
        
    日期规则：
    - 采购单：每吨15元（入库费）
    - 销售单：每吨15元（出库费） + 每吨每天1.5元（存储费）
      - 出库日期使用销售单的装货日期（loading_date）
      - 入库日期使用批次的received_at（来自采购单的卸货日期）
    """
    # 如果用户选择不计算冷藏费，直接返回0
    # 注意：calculate_storage_fee 默认为 True（计算），只有明确设为 False 才不计算
    # getattr 处理旧数据库中可能不存在该字段的情况
    calc_fee = getattr(order, 'calculate_storage_fee', True)
    if calc_fee is False:
        return Decimal("0.00")
    
    order_type = order.order_type
    
    # 获取来源和目标实体信息
    source_entity = order.source_entity
    target_entity = order.target_entity
    is_source_warehouse = source_entity and "warehouse" in source_entity.entity_type and "transit" not in source_entity.entity_type
    is_target_warehouse = target_entity and "warehouse" in target_entity.entity_type and "transit" not in target_entity.entity_type
    
    # 计算总重量（kg）
    total_weight_kg = sum(Decimal(str(item.quantity)) for item in order.items)
    weight_tons = total_weight_kg / Decimal("1000")
    
    # === 新架构：装货单(loading) ===
    if order_type == "loading":
        if is_source_warehouse:
            # 来源是仓库(B)：计算 出库费 + 存储费（类似旧的 sale）
            return await _calculate_outbound_storage_fee(db, order, weight_tons)
        else:
            # 来源是供应商(A)或客户(C)：不计算冷藏费
            return Decimal("0.00")
    
    # === 新架构：卸货单(unloading) ===
    if order_type == "unloading":
        if is_target_warehouse:
            # 目标是仓库(B)：只计算入库费
            storage_fee = weight_tons * BASE_RATE_PER_TON
            return storage_fee.quantize(Decimal("0.01"))
        else:
            # 目标是客户(C)或供应商(A)：不计算冷藏费
            return Decimal("0.00")
    
    # === 兼容旧类型 ===
    # 采购单：每吨 15 元（入库费）
    if order_type == "purchase":
        # 入库费 = 吨数 × 15元/吨
        storage_fee = weight_tons * BASE_RATE_PER_TON
        return storage_fee.quantize(Decimal("0.01"))
    
    # 销售单：15 + 每吨每天 1.5 元（兼容旧数据）
    if order_type == "sale":
        return await _calculate_outbound_storage_fee(db, order, weight_tons)
    
    # 其他类型订单：不收冷藏费
    return Decimal("0.00")


async def _calculate_outbound_storage_fee(
    db: AsyncSession,
    order: BusinessOrder,
    weight_tons: Decimal
) -> Decimal:
    """
    计算出库冷藏费（出库费 + 存储费）
    
    用于：
    - 新架构：装货单(loading) 来源是仓库(B)
    - 旧架构：销售单(sale)
    """
    # 出库日期 = order_date（业务日期）
    outbound_date = order.order_date
    if not outbound_date:
        # 兼容旧数据：尝试使用 loading_date
        outbound_date = order.loading_date or datetime.utcnow()
    
    total_weighted_days = Decimal("0")
    total_weight_kg = Decimal("0")
    
    for item in order.items:
        item_weight = Decimal(str(item.quantity))  # 商品数量（kg）
        
        # 查询该明细的批次分配记录
        result = await db.execute(
            select(OrderItemBatch)
            .options(selectinload(OrderItemBatch.batch))
            .where(OrderItemBatch.order_item_id == item.id)
        )
        batch_records = result.scalars().all()
        
        if batch_records:
            # 有批次记录，按批次计算
            for record in batch_records:
                batch = record.batch
                if batch and batch.received_at:
                    # 计算存储天数：出库日期 - 入库日期 + 1（入库当天算一天）
                    days = max(1, (outbound_date - batch.received_at).days + 1)
                    batch_weight = record.quantity
                    total_weighted_days += batch_weight * Decimal(str(days))
                    total_weight_kg += batch_weight
        else:
            # 没有批次记录，查找仓库中该商品最早的批次（FIFO原则）
            source_warehouse_id = order.source_id
            if source_warehouse_id:
                batch_result = await db.execute(
                    select(StockBatch)
                    .where(
                        StockBatch.storage_entity_id == source_warehouse_id,
                        StockBatch.product_id == item.product_id,
                        StockBatch.status == "active"
                    )
                    .order_by(StockBatch.received_at.asc())
                    .limit(1)
                )
                earliest_batch = batch_result.scalar_one_or_none()
                
                if earliest_batch and earliest_batch.received_at:
                    # 计算存储天数：出库日期 - 入库日期 + 1（入库当天算一天）
                    days = max(1, (outbound_date - earliest_batch.received_at).days + 1)
                    total_weighted_days += item_weight * Decimal(str(days))
                    total_weight_kg += item_weight
                else:
                    # 没有批次信息，默认7天
                    total_weighted_days += item_weight * Decimal("7")
                    total_weight_kg += item_weight
            else:
                # 没有仓库信息，默认7天
                total_weighted_days += item_weight * Decimal("7")
                total_weight_kg += item_weight
    
    if total_weight_kg > 0:
        # 计算加权平均存储天数
        avg_days = total_weighted_days / total_weight_kg
        # 计算冷藏费：出库费（每吨15元） + 存储费（每吨每天1.5元）
        base_fee = weight_tons * BASE_RATE_PER_TON
        storage_cost = weight_tons * avg_days * STORAGE_RATE_PER_TON_PER_DAY
        storage_fee = base_fee + storage_cost
        return storage_fee.quantize(Decimal("0.01"))
    else:
        return Decimal("0.00")


async def update_order_storage_fee(
    db: AsyncSession,
    order: BusinessOrder
) -> Decimal:
    """
    计算并更新订单的冷藏费
    
    Args:
        db: 数据库会话
        order: 业务订单
        
    Returns:
        计算出的冷藏费
    """
    storage_fee = await calculate_storage_fee(db, order)
    order.total_storage_fee = storage_fee
    return storage_fee


def calculate_storage_fee_preview(
    order_date: datetime,
    total_weight_kg: float,
    avg_storage_days: int = 7,
    order_type: str = "loading",
    is_source_warehouse: bool = True,
    is_target_warehouse: bool = False
) -> float:
    """
    前端预估冷藏费（无需数据库查询）
    
    用于前端在创建订单时显示预估值
    
    Args:
        order_date: 业务日期
        total_weight_kg: 总重量（kg）
        avg_storage_days: 预估平均存储天数（默认7天）
        order_type: 订单类型（loading/unloading/purchase/sale）
        is_source_warehouse: 来源是否是仓库
        is_target_warehouse: 目标是否是仓库
        
    Returns:
        预估冷藏费（元）
    """
    base_rate_per_ton = 15.0  # 进出库基础费率：每吨15元
    rate_per_ton_per_day = 1.5  # 存储费率：每吨每天1.5元
    weight_tons = total_weight_kg / 1000
    
    # 新架构：装货单
    if order_type == "loading":
        if is_source_warehouse:
            # 来源是仓库：出库费 + 存储费
            base_fee = weight_tons * base_rate_per_ton
            storage_cost = weight_tons * avg_storage_days * rate_per_ton_per_day
            return round(base_fee + storage_cost, 2)
        else:
            # 来源非仓库：不计算
            return 0.0
    
    # 新架构：卸货单
    if order_type == "unloading":
        if is_target_warehouse:
            # 目标是仓库：只计算入库费
            return round(weight_tons * base_rate_per_ton, 2)
        else:
            # 目标非仓库：不计算
            return 0.0
    
    # 兼容旧类型
    if order_type == "purchase":
        # 采购单：入库费 = 吨数 × 15
        storage_fee = weight_tons * base_rate_per_ton
    else:
        # 销售单：出库费 + 存储费 = 吨数 × 15 + 吨数 × 天数 × 1.5
        base_fee = weight_tons * base_rate_per_ton
        storage_cost = weight_tons * avg_storage_days * rate_per_ton_per_day
        storage_fee = base_fee + storage_cost
    
    return round(storage_fee, 2)

