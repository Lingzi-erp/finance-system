"""库存批次管理API"""

from typing import Any, Optional, List
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.stock_batch import StockBatch, OrderItemBatch
from app.models.v3.deduction_formula import DeductionFormula
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.schemas.v3.stock_batch import (
    StockBatchCreate, StockBatchUpdate, StockBatchAdjust,
    StockBatchResponse, StockBatchListResponse, StockBatchSimple,
    OrderItemBatchResponse,
    InitialBatchImport,
    BatchSummaryByProduct, BatchSummaryByStorage,
    BatchTraceRecord)

router = APIRouter()

async def generate_batch_no(db: AsyncSession) -> str:
    """生成批次号：PH + 日期 + 序号"""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"PH{today}"
    
    # 查询今天已有的批次数量
    result = await db.execute(
        select(func.count(StockBatch.id)).where(
            StockBatch.batch_no.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    
    return f"{prefix}-{count + 1:03d}"

def build_batch_response(batch: StockBatch) -> StockBatchResponse:
    """构建批次响应"""
    return StockBatchResponse(
        id=batch.id,
        batch_no=batch.batch_no,
        product_id=batch.product_id,
        storage_entity_id=batch.storage_entity_id,
        source_entity_id=batch.source_entity_id,
        source_order_id=batch.source_order_id,
        deduction_formula_id=batch.deduction_formula_id,
        
        # 毛重/净重
        gross_weight=batch.gross_weight,
        tare_weight=batch.tare_weight or Decimal("0"),
        current_gross_weight=batch.current_gross_weight,
        
        # 扣重公式信息
        deduction_formula_name=batch.deduction_formula.name if batch.deduction_formula else "",
        deduction_formula_display=batch.deduction_formula.formula_display if batch.deduction_formula else "",
        
        # 数量（净重）
        initial_quantity=batch.initial_quantity,
        current_quantity=batch.current_quantity,
        reserved_quantity=batch.reserved_quantity or Decimal("0"),
        available_quantity=batch.available_quantity,
        
        # 成本（按净重）
        cost_price=batch.cost_price,
        cost_amount=batch.cost_amount,
        
        # 运费（按毛重）
        freight_cost=batch.freight_cost or Decimal("0"),
        freight_rate=batch.freight_rate,
        
        # 仓储费（按毛重）
        storage_start_date=batch.storage_start_date,
        storage_rate=batch.storage_rate or Decimal("0"),
        storage_fee_paid=batch.storage_fee_paid or Decimal("0"),
        storage_days=batch.storage_days,
        accumulated_storage_fee=batch.accumulated_storage_fee,
        
        # 其他费用
        extra_cost=batch.extra_cost or Decimal("0"),
        extra_cost_notes=batch.extra_cost_notes,
        
        # 计算字段
        total_cost=batch.total_cost,
        real_cost_price=batch.real_cost_price,
        
        # 状态
        status=batch.status,
        status_display=batch.status_display,
        is_depleted=batch.is_depleted,
        is_initial=batch.is_initial,
        
        # 日期
        received_at=batch.received_at,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        
        # 关联信息
        product_name=batch.product.name if batch.product else "",
        product_code=batch.product.code if batch.product else "",
        product_unit=batch.product.unit if batch.product else "",
        storage_entity_name=batch.storage_entity.name if batch.storage_entity else "",
        storage_entity_code=batch.storage_entity.code if batch.storage_entity else "",
        source_entity_name=batch.source_entity.name if batch.source_entity else "",
        source_entity_code=batch.source_entity.code if batch.source_entity else "",
        source_order_no=batch.source_order.order_no if batch.source_order else "",
        creator_name=batch.creator.username if batch.creator else "",
        
        notes=batch.notes)

@router.get("/", response_model=StockBatchListResponse)
async def list_batches(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    product_id: Optional[int] = Query(None, description="商品ID"),
    storage_entity_id: Optional[int] = Query(None, description="存放仓库ID"),
    source_entity_id: Optional[int] = Query(None, description="来源供应商ID"),
    status: Optional[str] = Query(None, description="状态：active/depleted"),
    include_depleted: bool = Query(False, description="是否包含已清空的批次"),
    search: Optional[str] = Query(None, description="搜索批次号/商品名")) -> Any:
    """获取批次列表"""
    query = select(StockBatch).options(
        selectinload(StockBatch.product),
        selectinload(StockBatch.storage_entity),
        selectinload(StockBatch.source_entity),
        selectinload(StockBatch.source_order),
        selectinload(StockBatch.deduction_formula),
        selectinload(StockBatch.creator))
    
    conditions = []
    
    # 默认不显示已清空的批次
    if not include_depleted:
        conditions.append(StockBatch.status == "active")
    elif status:
        conditions.append(StockBatch.status == status)
    
    if product_id:
        conditions.append(StockBatch.product_id == product_id)
    if storage_entity_id:
        conditions.append(StockBatch.storage_entity_id == storage_entity_id)
    if source_entity_id:
        conditions.append(StockBatch.source_entity_id == source_entity_id)
    
    # 搜索
    if search:
        query = query.join(Product, StockBatch.product_id == Product.id)
        conditions.append(
            or_(
                StockBatch.batch_no.ilike(f"%{search}%"),
                Product.name.ilike(f"%{search}%"),
                Product.code.ilike(f"%{search}%"))
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    query = query.order_by(StockBatch.received_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    batches = result.scalars().unique().all()
    
    return StockBatchListResponse(
        data=[build_batch_response(b) for b in batches],
        total=total,
        page=page,
        limit=limit)

@router.get("/available", response_model=List[StockBatchSimple])
async def list_available_batches(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int = Query(..., description="商品ID"),
    storage_entity_id: Optional[int] = Query(None, description="存放仓库ID（可选）")) -> Any:
    """获取可用批次列表（用于销售时选择）"""
    query = select(StockBatch).options(
        selectinload(StockBatch.product),
        selectinload(StockBatch.storage_entity)).where(
        and_(
            StockBatch.product_id == product_id,
            StockBatch.status == "active",
            StockBatch.current_quantity > StockBatch.reserved_quantity)
    )
    
    if storage_entity_id:
        query = query.where(StockBatch.storage_entity_id == storage_entity_id)
    
    query = query.order_by(StockBatch.received_at.asc())  # 先进先出
    
    result = await db.execute(query)
    batches = result.scalars().all()
    
    return [
        StockBatchSimple(
            id=b.id,
            batch_no=b.batch_no,
            product_id=b.product_id,
            product_name=b.product.name if b.product else "",
            storage_entity_name=b.storage_entity.name if b.storage_entity else "",
            gross_weight=b.gross_weight,
            current_quantity=b.current_quantity,
            available_quantity=b.available_quantity,
            cost_price=b.cost_price,
            real_cost_price=b.real_cost_price,
            storage_days=b.storage_days,
            received_at=b.received_at,
            notes=b.notes)
        for b in batches
    ]

@router.get("/{batch_id}", response_model=StockBatchResponse)
async def get_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_id: int) -> Any:
    """获取批次详情"""
    result = await db.execute(
        select(StockBatch).options(
            selectinload(StockBatch.product),
            selectinload(StockBatch.storage_entity),
            selectinload(StockBatch.source_entity),
            selectinload(StockBatch.source_order),
            selectinload(StockBatch.deduction_formula),
            selectinload(StockBatch.creator)).where(StockBatch.id == batch_id)
    )
    batch = result.scalar_one_or_none()
    
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    
    return build_batch_response(batch)

@router.post("/", response_model=StockBatchResponse)
async def create_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_in: StockBatchCreate) -> Any:
    """创建批次（手动创建或期初导入）
    
    支持两种方式指定净重：
    1. 直接传入 initial_quantity（净重）
    2. 传入 gross_weight + deduction_formula_id，系统自动计算净重
    """
    # 验证商品
    product = await db.get(Product, batch_in.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    # 验证存放仓库
    storage = await db.get(Entity, batch_in.storage_entity_id)
    if not storage or "warehouse" not in storage.entity_type:
        raise HTTPException(status_code=404, detail="存放仓库不存在或类型不正确")
    
    # 验证来源供应商（可选）
    if batch_in.source_entity_id:
        source = await db.get(Entity, batch_in.source_entity_id)
        if not source:
            raise HTTPException(status_code=404, detail="来源供应商不存在")
    
    # 处理扣重公式：如果指定了公式且有毛重，自动计算净重
    deduction_formula = None
    net_weight = batch_in.initial_quantity
    tare_weight = batch_in.tare_weight
    
    if batch_in.deduction_formula_id and batch_in.gross_weight:
        deduction_formula = await db.get(DeductionFormula, batch_in.deduction_formula_id)
        if not deduction_formula:
            raise HTTPException(status_code=404, detail="扣重公式不存在")
        # 使用公式计算净重
        net_weight = deduction_formula.calculate_net_weight(batch_in.gross_weight)
        tare_weight = batch_in.gross_weight - net_weight
    
    # 生成批次号
    batch_no = await generate_batch_no(db)
    
    # 创建批次
    batch = StockBatch(
        batch_no=batch_no,
        product_id=batch_in.product_id,
        storage_entity_id=batch_in.storage_entity_id,
        source_entity_id=batch_in.source_entity_id,
        source_order_id=batch_in.source_order_id,
        deduction_formula_id=batch_in.deduction_formula_id,
        # 毛重/净重
        gross_weight=batch_in.gross_weight,
        tare_weight=tare_weight,
        initial_quantity=net_weight,
        current_quantity=net_weight,
        current_gross_weight=batch_in.gross_weight,  # 初始时当前毛重=初始毛重
        # 成本（按净重计算）
        cost_price=batch_in.cost_price,
        cost_amount=batch_in.cost_price * net_weight,
        # 运费
        freight_cost=batch_in.freight_cost,
        freight_rate=batch_in.freight_rate,
        # 仓储费
        storage_start_date=batch_in.storage_start_date or datetime.utcnow(),
        storage_rate=batch_in.storage_rate,
        # 其他
        extra_cost=batch_in.extra_cost,
        extra_cost_notes=batch_in.extra_cost_notes,
        is_initial=batch_in.is_initial,
        received_at=batch_in.received_at or datetime.utcnow(),
        notes=batch_in.notes,
        created_by=1)
    db.add(batch)
    await db.commit()
    
    # 重新加载关联
    result = await db.execute(
        select(StockBatch).options(
            selectinload(StockBatch.product),
            selectinload(StockBatch.storage_entity),
            selectinload(StockBatch.source_entity),
            selectinload(StockBatch.source_order),
            selectinload(StockBatch.deduction_formula),
            selectinload(StockBatch.creator)).where(StockBatch.id == batch.id)
    )
    batch = result.scalar_one()
    
    return build_batch_response(batch)

@router.put("/{batch_id}", response_model=StockBatchResponse)
async def update_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_id: int,
    batch_in: StockBatchUpdate) -> Any:
    """更新批次（仓储费率、备注等）"""
    batch = await db.get(StockBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    
    update_data = batch_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(batch, field, value)
    
    await db.commit()
    
    # 重新加载关联
    result = await db.execute(
        select(StockBatch).options(
            selectinload(StockBatch.product),
            selectinload(StockBatch.storage_entity),
            selectinload(StockBatch.source_entity),
            selectinload(StockBatch.source_order),
            selectinload(StockBatch.deduction_formula),
            selectinload(StockBatch.creator)).where(StockBatch.id == batch_id)
    )
    batch = result.scalar_one()
    
    return build_batch_response(batch)

@router.post("/{batch_id}/adjust", response_model=StockBatchResponse)
async def adjust_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_id: int,
    adjust_in: StockBatchAdjust) -> Any:
    """调整批次数量（盘点）"""
    batch = await db.get(StockBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    
    old_quantity = batch.current_quantity
    new_quantity = adjust_in.new_quantity
    
    if old_quantity == new_quantity:
        raise HTTPException(status_code=400, detail="数量未发生变化")
    
    batch.current_quantity = new_quantity
    batch.update_status()
    
    # 记录调整（可以扩展为流水记录）
    if batch.notes:
        batch.notes += f"\n[{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}] 盘点调整: {old_quantity} → {new_quantity}，原因：{adjust_in.reason}"
    else:
        batch.notes = f"[{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}] 盘点调整: {old_quantity} → {new_quantity}，原因：{adjust_in.reason}"
    
    await db.commit()
    
    # 重新加载关联
    result = await db.execute(
        select(StockBatch).options(
            selectinload(StockBatch.product),
            selectinload(StockBatch.storage_entity),
            selectinload(StockBatch.source_entity),
            selectinload(StockBatch.source_order),
            selectinload(StockBatch.deduction_formula),
            selectinload(StockBatch.creator)).where(StockBatch.id == batch_id)
    )
    batch = result.scalar_one()
    
    return build_batch_response(batch)

@router.post("/initial-import")
async def import_initial_batches(
    *,
    db: AsyncSession = Depends(get_db),
    import_data: InitialBatchImport) -> Any:
    """批量导入期初批次"""
    created_batches = []
    errors = []
    
    as_of_date = import_data.as_of_date or datetime.utcnow()
    
    for idx, item in enumerate(import_data.items):
        try:
            # 验证商品
            product = await db.get(Product, item.product_id)
            if not product:
                errors.append({"index": idx, "error": f"商品ID {item.product_id} 不存在"})
                continue
            
            # 验证存放仓库
            storage = await db.get(Entity, item.storage_entity_id)
            if not storage or "warehouse" not in storage.entity_type:
                errors.append({"index": idx, "error": f"仓库ID {item.storage_entity_id} 不存在或类型不正确"})
                continue
            
            # 生成批次号
            batch_no = await generate_batch_no(db)
            
            # 创建批次
            batch = StockBatch(
                batch_no=batch_no,
                product_id=item.product_id,
                storage_entity_id=item.storage_entity_id,
                gross_weight=item.gross_weight,
                tare_weight=item.tare_weight,
                initial_quantity=item.quantity,
                current_quantity=item.quantity,
                current_gross_weight=item.gross_weight,
                cost_price=item.cost_price,
                cost_amount=item.cost_price * item.quantity,
                freight_cost=item.freight_cost,
                storage_start_date=as_of_date,
                storage_rate=item.storage_rate,
                is_initial=True,
                received_at=as_of_date,
                notes=item.notes or "期初导入",
                created_by=1)
            db.add(batch)
            created_batches.append({
                "batch_no": batch_no,
                "product_id": item.product_id,
                "quantity": float(item.quantity),
            })
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})
    
    await db.commit()
    
    return {
        "message": f"成功导入 {len(created_batches)} 个批次",
        "created": created_batches,
        "errors": errors,
    }

@router.get("/{batch_id}/outbound-records", response_model=List[OrderItemBatchResponse])
async def get_batch_outbound_records(
    *,
    db: AsyncSession = Depends(get_db),
    batch_id: int) -> Any:
    """获取批次的出货记录（出库去向追溯）"""
    batch = await db.get(StockBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    
    result = await db.execute(
        select(OrderItemBatch).options(
            selectinload(OrderItemBatch.order_item).selectinload(OrderItem.order).selectinload(BusinessOrder.target_entity),
            selectinload(OrderItemBatch.batch).selectinload(StockBatch.storage_entity),
            selectinload(OrderItemBatch.batch).selectinload(StockBatch.source_entity)
        ).where(OrderItemBatch.batch_id == batch_id).order_by(OrderItemBatch.created_at.desc())
    )
    records = result.scalars().all()
    
    order_type_map = {
        "sale": "销售",
        "return_out": "退供应商",
        "transfer": "调拨",
    }
    
    def calc_profit(r):
        """
        计算利润 = 销售金额 - 批次成本 - 分摊运费 - 分摊冷藏费
        运费和冷藏费两头都是支出：
        - 采购端支付的已计入批次成本（cost_amount）
        - 销售端支付的按比例分摊
        """
        if not r.order_item or not r.order_item.unit_price or not r.cost_amount:
            return None
        
        order = r.order_item.order
        if not order:
            return None
        
        # 该批次出库对应的销售金额
        sale_amount = r.order_item.unit_price * r.quantity
        # 该批次的成本（已含采购运费和冷藏费）
        cost = r.cost_amount
        
        # 按该明细金额占订单总金额的比例分摊销售端的运费和冷藏费
        order_total = order.total_amount or Decimal("1")
        item_ratio = (r.order_item.amount or Decimal("0")) / order_total if order_total > 0 else Decimal("0")
        qty_ratio = r.quantity / r.order_item.quantity if r.order_item.quantity else Decimal("0")
        
        shipping_share = (order.total_shipping or Decimal("0")) * item_ratio * qty_ratio
        storage_fee_share = (order.total_storage_fee or Decimal("0")) * item_ratio * qty_ratio
        
        return sale_amount - cost - shipping_share - storage_fee_share
    
    return [
        OrderItemBatchResponse(
            id=r.id,
            order_item_id=r.order_item_id,
            batch_id=r.batch_id,
            batch_no=r.batch.batch_no if r.batch else "",
            quantity=r.quantity,
            cost_price=r.cost_price,
            cost_amount=r.cost_amount,
            created_at=r.created_at,
            # 销售单信息
            order_id=r.order_item.order.id if r.order_item and r.order_item.order else None,
            order_no=r.order_item.order.order_no if r.order_item and r.order_item.order else "",
            order_type=r.order_item.order.order_type if r.order_item and r.order_item.order else "",
            order_type_display=order_type_map.get(r.order_item.order.order_type, "") if r.order_item and r.order_item.order else "",
            order_date=r.order_item.order.order_date if r.order_item and r.order_item.order else None,
            # 客户信息（销售单的目标是客户）
            customer_id=r.order_item.order.target_id if r.order_item and r.order_item.order else None,
            customer_name=r.order_item.order.target_entity.name if r.order_item and r.order_item.order and r.order_item.order.target_entity else "",
            # 销售金额和利润
            sale_price=r.order_item.unit_price if r.order_item else None,
            sale_amount=r.order_item.unit_price * r.quantity if r.order_item and r.order_item.unit_price else None,
            profit=calc_profit(r),
            # 批次信息
            storage_entity_name=r.batch.storage_entity.name if r.batch and r.batch.storage_entity else "",
            source_entity_name=r.batch.source_entity.name if r.batch and r.batch.source_entity else ""
        )
        for r in records
    ]

# ===== 统计汇总 =====

@router.get("/summary/by-product", response_model=List[BatchSummaryByProduct])
async def get_batch_summary_by_product(
    *,
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(True, description="仅统计有库存的批次")) -> Any:
    """按商品汇总批次"""
    conditions = []
    if active_only:
        conditions.append(StockBatch.status == "active")
    
    query = (
        select(
            StockBatch.product_id,
            Product.name,
            Product.code,
            Product.unit,
            func.count(StockBatch.id).label("batch_count"),
            func.sum(StockBatch.current_quantity).label("total_quantity"),
            func.sum(StockBatch.current_quantity - StockBatch.reserved_quantity).label("total_available"),
            func.avg(StockBatch.cost_price).label("avg_cost_price"),
            func.sum(StockBatch.cost_amount).label("total_cost"))
        .join(Product, StockBatch.product_id == Product.id)
        .group_by(StockBatch.product_id, Product.name, Product.code, Product.unit)
    )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(func.sum(StockBatch.current_quantity).desc())
    
    result = await db.execute(query)
    
    return [
        BatchSummaryByProduct(
            product_id=row[0],
            product_name=row[1],
            product_code=row[2],
            product_unit=row[3],
            batch_count=row[4],
            total_quantity=row[5] or Decimal("0"),
            total_available=row[6] or Decimal("0"),
            avg_cost_price=row[7] or Decimal("0"),
            total_cost=row[8] or Decimal("0"))
        for row in result
    ]

@router.get("/summary/by-storage", response_model=List[BatchSummaryByStorage])
async def get_batch_summary_by_storage(
    *,
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(True, description="仅统计有库存的批次")) -> Any:
    """按存放位置汇总批次"""
    conditions = []
    if active_only:
        conditions.append(StockBatch.status == "active")
    
    query = (
        select(
            StockBatch.storage_entity_id,
            Entity.name,
            Entity.code,
            func.count(StockBatch.id).label("batch_count"),
            func.sum(StockBatch.current_quantity).label("total_quantity"),
            func.sum(StockBatch.storage_fee_paid).label("total_storage_fee"))
        .join(Entity, StockBatch.storage_entity_id == Entity.id)
        .group_by(StockBatch.storage_entity_id, Entity.name, Entity.code)
    )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(func.count(StockBatch.id).desc())
    
    result = await db.execute(query)
    
    return [
        BatchSummaryByStorage(
            storage_entity_id=row[0],
            storage_entity_name=row[1],
            storage_entity_code=row[2],
            batch_count=row[3],
            total_quantity=row[4] or Decimal("0"),
            total_storage_fee=row[5] or Decimal("0"))
        for row in result
    ]

# ===== 批次服务函数（供业务单调用）=====

async def create_batch_from_purchase(
    db: AsyncSession,
    order: BusinessOrder,
    item: OrderItem,
    operator_id: int,
    gross_weight: Decimal = None,
    tare_weight: Decimal = None,
    freight_cost: Decimal = None,
    storage_rate: Decimal = None) -> StockBatch:
    """
    从采购单创建批次
    
    采购订单完成时，每个订单明细都会创建一个批次用于追溯。
    
    数量逻辑：
    - initial_quantity / current_quantity 使用订单中的数量（用户确认的入库数量）
    - gross_weight 毛重是可选的，用于仓储费计算
    - 如果没有毛重，则毛重=净重=订单数量
    
    Args:
        db: 数据库会话
        order: 采购单
        item: 采购明细
        operator_id: 操作人ID
        gross_weight: 毛重（可选）
        tare_weight: 皮重（可选）
        freight_cost: 运费（可选）
        storage_rate: 仓储费率（可选）
    """
    batch_no = await generate_batch_no(db)
    
    # 入库数量使用订单明细的数量（用户已确认）
    net_weight = Decimal(str(item.quantity))
    
    # 如果没有毛重，默认毛重=净重
    if gross_weight is None:
        gross_weight = net_weight
        tare_weight = Decimal("0")
    
    batch = StockBatch(
        batch_no=batch_no,
        product_id=item.product_id,
        storage_entity_id=order.target_id,  # 目标仓库/冷库
        source_entity_id=order.source_id,   # 来源供应商/冷库
        source_order_id=order.id,
        deduction_formula_id=item.deduction_formula_id,  # 记录使用的扣重公式
        # 毛重/净重
        gross_weight=gross_weight,
        tare_weight=tare_weight or Decimal("0"),
        initial_quantity=net_weight,
        current_quantity=net_weight,
        current_gross_weight=gross_weight,
        # 成本
        cost_price=item.unit_price,
        cost_amount=item.amount,
        # 运费/仓储费
        freight_cost=freight_cost or Decimal("0"),
        storage_rate=storage_rate or Decimal("0"),
        # 使用卸货日期作为入库日期和仓储起算日期（业务日期）
        storage_start_date=order.unloading_date or datetime.utcnow(),
        received_at=order.unloading_date or datetime.utcnow(),
        notes=f"采购入库 - {order.order_no}",
        created_by=operator_id)
    db.add(batch)
    await db.flush()
    
    return batch

async def allocate_batches_for_sale(
    db: AsyncSession,
    order_item: OrderItem,
    allocations: List[dict],  # [{"batch_id": 1, "quantity": 10}, ...]
) -> List[OrderItemBatch]:
    """
    为销售明细分配批次
    
    Args:
        db: 数据库会话
        order_item: 销售明细
        allocations: 批次分配列表
    
    Returns:
        创建的批次关联记录列表
    """
    records = []
    total_cost = Decimal("0")
    
    for alloc in allocations:
        batch = await db.get(StockBatch, alloc["batch_id"])
        if not batch:
            raise HTTPException(status_code=404, detail=f"批次 {alloc['batch_id']} 不存在")
        
        quantity = Decimal(str(alloc["quantity"]))
        
        if batch.available_quantity < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"批次 {batch.batch_no} 可用数量不足：可用 {batch.available_quantity}，需要 {quantity}"
            )
        
        # 使用真实成本价（含仓储费）
        cost_price = batch.real_cost_price
        cost_amount = cost_price * quantity
        
        # 创建关联记录
        record = OrderItemBatch(
            order_item_id=order_item.id,
            batch_id=batch.id,
            quantity=quantity,
            cost_price=cost_price,
            cost_amount=cost_amount)
        db.add(record)
        records.append(record)
        
        # 减少批次数量
        batch.current_quantity -= quantity
        batch.update_status()
        
        total_cost += cost_amount
    
    # 更新订单明细的成本信息
    if records:
        order_item.cost_amount = total_cost
        order_item.cost_price = total_cost / order_item.quantity if order_item.quantity else Decimal("0")
        order_item.profit = order_item.amount - total_cost
    
    await db.flush()
    
    return records

@router.post("/sync-from-orders")
async def sync_batches_from_orders(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    从已完成的采购订单同步生成批次
    
    扫描所有已完成的采购订单，找出没有关联批次的明细，自动生成批次
    """
    from sqlalchemy.orm import selectinload
    
    # 查找已完成的采购订单，且有明细没有batch_id的
    query = (
        select(BusinessOrder)
        .options(
            selectinload(BusinessOrder.items).selectinload(OrderItem.product),
            selectinload(BusinessOrder.source_entity),
            selectinload(BusinessOrder.target_entity))
        .where(
            and_(
                BusinessOrder.order_type == "purchase",
                BusinessOrder.status == "completed")
        )
    )
    
    result = await db.execute(query)
    orders = result.scalars().unique().all()
    
    created_batches = []
    skipped_items = []
    
    for order in orders:
        for item in order.items:
            # 跳过已有批次的明细
            if item.batch_id:
                continue
            
            # 创建批次
            batch_no = await generate_batch_no(db)
            
            net_weight = Decimal(str(item.quantity))
            gross_weight = item.gross_weight or net_weight
            tare_weight = Decimal("0")
            
            # 如果有毛重和扣重公式，计算皮重
            if item.gross_weight and item.deduction_formula_id:
                deduction_formula = await db.get(DeductionFormula, item.deduction_formula_id)
                if deduction_formula:
                    calculated_net = deduction_formula.calculate_net_weight(item.gross_weight)
                    tare_weight = item.gross_weight - calculated_net
            
            batch = StockBatch(
                batch_no=batch_no,
                product_id=item.product_id,
                storage_entity_id=order.target_id,
                source_entity_id=order.source_id,
                source_order_id=order.id,
                deduction_formula_id=item.deduction_formula_id,
                gross_weight=gross_weight,
                tare_weight=tare_weight,
                initial_quantity=net_weight,
                current_quantity=net_weight,
                current_gross_weight=gross_weight,
                cost_price=item.unit_price,
                cost_amount=item.amount,
                freight_cost=item.shipping_cost or Decimal("0"),
                storage_rate=item.storage_rate or Decimal("0"),
                storage_start_date=order.completed_at or order.created_at,
                received_at=order.completed_at or order.created_at,
                notes=f"补充生成 - 采购入库 {order.order_no}",
                created_by=1)
            db.add(batch)
            await db.flush()
            
            # 更新订单明细的批次ID
            item.batch_id = batch.id
            
            created_batches.append({
                "batch_no": batch_no,
                "order_no": order.order_no,
                "product_name": item.product.name if item.product else str(item.product_id),
                "quantity": float(net_weight),
            })
    
    await db.commit()
    
    return {
        "message": f"成功从历史订单生成 {len(created_batches)} 个批次",
        "created_count": len(created_batches),
        "created_batches": created_batches,
    }

async def return_to_batch(
    db: AsyncSession,
    batch_id: int,
    quantity: Decimal,
    reason: str = None) -> StockBatch:
    """
    退货回批次
    
    Args:
        db: 数据库会话
        batch_id: 批次ID
        quantity: 退货数量
        reason: 原因
    """
    batch = await db.get(StockBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    
    batch.current_quantity += quantity
    
    # 如果之前是已清空，恢复为活跃
    if batch.status == "depleted":
        batch.status = "active"
    
    # 记录退货
    if batch.notes:
        batch.notes += f"\n[{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}] 退货入库: +{quantity}，原因：{reason or '退货'}"
    else:
        batch.notes = f"[{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}] 退货入库: +{quantity}，原因：{reason or '退货'}"
    
    await db.flush()
    
    return batch

