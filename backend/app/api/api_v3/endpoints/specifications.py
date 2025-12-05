"""规格模板API"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.specification import Specification
from app.models.v3.category import Category
from app.schemas.v3.specification import (
    SpecificationCreate, SpecificationUpdate, 
    SpecificationResponse, SpecificationListResponse
)

router = APIRouter()


def _build_response(spec: Specification) -> SpecificationResponse:
    """构建响应"""
    return SpecificationResponse(
        id=spec.id,
        name=spec.name,
        category_id=spec.category_id,
        category_name=spec.category.name if spec.category else None,
        sort_order=spec.sort_order,
        is_active=spec.is_active,
        created_at=spec.created_at)

@router.get("/", response_model=SpecificationListResponse)
async def list_specifications(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    category_id: Optional[int] = Query(None, description="分类ID筛选"),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None)) -> Any:
    """获取规格列表"""
    query = select(Specification).options(selectinload(Specification.category))
    
    conditions = []
    if category_id is not None:
        # 包含通用规格（category_id为空）和指定分类的规格
        conditions.append(
            (Specification.category_id == category_id) | (Specification.category_id.is_(None))
        )
    if is_active is not None:
        conditions.append(Specification.is_active == is_active)
    if search:
        conditions.append(Specification.name.ilike(f"%{search}%"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count(Specification.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0
    
    # 排序和分页
    query = query.order_by(Specification.category_id.nullsfirst(), Specification.sort_order, Specification.id)
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    specs = result.scalars().unique().all()
    
    return SpecificationListResponse(
        data=[_build_response(s) for s in specs],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/{spec_id}", response_model=SpecificationResponse)
async def get_specification(
    *,
    db: AsyncSession = Depends(get_db),
    spec_id: int) -> Any:
    """获取规格详情"""
    result = await db.execute(
        select(Specification).options(selectinload(Specification.category)).where(Specification.id == spec_id)
    )
    spec = result.scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="规格不存在")
    
    return _build_response(spec)

@router.post("/", response_model=SpecificationResponse)
async def create_specification(
    *,
    db: AsyncSession = Depends(get_db),
    spec_in: SpecificationCreate) -> Any:
    """创建规格"""
    # 检查分类
    if spec_in.category_id:
        cat = await db.get(Category, spec_in.category_id)
        if not cat:
            raise HTTPException(status_code=400, detail="分类不存在")
    
    # 检查名称唯一性（同分类内）
    existing = await db.execute(
        select(Specification).where(
            and_(
                Specification.name == spec_in.name,
                Specification.category_id == spec_in.category_id
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该分类下已存在同名规格")
    
    spec = Specification(
        name=spec_in.name,
        category_id=spec_in.category_id,
        sort_order=spec_in.sort_order,
        created_by=1)
    db.add(spec)
    await db.commit()
    
    # 重新加载以获取关联
    result = await db.execute(
        select(Specification).options(selectinload(Specification.category)).where(Specification.id == spec.id)
    )
    spec = result.scalar_one()
    
    return _build_response(spec)

@router.put("/{spec_id}", response_model=SpecificationResponse)
async def update_specification(
    *,
    db: AsyncSession = Depends(get_db),
    spec_id: int,
    spec_in: SpecificationUpdate) -> Any:
    """更新规格"""
    result = await db.execute(
        select(Specification).options(selectinload(Specification.category)).where(Specification.id == spec_id)
    )
    spec = result.scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="规格不存在")
    
    # 检查名称唯一性
    if spec_in.name and spec_in.name != spec.name:
        cat_id = spec_in.category_id if spec_in.category_id is not None else spec.category_id
        existing = await db.execute(
            select(Specification).where(
                and_(
                    Specification.name == spec_in.name,
                    Specification.category_id == cat_id,
                    Specification.id != spec_id
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该分类下已存在同名规格")
    
    # 更新字段
    update_data = spec_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(spec, field, value)
    
    await db.commit()
    await db.refresh(spec)
    
    return _build_response(spec)

@router.delete("/{spec_id}")
async def delete_specification(
    *,
    db: AsyncSession = Depends(get_db),
    spec_id: int) -> Any:
    """删除规格"""
    from app.models.v3.product import Product
    
    spec = await db.get(Specification, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="规格不存在")
    
    # 检查是否有商品引用该规格
    products_count = (await db.execute(
        select(func.count(Product.id)).where(Product.specification_id == spec_id)
    )).scalar() or 0
    
    if products_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该规格已被 {products_count} 个商品使用，无法删除"
        )
    
    await db.delete(spec)
    await db.commit()
    
    return {"message": "删除成功"}

