"""库存管理API"""

import asyncio
from typing import Any, Optional, List, Dict, Tuple
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, case, literal, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.stock import Stock, StockFlow
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.unit import CompositeUnit, Unit
from app.schemas.v3.stock import (
    StockResponse, StockListResponse, StockUpdate, StockAdjust,
    StockFlowResponse, StockFlowListResponse,
    WarehouseStock, ProductStock
)

router = APIRouter()

def build_stock_response(stock: Stock) -> StockResponse:
    """构建库存响应"""
    import re
    
    # 获取复式单位信息
    composite_unit_id = None
    composite_unit_name = None
    container_name = None
    unit_quantity = None
    base_unit_symbol = None
    
    # 优先从 composite_unit 关系获取（兼容旧数据）
    if stock.product and stock.product.composite_unit:
        cu = stock.product.composite_unit
        composite_unit_id = cu.id
        composite_unit_name = cu.display_name  # 如：件(15.0kg)
        container_name = cu.container_name  # 如：件
        unit_quantity = cu.quantity  # 如：15.0
        base_unit_symbol = cu.unit.symbol if cu.unit else None  # 如：kg
    # 如果没有 composite_unit 关系，尝试从 product.unit 字段解析
    elif stock.product and stock.product.unit:
        unit_str = stock.product.unit
        # 解析格式如 "箱(20kg)" 或 "件(15kg)"
        match = re.match(r'^(.+?)\((\d+(?:\.\d+)?)(kg|g|斤|L|ml|个)\)$', unit_str)
        if match:
            container_name = match.group(1)  # 如：箱
            unit_quantity = float(match.group(2))  # 如：20
            base_unit_symbol = match.group(3)  # 如：kg
            composite_unit_name = unit_str  # 如：箱(20kg)
    
    return StockResponse(
        id=stock.id,
        warehouse_id=stock.warehouse_id,
        product_id=stock.product_id,
        quantity=stock.quantity,
        reserved_quantity=stock.reserved_quantity,
        available_quantity=stock.available_quantity,
        safety_stock=stock.safety_stock,
        is_low_stock=stock.is_low_stock,
        last_check_at=stock.last_check_at,
        created_at=stock.created_at,
        updated_at=stock.updated_at,
        warehouse_name=stock.warehouse.name if stock.warehouse else "",
        warehouse_code=stock.warehouse.code if stock.warehouse else "",
        product_name=stock.product.name if stock.product else "",
        product_code=stock.product.code if stock.product else "",
        product_specification=(stock.product.specification or "") if stock.product else "",
        product_category=(stock.product.category or "") if stock.product else "",
        product_unit=stock.product.unit if stock.product else "",
        # 规格信息
        spec_id=stock.spec_id,
        spec_name=stock.spec_name or "",
        # 复式单位
        composite_unit_id=composite_unit_id,
        composite_unit_name=composite_unit_name,
        container_name=container_name,
        unit_quantity=unit_quantity,
        base_unit_symbol=base_unit_symbol)

def build_flow_response(flow: StockFlow, reverted_flow_ids: set = None) -> StockFlowResponse:
    """构建库存流水响应
    
    Args:
        flow: 流水记录
        reverted_flow_ids: 已被撤销的调整ID集合（可选）
    """
    # 判断是否可撤销：
    # 1. 必须是手动调整（flow_type == 'adjust'）
    # 2. 没有关联业务单（order_id is None）
    # 3. 不是重算产生的调整（reason不以"库存重算调整"开头）
    # 4. 不是撤销操作本身
    # 5. 没有被撤销过
    can_revert = (
        flow.flow_type == "adjust"
        and flow.order_id is None
        and flow.reason
        and not flow.reason.startswith("库存重算调整")
        and not flow.reason.startswith("撤销调整")  # 已经是撤销操作的不能再撤销
        and (reverted_flow_ids is None or flow.id not in reverted_flow_ids)  # 没有被撤销过
    )
    
    return StockFlowResponse(
        id=flow.id,
        stock_id=flow.stock_id,
        order_id=flow.order_id,
        order_item_id=flow.order_item_id,
        flow_type=flow.flow_type,
        quantity_change=flow.quantity_change,
        quantity_before=flow.quantity_before,
        quantity_after=flow.quantity_after,
        reason=flow.reason,
        type_display=flow.type_display,
        operator_id=flow.operator_id,
        operator_name=flow.operator.username if flow.operator else "",
        operated_at=flow.operated_at,
        created_at=flow.created_at,
        warehouse_name=flow.stock.warehouse.name if flow.stock and flow.stock.warehouse else "",
        product_name=flow.stock.product.name if flow.stock and flow.stock.product else "",
        product_specification=(flow.stock.product.specification or "") if flow.stock and flow.stock.product else "",
        order_no=flow.order.order_no if flow.order else None,
        can_revert=can_revert)

@router.get("/", response_model=StockListResponse)
async def list_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    low_stock_only: bool = Query(False, description="仅显示低库存"),
    include_zero: bool = Query(False, description="是否包含库存为0的记录"),
    search: Optional[str] = Query(None, description="搜索商品名称/编码")) -> Any:
    """获取库存列表"""
    # 如果有搜索条件，需要join Product表
    if search:
        query = (
            select(Stock)
            .join(Product, Stock.product_id == Product.id)
            .options(
                selectinload(Stock.warehouse),
                selectinload(Stock.product).selectinload(Product.composite_unit).selectinload(CompositeUnit.unit))
        )
    else:
        query = select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product).selectinload(Product.composite_unit).selectinload(CompositeUnit.unit))
    
    conditions = []
    
    # 默认不显示库存为0的记录
    if not include_zero:
        conditions.append(Stock.quantity > 0)
    
    if warehouse_id:
        conditions.append(Stock.warehouse_id == warehouse_id)
    if product_id:
        conditions.append(Stock.product_id == product_id)
    if low_stock_only:
        conditions.append(Stock.quantity < Stock.safety_stock)
    
    # 搜索条件
    if search:
        conditions.append(
            (Product.name.ilike(f"%{search}%")) | (Product.code.ilike(f"%{search}%"))
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count()).select_from(
        query.subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    query = query.order_by(Stock.updated_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    stocks = result.scalars().unique().all()
    
    return StockListResponse(
        data=[build_stock_response(s) for s in stocks],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/warehouse/{warehouse_id}", response_model=List[WarehouseStock])
async def get_warehouse_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    warehouse_id: int,
    available_only: bool = Query(False, description="仅显示有可用库存的商品")) -> Any:
    """获取指定仓库的所有库存"""
    # 验证仓库
    warehouse = await db.get(Entity, warehouse_id)
    if not warehouse or "warehouse" not in warehouse.entity_type:
        raise HTTPException(status_code=404, detail="仓库不存在")
    
    query = select(Stock).options(
        selectinload(Stock.warehouse),
        selectinload(Stock.product)).where(Stock.warehouse_id == warehouse_id)
    
    if available_only:
        query = query.where(Stock.quantity > Stock.reserved_quantity)
    
    result = await db.execute(query)
    stocks = result.scalars().all()
    
    return [
        WarehouseStock(
            warehouse_id=s.warehouse_id,
            warehouse_name=s.warehouse.name,
            warehouse_code=s.warehouse.code,
            product_id=s.product_id,
            product_name=s.product.name,
            product_code=s.product.code,
            product_unit=s.product.unit,
            quantity=s.quantity,
            reserved_quantity=s.reserved_quantity,
            available_quantity=s.available_quantity)
        for s in stocks
    ]

@router.get("/product/{product_id}", response_model=ProductStock)
async def get_product_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int) -> Any:
    """获取指定商品在所有仓库的库存"""
    # 验证商品
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    query = select(Stock).options(
        selectinload(Stock.warehouse),
        selectinload(Stock.product)).where(Stock.product_id == product_id)
    
    result = await db.execute(query)
    stocks = result.scalars().all()
    
    warehouses = [
        WarehouseStock(
            warehouse_id=s.warehouse_id,
            warehouse_name=s.warehouse.name,
            warehouse_code=s.warehouse.code,
            product_id=s.product_id,
            product_name=s.product.name,
            product_code=s.product.code,
            product_unit=s.product.unit,
            quantity=s.quantity,
            reserved_quantity=s.reserved_quantity,
            available_quantity=s.available_quantity)
        for s in stocks
    ]
    
    return ProductStock(
        product_id=product.id,
        product_name=product.name,
        product_code=product.code,
        product_unit=product.unit,
        warehouses=warehouses,
        total_quantity=sum(s.quantity for s in stocks),
        total_available=sum(s.available_quantity for s in stocks))

@router.get("/{stock_id}", response_model=StockResponse)
async def get_stock(
    *,
    db: AsyncSession = Depends(get_db),
    stock_id: int) -> Any:
    """获取库存详情"""
    result = await db.execute(
        select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product)).where(Stock.id == stock_id)
    )
    stock = result.scalar_one_or_none()
    
    if not stock:
        raise HTTPException(status_code=404, detail="库存记录不存在")
    
    return build_stock_response(stock)

@router.put("/{stock_id}", response_model=StockResponse)
async def update_stock(
    *,
    db: AsyncSession = Depends(get_db),
    stock_id: int,
    stock_in: StockUpdate) -> Any:
    """更新库存设置（安全库存等）"""
    stock = await db.get(Stock, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="库存记录不存在")
    
    if stock_in.safety_stock is not None:
        stock.safety_stock = stock_in.safety_stock
    
    await db.commit()
    
    # 重新加载关联
    result = await db.execute(
        select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product)).where(Stock.id == stock_id)
    )
    stock = result.scalar_one()
    
    return build_stock_response(stock)

@router.post("/{stock_id}/adjust", response_model=StockResponse)
async def adjust_stock(
    *,
    db: AsyncSession = Depends(get_db),
    stock_id: int,
    adjust_in: StockAdjust) -> Any:
    """调整库存（盘点）"""
    stock = await db.get(Stock, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="库存记录不存在")
    
    old_quantity = stock.quantity
    new_quantity = adjust_in.new_quantity
    change = new_quantity - old_quantity
    
    if change == 0:
        raise HTTPException(status_code=400, detail="库存数量未发生变化")
    
    # 更新库存
    stock.quantity = new_quantity
    stock.last_check_at = datetime.utcnow()
    
    # 记录流水
    flow = StockFlow(
        stock_id=stock.id,
        flow_type="adjust",
        quantity_change=change,
        quantity_before=old_quantity,
        quantity_after=new_quantity,
        reason=adjust_in.reason,
        operator_id=1,
        operated_at=datetime.utcnow())
    db.add(flow)
    
    await db.commit()
    
    # 重新加载关联
    result = await db.execute(
        select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product)).where(Stock.id == stock_id)
    )
    stock = result.scalar_one()
    
    return build_stock_response(stock)

@router.get("/{stock_id}/flows", response_model=StockFlowListResponse)
async def list_stock_flows(
    *,
    db: AsyncSession = Depends(get_db),
    stock_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    flow_type: Optional[str] = Query(None),
    include_reserve: bool = Query(False, description="是否包含预留/释放记录")) -> Any:
    """获取库存流水
    
    默认只显示实际影响库存数量的流水（入库、出库、调整）。
    预留和释放操作不改变实际库存数量，默认不显示。
    """
    # 验证库存记录
    stock = await db.get(Stock, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="库存记录不存在")
    
    # 基础条件
    conditions = [StockFlow.stock_id == stock_id]
    
    # 默认不显示预留/释放类型（它们不改变实际库存）
    if not include_reserve:
        conditions.append(StockFlow.flow_type.notin_(["reserve", "release"]))
    
    if flow_type:
        conditions.append(StockFlow.flow_type == flow_type)
    
    query = select(StockFlow).options(
        selectinload(StockFlow.stock).selectinload(Stock.warehouse),
        selectinload(StockFlow.stock).selectinload(Stock.product),
        selectinload(StockFlow.order),
        selectinload(StockFlow.operator)).where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count()).where(and_(*conditions))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    query = query.order_by(StockFlow.operated_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    flows = result.scalars().unique().all()
    
    # 查询已被撤销的调整ID集合
    # 撤销记录的reason格式为: "撤销调整#ID（原因：xxx）"
    reverted_ids_result = await db.execute(
        select(StockFlow.reason).where(
            and_(
                StockFlow.stock_id == stock_id,
                StockFlow.reason.like("撤销调整#%"))
        )
    )
    reverted_flow_ids = set()
    import re
    for row in reverted_ids_result:
        reason = row[0]
        if reason:
            # 从 "撤销调整#123（原因：xxx）" 提取 123
            match = re.match(r"撤销调整#(\d+)", reason)
            if match:
                reverted_flow_ids.add(int(match.group(1)))
    
    return StockFlowListResponse(
        data=[build_flow_response(f, reverted_flow_ids) for f in flows],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/flows/all", response_model=StockFlowListResponse)
async def list_all_flows(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[int] = Query(None, description="仓库ID筛选"),
    flow_type: Optional[str] = Query(None, description="流水类型筛选"),
    date_from: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    search: Optional[str] = Query(None, description="搜索商品名/编码/原因")) -> Any:
    """获取所有库存流水（用于统计查询）
    
    跨仓库、跨商品的流水查询接口。
    默认只显示实际影响库存数量的流水（入库、出库、调整）。
    """
    import re
    from datetime import datetime as dt
    
    # 基础查询
    query = (
        select(StockFlow)
        .join(Stock, StockFlow.stock_id == Stock.id)
        .options(
            selectinload(StockFlow.stock).selectinload(Stock.warehouse),
            selectinload(StockFlow.stock).selectinload(Stock.product),
            selectinload(StockFlow.order),
            selectinload(StockFlow.operator))
    )
    
    conditions = []
    
    # 默认不显示预留/释放类型
    conditions.append(StockFlow.flow_type.notin_(["reserve", "release"]))
    
    # 仓库筛选
    if warehouse_id:
        conditions.append(Stock.warehouse_id == warehouse_id)
    
    # 流水类型筛选
    if flow_type:
        conditions.append(StockFlow.flow_type == flow_type)
    
    # 日期筛选
    if date_from:
        try:
            from_date = dt.strptime(date_from, "%Y-%m-%d")
            conditions.append(StockFlow.operated_at >= from_date)
        except ValueError:
            pass
    
    if date_to:
        try:
            to_date = dt.strptime(date_to, "%Y-%m-%d")
            # 包含当天的结束时间
            to_date = to_date.replace(hour=23, minute=59, second=59)
            conditions.append(StockFlow.operated_at <= to_date)
        except ValueError:
            pass
    
    # 搜索（商品名/编码/原因/单号）
    if search:
        query = query.join(Product, Stock.product_id == Product.id)
        conditions.append(
            (Product.name.ilike(f"%{search}%")) |
            (Product.code.ilike(f"%{search}%")) |
            (StockFlow.reason.ilike(f"%{search}%"))
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_conditions = conditions.copy() if conditions else []
    count_query = (
        select(func.count(StockFlow.id))
        .select_from(StockFlow)
        .join(Stock, StockFlow.stock_id == Stock.id)
    )
    if search:
        count_query = count_query.join(Product, Stock.product_id == Product.id)
    if count_conditions:
        count_query = count_query.where(and_(*count_conditions))
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    query = query.order_by(StockFlow.operated_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    flows = result.scalars().unique().all()
    
    # 查询已被撤销的调整ID集合
    reverted_ids_result = await db.execute(
        select(StockFlow.reason).where(
            StockFlow.reason.like("撤销调整#%")
        )
    )
    reverted_flow_ids = set()
    for row in reverted_ids_result:
        reason = row[0]
        if reason:
            match = re.match(r"撤销调整#(\d+)", reason)
            if match:
                reverted_flow_ids.add(int(match.group(1)))
    
    return StockFlowListResponse(
        data=[build_flow_response(f, reverted_flow_ids) for f in flows],
        total=total,
        page=page,
        limit=limit
    )

@router.post("/flows/{flow_id}/revert", response_model=StockFlowResponse)
async def revert_stock_flow(
    *,
    db: AsyncSession = Depends(get_db),
    flow_id: int) -> Any:
    """
    撤销库存调整
    
    只能撤销手动调整（flow_type='adjust' 且无关联业务单）。
    撤销操作会创建一条反向的调整流水。
    """
    # 查询流水记录
    result = await db.execute(
        select(StockFlow).options(
            selectinload(StockFlow.stock).selectinload(Stock.warehouse),
            selectinload(StockFlow.stock).selectinload(Stock.product),
            selectinload(StockFlow.operator)).where(StockFlow.id == flow_id)
    )
    flow = result.scalar_one_or_none()
    
    if not flow:
        raise HTTPException(status_code=404, detail="流水记录不存在")
    
    # 检查是否可撤销
    if flow.flow_type != "adjust":
        raise HTTPException(status_code=400, detail="只能撤销调整类型的流水")
    
    if flow.order_id is not None:
        raise HTTPException(status_code=400, detail="业务单产生的调整不能手动撤销")
    
    if flow.reason and flow.reason.startswith("库存重算调整"):
        raise HTTPException(status_code=400, detail="重算产生的调整不能撤销")
    
    if flow.reason and flow.reason.startswith("撤销调整"):
        raise HTTPException(status_code=400, detail="撤销操作不能再次撤销")
    
    # 检查是否已经被撤销过
    existing_revert = await db.execute(
        select(StockFlow).where(
            StockFlow.reason.like(f"撤销调整#{flow_id}（%")
        )
    )
    if existing_revert.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="此调整已被撤销，不能重复撤销")
    
    # 获取库存记录
    stock = flow.stock
    if not stock:
        raise HTTPException(status_code=400, detail="关联的库存记录不存在")
    
    # 计算反向调整量
    revert_change = -flow.quantity_change
    old_quantity = stock.quantity
    new_quantity = old_quantity + revert_change
    
    if new_quantity < 0:
        raise HTTPException(
            status_code=400, 
            detail=f"撤销后库存将为负数（当前{old_quantity}，撤销{revert_change}）"
        )
    
    # 更新库存
    stock.quantity = new_quantity
    stock.updated_at = datetime.utcnow()
    
    # 创建撤销流水
    revert_flow = StockFlow(
        stock_id=stock.id,
        flow_type="adjust",
        quantity_change=revert_change,
        quantity_before=old_quantity,
        quantity_after=new_quantity,
        reason=f"撤销调整#{flow.id}（原因：{flow.reason or '无'}）",
        operator_id=1,
        operated_at=datetime.utcnow())
    db.add(revert_flow)
    
    await db.commit()
    await db.refresh(revert_flow)
    
    # 重新加载关联
    result = await db.execute(
        select(StockFlow).options(
            selectinload(StockFlow.stock).selectinload(Stock.warehouse),
            selectinload(StockFlow.stock).selectinload(Stock.product),
            selectinload(StockFlow.operator)).where(StockFlow.id == revert_flow.id)
    )
    revert_flow = result.scalar_one()
    
    return build_flow_response(revert_flow)

# ===== 库存服务函数（供业务单调用）=====

async def get_or_create_stock(
    db: AsyncSession,
    warehouse_id: int,
    product_id: int,
    spec_id: int = None,
    spec_name: str = None) -> Stock:
    """获取或创建库存记录
    
    Args:
        warehouse_id: 仓库ID
        product_id: 商品ID
        spec_id: 规格ID（可选，None表示不区分规格）
        spec_name: 规格名称快照（可选）
    """
    # 构建查询条件
    conditions = [
        Stock.warehouse_id == warehouse_id,
        Stock.product_id == product_id
    ]
    
    # 如果指定了规格，按规格查找；否则查找不区分规格的记录
    if spec_id is not None:
        conditions.append(Stock.spec_id == spec_id)
    else:
        conditions.append(Stock.spec_id.is_(None))
    
    result = await db.execute(
        select(Stock).where(and_(*conditions))
    )
    stock = result.scalar_one_or_none()
    
    if not stock:
        stock = Stock(
            warehouse_id=warehouse_id,
            product_id=product_id,
            spec_id=spec_id,
            spec_name=spec_name,
            quantity=0,
            reserved_quantity=0)
        db.add(stock)
        await db.flush()
    
    return stock

async def add_stock(
    db: AsyncSession,
    warehouse_id: int,
    product_id: int,
    quantity: int,
    operator_id: int,
    order_id: int = None,
    order_item_id: int = None,
    reason: str = None,
    spec_id: int = None,
    spec_name: str = None) -> Stock:
    """入库
    
    Args:
        spec_id: 规格ID（可选，None表示不区分规格）
        spec_name: 规格名称快照（可选）
    """
    stock = await get_or_create_stock(db, warehouse_id, product_id, spec_id, spec_name)
    
    old_quantity = stock.quantity
    stock.quantity += quantity
    
    # 记录流水
    flow = StockFlow(
        stock_id=stock.id,
        order_id=order_id,
        order_item_id=order_item_id,
        flow_type="in",
        quantity_change=quantity,
        quantity_before=old_quantity,
        quantity_after=stock.quantity,
        reason=reason or "入库",
        operator_id=operator_id,
        operated_at=datetime.utcnow())
    db.add(flow)
    
    return stock

async def reduce_stock(
    db: AsyncSession,
    warehouse_id: int,
    product_id: int,
    quantity: int,
    operator_id: int,
    order_id: int = None,
    order_item_id: int = None,
    reason: str = None,
    check_available: bool = True,
    spec_id: int = None,
    spec_name: str = None) -> Stock:
    """出库
    
    Args:
        spec_id: 规格ID（可选，None表示不区分规格）
        spec_name: 规格名称快照（可选）
    """
    stock = await get_or_create_stock(db, warehouse_id, product_id, spec_id, spec_name)
    
    if check_available and stock.available_quantity < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"库存不足：可用库存 {stock.available_quantity}，需要 {quantity}"
        )
    
    old_quantity = stock.quantity
    stock.quantity -= quantity
    
    # 如果有预留，同时减少预留
    if stock.reserved_quantity > 0:
        release = min(stock.reserved_quantity, quantity)
        stock.reserved_quantity -= release
    
    # 记录流水
    flow = StockFlow(
        stock_id=stock.id,
        order_id=order_id,
        order_item_id=order_item_id,
        flow_type="out",
        quantity_change=-quantity,
        quantity_before=old_quantity,
        quantity_after=stock.quantity,
        reason=reason or "出库",
        operator_id=operator_id,
        operated_at=datetime.utcnow())
    db.add(flow)
    
    return stock

async def reserve_stock(
    db: AsyncSession,
    warehouse_id: int,
    product_id: int,
    quantity: int,
    operator_id: int,
    order_id: int = None,
    order_item_id: int = None,
    reason: str = None,
    spec_id: int = None,
    spec_name: str = None) -> Stock:
    """预留库存（确认出库单时调用）
    
    Args:
        spec_id: 规格ID（可选，None表示不区分规格）
        spec_name: 规格名称快照（可选）
    """
    stock = await get_or_create_stock(db, warehouse_id, product_id, spec_id, spec_name)
    
    if stock.available_quantity < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"可用库存不足：可用 {stock.available_quantity}，需预留 {quantity}"
        )
    
    stock.reserved_quantity += quantity
    
    # 记录流水
    flow = StockFlow(
        stock_id=stock.id,
        order_id=order_id,
        order_item_id=order_item_id,
        flow_type="reserve",
        quantity_change=0,  # 预留不改变实际库存
        quantity_before=stock.quantity,
        quantity_after=stock.quantity,
        reason=reason or f"预留库存 {quantity}",
        operator_id=operator_id,
        operated_at=datetime.utcnow())
    db.add(flow)
    
    return stock

async def release_stock(
    db: AsyncSession,
    warehouse_id: int,
    product_id: int,
    quantity: int,
    operator_id: int,
    order_id: int = None,
    order_item_id: int = None,
    reason: str = None,
    spec_id: int = None,
    spec_name: str = None) -> Stock:
    """释放预留库存（取消出库单时调用）
    
    Args:
        spec_id: 规格ID（可选，None表示不区分规格）
        spec_name: 规格名称快照（可选）
    """
    stock = await get_or_create_stock(db, warehouse_id, product_id, spec_id, spec_name)
    
    release = min(stock.reserved_quantity, quantity)
    stock.reserved_quantity -= release
    
    # 记录流水
    flow = StockFlow(
        stock_id=stock.id,
        order_id=order_id,
        order_item_id=order_item_id,
        flow_type="release",
        quantity_change=0,
        quantity_before=stock.quantity,
        quantity_after=stock.quantity,
        reason=reason or f"释放预留 {release}",
        operator_id=operator_id,
        operated_at=datetime.utcnow())
    db.add(flow)
    
    return stock

# ===== 库存重算功能 =====

async def _calculate_stock_from_orders_optimized(
    db: AsyncSession) -> Dict[Tuple[int, int], Dict[str, int]]:
    """
    根据业务单状态计算每个仓库-商品的库存（优化版）
    
    优化策略：
    1. 使用单条SQL通过UNION ALL合并所有计算逻辑
    2. 减少数据库往返次数（4次查询 → 1次查询）
    3. 在数据库端完成聚合，减少Python端处理
    
    计算规则：
    - 入库（quantity > 0）：
      - 采购单(purchase) 已完成 → 目标仓库入库
      - 调拨单(transfer) 已完成 → 目标仓库入库
      - 客户退货单(return_in) 已完成 → 目标仓库入库
    
    - 出库（quantity < 0）：
      - 销售单(sale) 运输中/已完成 → 来源仓库出库
      - 调拨单(transfer) 运输中/已完成 → 来源仓库出库
      - 退供应商单(return_out) 运输中/已完成 → 来源仓库出库
    
    - 预留（reserved > 0）：
      - 销售单(sale) 已确认 → 来源仓库预留
      - 调拨单(transfer) 已确认 → 来源仓库预留
      - 退供应商单(return_out) 已确认 → 来源仓库预留
    
    返回: {(warehouse_id, product_id): {"quantity": N, "reserved": M}}
    """
    
    # 获取所有仓库ID
    warehouse_result = await db.execute(
        select(Entity.id).where(Entity.entity_type == "warehouse")
    )
    warehouse_ids = set(row[0] for row in warehouse_result)
    
    if not warehouse_ids:
        return {}
    
    # 构建入库子查询（采购/客户退货 已完成 → 目标仓库）
    in_purchase_return = (
        select(
            BusinessOrder.target_id.label("warehouse_id"),
            OrderItem.product_id,
            OrderItem.quantity.label("qty_change"),
            literal(0).label("reserved_change"))
        .join(OrderItem, BusinessOrder.id == OrderItem.order_id)
        .where(
            and_(
                BusinessOrder.order_type.in_(["purchase", "return_in"]),
                BusinessOrder.status == "completed",
                BusinessOrder.target_id.in_(warehouse_ids))
        )
    )
    
    # 调拨入库（目标仓库 已完成）
    in_transfer = (
        select(
            BusinessOrder.target_id.label("warehouse_id"),
            OrderItem.product_id,
            OrderItem.quantity.label("qty_change"),
            literal(0).label("reserved_change"))
        .join(OrderItem, BusinessOrder.id == OrderItem.order_id)
        .where(
            and_(
                BusinessOrder.order_type == "transfer",
                BusinessOrder.status == "completed",
                BusinessOrder.target_id.in_(warehouse_ids))
        )
    )
    
    # 出库（销售/调拨/退供应商 运输中或已完成 → 来源仓库）
    out_orders = (
        select(
            BusinessOrder.source_id.label("warehouse_id"),
            OrderItem.product_id,
            (-OrderItem.quantity).label("qty_change"),  # 负数表示出库
            literal(0).label("reserved_change"))
        .join(OrderItem, BusinessOrder.id == OrderItem.order_id)
        .where(
            and_(
                BusinessOrder.order_type.in_(["sale", "transfer", "return_out"]),
                BusinessOrder.status.in_(["shipping", "completed"]),
                BusinessOrder.source_id.in_(warehouse_ids))
        )
    )
    
    # 预留（销售/调拨/退供应商 已确认 → 来源仓库）
    reserved_orders = (
        select(
            BusinessOrder.source_id.label("warehouse_id"),
            OrderItem.product_id,
            literal(0).label("qty_change"),
            OrderItem.quantity.label("reserved_change"))
        .join(OrderItem, BusinessOrder.id == OrderItem.order_id)
        .where(
            and_(
                BusinessOrder.order_type.in_(["sale", "transfer", "return_out"]),
                BusinessOrder.status == "confirmed",
                BusinessOrder.source_id.in_(warehouse_ids))
        )
    )
    
    # 使用 UNION ALL 合并所有子查询，然后在外层聚合
    combined = union_all(in_purchase_return, in_transfer, out_orders, reserved_orders).subquery()
    
    aggregated_query = (
        select(
            combined.c.warehouse_id,
            combined.c.product_id,
            func.sum(combined.c.qty_change).label("total_qty"),
            func.sum(combined.c.reserved_change).label("total_reserved"))
        .group_by(combined.c.warehouse_id, combined.c.product_id)
    )
    
    result = await db.execute(aggregated_query)
    
    # 构建结果字典
    stock_map: Dict[Tuple[int, int], Dict[str, int]] = {}
    for row in result:
        warehouse_id, product_id, total_qty, total_reserved = row
        if warehouse_id is not None and product_id is not None:
            stock_map[(warehouse_id, product_id)] = {
                "quantity": int(total_qty or 0),
                "reserved": int(total_reserved or 0),
            }
    
    return stock_map

async def _get_existing_stocks_map(db: AsyncSession) -> Dict[Tuple[int, int], Stock]:
    """获取现有库存记录映射"""
    existing_result = await db.execute(
        select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product))
    )
    return {
        (s.warehouse_id, s.product_id): s
        for s in existing_result.scalars().all()
    }

async def _get_manual_adjustments(db: AsyncSession) -> Dict[Tuple[int, int], int]:
    """
    获取手动调整的累计量
    
    手动调整是指 flow_type='adjust' 且 order_id IS NULL 的流水记录
    （有 order_id 的是业务单触发的调整，不应重复计算）
    
    返回: {(warehouse_id, product_id): 累计调整量}
    """
    # 查询所有手动调整流水，按仓库-商品聚合
    query = (
        select(
            Stock.warehouse_id,
            Stock.product_id,
            func.sum(StockFlow.quantity_change).label("total_adjust"))
        .join(Stock, StockFlow.stock_id == Stock.id)
        .where(
            and_(
                StockFlow.flow_type == "adjust",
                StockFlow.order_id.is_(None),  # 手动调整没有关联业务单
                # 排除重算产生的调整（通过reason判断）
                ~StockFlow.reason.like("库存重算调整%"))
        )
        .group_by(Stock.warehouse_id, Stock.product_id)
    )
    
    result = await db.execute(query)
    
    adjust_map: Dict[Tuple[int, int], int] = {}
    for row in result:
        warehouse_id, product_id, total_adjust = row
        if warehouse_id is not None and product_id is not None and total_adjust:
            adjust_map[(warehouse_id, product_id)] = int(total_adjust)
    
    return adjust_map

async def recalculate_all_stocks(
    db: AsyncSession,
    operator_id: int) -> Dict[str, Any]:
    """
    重新计算所有库存（优化版）
    
    计算公式：
    最终库存 = 业务单计算库存 + 手动调整累计量
    
    优化策略：
    1. 使用优化后的单条SQL查询计算应有库存（4次查询合并为1次UNION ALL）
    2. 单独查询手动调整累计量（flow_type='adjust' 且无关联业务单）
    3. 批量创建新库存记录和流水记录
    4. 减少循环中的数据库操作
    
    流程：
    1. 获取业务单计算库存（使用UNION ALL优化后的单条SQL）
    2. 获取手动调整累计量
    3. 获取现有库存
    4. 合并计算：业务单库存 + 手动调整
    5. 对比差异
    6. 批量更新/创建
    
    返回：调整统计信息
    """
    import time
    start_time = time.time()
    
    # 顺序执行（SQLAlchemy async session 不支持同一session并发操作）
    # 1. 获取业务单计算库存
    calculated = await _calculate_stock_from_orders_optimized(db)
    # 2. 获取手动调整累计量
    manual_adjustments = await _get_manual_adjustments(db)
    # 3. 获取现有库存
    existing_stocks = await _get_existing_stocks_map(db)
    
    query_time = time.time() - start_time
    
    adjustments = []
    created = 0
    updated = 0
    unchanged = 0
    manual_adjust_applied = 0
    
    # 批量收集需要创建的对象
    new_stocks: List[Stock] = []
    new_flows: List[StockFlow] = []
    now = datetime.utcnow()
    
    # 处理所有计算出的库存（包括手动调整涉及的）
    all_keys = set(calculated.keys()) | set(existing_stocks.keys()) | set(manual_adjustments.keys())
    
    for key in all_keys:
        warehouse_id, product_id = key
        calc = calculated.get(key, {"quantity": 0, "reserved": 0})
        # 业务单计算的库存
        order_qty = calc["quantity"]
        expected_reserved = calc["reserved"]
        
        # 加上手动调整量
        manual_adj = manual_adjustments.get(key, 0)
        expected_qty = order_qty + manual_adj
        
        if manual_adj != 0:
            manual_adjust_applied += 1
        
        existing = existing_stocks.get(key)
        
        if existing:
            # 已有记录，检查是否需要调整
            if existing.quantity != expected_qty or existing.reserved_quantity != expected_reserved:
                old_qty = existing.quantity
                old_reserved = existing.reserved_quantity
                
                existing.quantity = expected_qty
                existing.reserved_quantity = expected_reserved
                existing.updated_at = now
                
                # 记录调整流水（仅当数量变化时）
                if old_qty != expected_qty:
                    new_flows.append(StockFlow(
                        stock_id=existing.id,
                        flow_type="adjust",
                        quantity_change=expected_qty - old_qty,
                        quantity_before=old_qty,
                        quantity_after=expected_qty,
                        reason=f"库存重算调整（原{old_qty}→{expected_qty}）",
                        operator_id=operator_id,
                        operated_at=now))
                
                adjustments.append({
                    "warehouse_id": warehouse_id,
                    "product_id": product_id,
                    "old_quantity": old_qty,
                    "new_quantity": expected_qty,
                    "old_reserved": old_reserved,
                    "new_reserved": expected_reserved,
                })
                updated += 1
            else:
                unchanged += 1
        else:
            # 新记录（仅当有库存时创建）
            if expected_qty != 0 or expected_reserved != 0:
                new_stocks.append(Stock(
                    warehouse_id=warehouse_id,
                    product_id=product_id,
                    quantity=expected_qty,
                    reserved_quantity=expected_reserved,
                    created_at=now,
                    updated_at=now))
                created += 1
    
    # 批量添加新库存记录
    if new_stocks:
        db.add_all(new_stocks)
    
    # 批量添加流水记录
    if new_flows:
        db.add_all(new_flows)
    
    await db.commit()
    
    total_time = time.time() - start_time
    
    return {
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "manual_adjustments_applied": manual_adjust_applied,
        "adjustments": adjustments,
        "performance": {
            "query_time_ms": round(query_time * 1000, 2),
            "total_time_ms": round(total_time * 1000, 2),
            "records_processed": len(all_keys),
        }
    }

@router.post("/recalculate")
async def recalculate_stocks(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    重新计算所有库存（根据业务单状态 + 手动调整）
    
    计算公式：
    最终库存 = 业务单计算库存 + 手动调整累计量
    
    优化点：
    1. 使用单条SQL通过UNION ALL合并所有业务单计算逻辑（4次查询→1次）
    2. 单独查询手动调整累计量（保证手动调整不会丢失）
    3. 批量创建/更新记录
    
    此操作会：
    1. 遍历所有业务单，计算每个仓库-商品的应有库存
    2. 累加手动调整量（盘点、损耗等）
    3. 与现有库存对比，自动调整差异
    4. 记录调整流水
    
    需要 stock.adjust 权限
    """
    result = await recalculate_all_stocks(db, 1)
    
    return {
        "message": "库存重算完成",
        "summary": {
            "created": result["created"],
            "updated": result["updated"],
            "unchanged": result["unchanged"],
            "manual_adjustments_applied": result["manual_adjustments_applied"],
        },
        "adjustments": result["adjustments"],
        "performance": result.get("performance", {}),
    }

@router.post("/cleanup-empty")
async def cleanup_empty_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    confirm: bool = Query(False, description="确认删除")) -> Any:
    """
    清理空的库存记录及其流水 - 需要 stock.adjust 权限
    
    只清理数量和预留都为0的库存记录，同时删除其关联的流水记录。
    这个操作会永久删除数据，请谨慎使用。
    
    传入 confirm=true 确认执行清理。
    """
    from sqlalchemy import delete
    
    # 找出空库存记录
    empty_stocks_result = await db.execute(
        select(Stock).where(
            Stock.quantity == 0,
            Stock.reserved_quantity == 0
        ).options(selectinload(Stock.warehouse), selectinload(Stock.product))
    )
    empty_stocks = empty_stocks_result.scalars().all()
    
    # 统计信息
    cleanup_info = []
    total_stocks = 0
    total_flows = 0
    
    for stock in empty_stocks:
        # 统计关联的流水记录数
        flow_count = (await db.execute(
            select(func.count(StockFlow.id)).where(StockFlow.stock_id == stock.id)
        )).scalar() or 0
        
        cleanup_info.append({
            "stock_id": stock.id,
            "warehouse": stock.warehouse.name if stock.warehouse else f"ID:{stock.warehouse_id}",
            "product": stock.product.name if stock.product else f"ID:{stock.product_id}",
            "flow_count": flow_count,
        })
        total_stocks += 1
        total_flows += flow_count
    
    if not confirm:
        return {
            "message": "预览模式，传入 confirm=true 确认删除",
            "will_delete": {
                "stocks": total_stocks,
                "flows": total_flows,
            },
            "details": cleanup_info,
        }
    
    # 执行清理
    for stock in empty_stocks:
        # 先删除流水
        await db.execute(
            delete(StockFlow).where(StockFlow.stock_id == stock.id)
        )
        # 再删除库存记录
        await db.delete(stock)
    
    await db.commit()
    
    return {
        "message": "清理完成",
        "deleted": {
            "stocks": total_stocks,
            "flows": total_flows,
        },
        "details": cleanup_info,
    }

