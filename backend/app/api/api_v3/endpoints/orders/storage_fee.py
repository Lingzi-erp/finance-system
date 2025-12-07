"""
冷藏费自动计算模块

规则：
- 采购单：每吨 15 元（入库费）
- 销售单：每吨 15 元（出库费） + 每吨每天 1.5 元（存储费）
  - 存储天数 = 销售单装货日期 - 批次入库日期（采购单卸货日期） + 1
  - 入库当天也算一天冷藏费
  
注意：所有日期计算都基于用户输入的业务日期（装货/卸货日期），而非系统时间戳
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
    
    # 采购单：每吨 15 元（入库费）
    if order_type == "purchase":
        # 计算总重量（kg）
        total_weight_kg = sum(Decimal(str(item.quantity)) for item in order.items)
        # 转换为吨
        weight_tons = total_weight_kg / Decimal("1000")
        # 入库费 = 吨数 × 15元/吨
        storage_fee = weight_tons * BASE_RATE_PER_TON
        return storage_fee.quantize(Decimal("0.01"))
    
    # 销售单：15 + 每吨每天 1.5 元
    if order_type == "sale":
        # 出库日期 = 销售单的装货日期
        outbound_date = order.loading_date
        if not outbound_date:
            # 如果没有装货日期，使用当前时间
            outbound_date = datetime.utcnow()
        
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
            # 转换为吨
            weight_tons = total_weight_kg / Decimal("1000")
            # 计算冷藏费：出库费（每吨15元） + 存储费（每吨每天1.5元）
            base_fee = weight_tons * BASE_RATE_PER_TON
            storage_cost = weight_tons * avg_days * STORAGE_RATE_PER_TON_PER_DAY
            storage_fee = base_fee + storage_cost
            return storage_fee.quantize(Decimal("0.01"))
        else:
            return Decimal("0.00")
    
    # 其他类型订单：不收冷藏费
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
    loading_date: datetime,
    total_weight_kg: float,
    avg_storage_days: int = 7,
    order_type: str = "sale"
) -> float:
    """
    前端预估冷藏费（无需数据库查询）
    
    用于前端在创建订单时显示预估值
    
    Args:
        loading_date: 装货日期
        total_weight_kg: 总重量（kg）
        avg_storage_days: 预估平均存储天数（默认7天）
        order_type: 订单类型（purchase/sale）
        
    Returns:
        预估冷藏费（元）
    """
    base_rate_per_ton = 15.0  # 进出库基础费率：每吨15元
    rate_per_ton_per_day = 1.5  # 存储费率：每吨每天1.5元
    weight_tons = total_weight_kg / 1000
    
    if order_type == "purchase":
        # 采购单：入库费 = 吨数 × 15
        storage_fee = weight_tons * base_rate_per_ton
    else:
        # 销售单：出库费 + 存储费 = 吨数 × 15 + 吨数 × 天数 × 1.5
        base_fee = weight_tons * base_rate_per_ton
        storage_cost = weight_tons * avg_storage_days * rate_per_ton_per_day
        storage_fee = base_fee + storage_cost
    
    return round(storage_fee, 2)

