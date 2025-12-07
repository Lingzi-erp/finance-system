"""实体管理API - 统一的供应商/客户/仓库（单机版）"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.models.v3.entity import Entity
from app.models.v3.business_order import BusinessOrder
from app.models.v3.stock import Stock, StockFlow
from app.schemas.v3.entity import (
    EntityCreate, EntityUpdate, EntityResponse, EntityListResponse
)

router = APIRouter()


async def generate_entity_code(db: AsyncSession, entity_type: str) -> str:
    """生成实体编码"""
    # 根据主要类型确定前缀
    if "warehouse" in entity_type:
        prefix = "WH"
    elif "supplier" in entity_type:
        prefix = "SP"
    elif "customer" in entity_type:
        prefix = "CU"
    else:
        prefix = "EN"
    
    result = await db.execute(
        select(func.max(Entity.code)).where(Entity.code.like(f"{prefix}%"))
    )
    max_code = result.scalar()
    
    if max_code:
        try:
            num = int(max_code[len(prefix):]) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    
    return f"{prefix}{num:04d}"


@router.get("/", response_model=EntityListResponse)
async def list_entities(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    entity_type: Optional[str] = Query(None, description="类型筛选"),
    search: Optional[str] = Query(None, description="搜索"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
) -> Any:
    """获取实体列表"""
    query = select(Entity)
    conditions = []
    
    if entity_type:
        conditions.append(Entity.entity_type.contains(entity_type))
    if is_active is not None:
        conditions.append(Entity.is_active == is_active)
    if search:
        conditions.append(
            Entity.name.contains(search) | 
            Entity.code.contains(search) |
            Entity.contact_name.contains(search)
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.order_by(Entity.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    entities = result.scalars().all()
    
    # 构建响应
    data = []
    for e in entities:
        resp = EntityResponse.model_validate(e)
        resp.type_display = e.type_display
        data.append(resp)
    
    return EntityListResponse(data=data, total=total, page=page, limit=limit)


@router.post("/", response_model=EntityResponse)
async def create_entity(
    *,
    db: AsyncSession = Depends(get_db),
    entity_in: EntityCreate,
) -> Any:
    """创建实体"""
    # 生成编码
    code = await generate_entity_code(db, entity_in.entity_type)
    
    entity = Entity(
        **entity_in.model_dump(),
        code=code,
        created_by=1  # 单机版固定用户ID
    )
    
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    
    resp = EntityResponse.model_validate(entity)
    resp.type_display = entity.type_display
    return resp


@router.get("/{entity_id}", response_model=EntityResponse)
async def get_entity(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int,
) -> Any:
    """获取实体详情"""
    entity = await db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")
    
    resp = EntityResponse.model_validate(entity)
    resp.type_display = entity.type_display
    return resp


@router.put("/{entity_id}", response_model=EntityResponse)
async def update_entity(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int,
    entity_in: EntityUpdate,
) -> Any:
    """更新实体"""
    entity = await db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")
    
    # 系统内置实体不能编辑
    if entity.is_system:
        raise HTTPException(status_code=400, detail="系统内置客商不能编辑")
    
    update_data = entity_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entity, field, value)
    
    await db.commit()
    await db.refresh(entity)
    
    resp = EntityResponse.model_validate(entity)
    resp.type_display = entity.type_display
    return resp


@router.delete("/{entity_id}")
async def delete_entity(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int,
) -> Any:
    """删除实体"""
    entity = await db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")
    
    # 系统内置实体不能删除
    if entity.is_system:
        raise HTTPException(status_code=400, detail="系统内置客商不能删除")
    
    # 检查是否有关联的业务单（作为来源或目标）
    orders_count = (await db.execute(
        select(func.count(BusinessOrder.id)).where(
            (BusinessOrder.source_id == entity_id) | (BusinessOrder.target_id == entity_id)
        )
    )).scalar() or 0
    
    if orders_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该实体已被 {orders_count} 个业务单引用，无法删除"
        )
    
    # 如果是仓库类型，检查库存相关记录
    if "warehouse" in entity.entity_type:
        # 检查是否有库存记录
        stocks_count = (await db.execute(
            select(func.count(Stock.id)).where(Stock.warehouse_id == entity_id)
        )).scalar() or 0
        
        if stocks_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"该仓库有 {stocks_count} 条库存记录，请先清空库存后再删除"
            )
        
        # 检查是否有库存流水记录（通过Stock关联）
        flows_count = (await db.execute(
            select(func.count(StockFlow.id))
            .select_from(StockFlow)
            .join(Stock, Stock.id == StockFlow.stock_id)
            .where(Stock.warehouse_id == entity_id)
        )).scalar() or 0
        
        if flows_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"该仓库有 {flows_count} 条库存流水记录，无法删除"
            )
    
    await db.delete(entity)
    await db.commit()
    
    return {"message": "删除成功"}
