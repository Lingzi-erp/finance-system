"""单位管理API"""

from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.unit import UnitGroup, Unit, CompositeUnit
from app.schemas.v3.unit import (
    UnitGroupCreate, UnitGroupUpdate, UnitGroupResponse, UnitGroupListResponse,
    UnitCreate, UnitUpdate, UnitResponse,
    CompositeUnitCreate, CompositeUnitUpdate, CompositeUnitResponse, CompositeUnitListResponse
)

router = APIRouter()


# ========== 单位组 ==========

def _build_group_response(group: UnitGroup) -> UnitGroupResponse:
    """构建单位组响应"""
    units = []
    if group.units:
        for u in sorted(group.units, key=lambda x: (not x.is_base, x.sort_order)):
            units.append({
                "id": u.id,
                "name": u.name,
                "symbol": u.symbol,
                "conversion_rate": u.conversion_rate,
                "is_base": u.is_base,
            })
    
    return UnitGroupResponse(
        id=group.id,
        name=group.name,
        base_unit=group.base_unit,
        description=group.description,
        is_active=group.is_active,
        units=units,
        created_at=group.created_at)

@router.get("/groups", response_model=UnitGroupListResponse)
async def list_unit_groups(
    *,
    db: AsyncSession = Depends(get_db),
    is_active: Optional[bool] = Query(True)) -> Any:
    """获取单位组列表"""
    query = select(UnitGroup).options(selectinload(UnitGroup.units))
    
    if is_active is not None:
        query = query.where(UnitGroup.is_active == is_active)
    
    query = query.order_by(UnitGroup.id)
    result = await db.execute(query)
    groups = result.scalars().unique().all()
    
    return UnitGroupListResponse(
        data=[_build_group_response(g) for g in groups],
        total=len(groups)
    )

@router.get("/groups/{group_id}", response_model=UnitGroupResponse)
async def get_unit_group(
    *,
    db: AsyncSession = Depends(get_db),
    group_id: int) -> Any:
    """获取单位组详情"""
    result = await db.execute(
        select(UnitGroup).options(selectinload(UnitGroup.units)).where(UnitGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="单位组不存在")
    
    return _build_group_response(group)

@router.post("/groups", response_model=UnitGroupResponse)
async def create_unit_group(
    *,
    db: AsyncSession = Depends(get_db),
    group_in: UnitGroupCreate) -> Any:
    """创建单位组"""
    # 检查名称唯一
    existing = await db.execute(
        select(UnitGroup).where(UnitGroup.name == group_in.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="已存在同名单位组")
    
    group = UnitGroup(
        name=group_in.name,
        base_unit=group_in.base_unit,
        description=group_in.description)
    db.add(group)
    await db.flush()
    
    # 创建基准单位
    base_unit = Unit(
        group_id=group.id,
        name=group_in.base_unit,
        symbol=group_in.base_unit,
        conversion_rate=1.0,
        is_base=True)
    db.add(base_unit)
    
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(UnitGroup).options(selectinload(UnitGroup.units)).where(UnitGroup.id == group.id)
    )
    group = result.scalar_one()
    
    return _build_group_response(group)

@router.put("/groups/{group_id}", response_model=UnitGroupResponse)
async def update_unit_group(
    *,
    db: AsyncSession = Depends(get_db),
    group_id: int,
    group_in: UnitGroupUpdate) -> Any:
    """更新单位组"""
    result = await db.execute(
        select(UnitGroup).options(selectinload(UnitGroup.units)).where(UnitGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="单位组不存在")
    
    # 更新字段
    update_data = group_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(group, field, value)
    
    await db.commit()
    await db.refresh(group)
    
    return _build_group_response(group)

# ========== 单位 ==========

def _build_unit_response(unit: Unit) -> UnitResponse:
    """构建单位响应"""
    return UnitResponse(
        id=unit.id,
        group_id=unit.group_id,
        group_name=unit.group.name if unit.group else "",
        name=unit.name,
        symbol=unit.symbol,
        conversion_rate=unit.conversion_rate,
        is_base=unit.is_base,
        sort_order=unit.sort_order,
        is_active=unit.is_active)

@router.get("/", response_model=List[UnitResponse])
async def list_units(
    *,
    db: AsyncSession = Depends(get_db),
    group_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(True)) -> Any:
    """获取单位列表"""
    query = select(Unit).options(selectinload(Unit.group))
    
    conditions = []
    if group_id:
        conditions.append(Unit.group_id == group_id)
    if is_active is not None:
        conditions.append(Unit.is_active == is_active)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(Unit.group_id, Unit.is_base.desc(), Unit.sort_order)
    result = await db.execute(query)
    units = result.scalars().unique().all()
    
    return [_build_unit_response(u) for u in units]

@router.post("/", response_model=UnitResponse)
async def create_unit(
    *,
    db: AsyncSession = Depends(get_db),
    unit_in: UnitCreate) -> Any:
    """创建单位"""
    # 检查单位组
    group = await db.get(UnitGroup, unit_in.group_id)
    if not group:
        raise HTTPException(status_code=400, detail="单位组不存在")
    
    # 检查名称唯一（组内）
    existing = await db.execute(
        select(Unit).where(
            and_(Unit.group_id == unit_in.group_id, Unit.name == unit_in.name)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该单位组下已存在同名单位")
    
    unit = Unit(
        group_id=unit_in.group_id,
        name=unit_in.name,
        symbol=unit_in.symbol,
        conversion_rate=unit_in.conversion_rate,
        is_base=unit_in.is_base,
        sort_order=unit_in.sort_order)
    db.add(unit)
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(Unit).options(selectinload(Unit.group)).where(Unit.id == unit.id)
    )
    unit = result.scalar_one()
    
    return _build_unit_response(unit)

@router.put("/{unit_id}", response_model=UnitResponse)
async def update_unit(
    *,
    db: AsyncSession = Depends(get_db),
    unit_id: int,
    unit_in: UnitUpdate) -> Any:
    """更新单位"""
    result = await db.execute(
        select(Unit).options(selectinload(Unit.group)).where(Unit.id == unit_id)
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail="单位不存在")
    
    # 基准单位不能修改换算率
    if unit.is_base and unit_in.conversion_rate and unit_in.conversion_rate != 1.0:
        raise HTTPException(status_code=400, detail="基准单位换算率必须为1")
    
    # 更新字段
    update_data = unit_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(unit, field, value)
    
    await db.commit()
    await db.refresh(unit)
    
    return _build_unit_response(unit)

# ========== 复式单位 ==========

def _build_composite_response(cu: CompositeUnit) -> CompositeUnitResponse:
    """构建复式单位响应"""
    return CompositeUnitResponse(
        id=cu.id,
        name=cu.name,
        container_name=cu.container_name,
        quantity=cu.quantity,
        unit_id=cu.unit_id,
        description=cu.description,
        is_active=cu.is_active,
        display_name=f"{cu.container_name}({cu.quantity}{cu.unit.symbol})" if cu.unit else cu.name,
        unit_name=cu.unit.name if cu.unit else "",
        unit_symbol=cu.unit.symbol if cu.unit else "",
        created_at=cu.created_at)

@router.get("/composite", response_model=CompositeUnitListResponse)
async def list_composite_units(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    is_active: Optional[bool] = Query(True),
    search: Optional[str] = Query(None)) -> Any:
    """获取复式单位列表"""
    query = select(CompositeUnit).options(selectinload(CompositeUnit.unit))
    
    conditions = []
    if is_active is not None:
        conditions.append(CompositeUnit.is_active == is_active)
    if search:
        conditions.append(
            CompositeUnit.name.ilike(f"%{search}%") | 
            CompositeUnit.container_name.ilike(f"%{search}%")
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计
    count_query = select(func.count(CompositeUnit.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0
    
    # 分页
    query = query.order_by(CompositeUnit.id)
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    composites = result.scalars().unique().all()
    
    return CompositeUnitListResponse(
        data=[_build_composite_response(c) for c in composites],
        total=total,
        page=page,
        limit=limit
    )

@router.post("/composite", response_model=CompositeUnitResponse)
async def create_composite_unit(
    *,
    db: AsyncSession = Depends(get_db),
    cu_in: CompositeUnitCreate) -> Any:
    """创建复式单位"""
    # 检查内容单位
    unit = await db.get(Unit, cu_in.unit_id)
    if not unit:
        raise HTTPException(status_code=400, detail="单位不存在")
    
    # 自动生成名称
    name = cu_in.name or f"{cu_in.container_name}({cu_in.quantity}{unit.symbol})"
    
    cu = CompositeUnit(
        name=name,
        container_name=cu_in.container_name,
        quantity=cu_in.quantity,
        unit_id=cu_in.unit_id,
        description=cu_in.description,
        created_by=1)
    db.add(cu)
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(CompositeUnit).options(selectinload(CompositeUnit.unit)).where(CompositeUnit.id == cu.id)
    )
    cu = result.scalar_one()
    
    return _build_composite_response(cu)

@router.put("/composite/{cu_id}", response_model=CompositeUnitResponse)
async def update_composite_unit(
    *,
    db: AsyncSession = Depends(get_db),
    cu_id: int,
    cu_in: CompositeUnitUpdate) -> Any:
    """更新复式单位"""
    result = await db.execute(
        select(CompositeUnit).options(selectinload(CompositeUnit.unit)).where(CompositeUnit.id == cu_id)
    )
    cu = result.scalar_one_or_none()
    if not cu:
        raise HTTPException(status_code=404, detail="复式单位不存在")
    
    # 更新字段
    update_data = cu_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cu, field, value)
    
    await db.commit()
    await db.refresh(cu)
    
    return _build_composite_response(cu)

@router.delete("/composite/{cu_id}")
async def delete_composite_unit(
    *,
    db: AsyncSession = Depends(get_db),
    cu_id: int) -> Any:
    """删除复式单位"""
    from app.models.v3.product import Product
    
    cu = await db.get(CompositeUnit, cu_id)
    if not cu:
        raise HTTPException(status_code=404, detail="复式单位不存在")
    
    # 检查是否有商品使用该复式单位
    products_count = (await db.execute(
        select(func.count(Product.id)).where(Product.composite_unit_id == cu_id)
    )).scalar() or 0
    
    if products_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该复式单位已被 {products_count} 个商品使用，无法删除"
        )
    
    await db.delete(cu)
    await db.commit()
    
    return {"message": "删除成功"}

