"""商品分类API"""

from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.category import Category
from app.models.v3.product import Product
from app.schemas.v3.category import (
    CategoryCreate, CategoryUpdate, CategoryResponse, 
    CategoryListResponse, CategoryTreeNode
)

router = APIRouter()


def _generate_category_code(parent_code: Optional[str], seq: int) -> str:
    """生成分类编码"""
    if parent_code:
        return f"{parent_code}{seq:02d}"
    return f"C{seq:02d}"

async def _get_next_seq(db: AsyncSession, parent_id: Optional[int]) -> int:
    """获取下一个序号"""
    result = await db.execute(
        select(func.count()).where(Category.parent_id == parent_id)
    )
    return (result.scalar() or 0) + 1

def _build_response(cat: Category) -> CategoryResponse:
    """构建响应"""
    children_count = len(cat.children) if cat.children else 0
    products_count = len(cat.products) if cat.products else 0
    return CategoryResponse(
        id=cat.id,
        name=cat.name,
        code=cat.code,
        parent_id=cat.parent_id,
        parent_name=cat.parent.name if cat.parent else None,
        level=cat.level,
        description=cat.description,
        sort_order=cat.sort_order,
        is_active=cat.is_active,
        children_count=children_count,
        products_count=products_count,
        created_at=cat.created_at)

@router.get("/", response_model=CategoryListResponse)
async def list_categories(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    parent_id: Optional[int] = Query(None, description="父分类ID，不传则获取所有"),
    level: Optional[int] = Query(None, description="层级筛选"),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None)) -> Any:
    """获取分类列表"""
    query = select(Category).options(
        selectinload(Category.parent),
        selectinload(Category.children),
        selectinload(Category.products))
    
    conditions = []
    if parent_id is not None:
        conditions.append(Category.parent_id == parent_id)
    if level is not None:
        conditions.append(Category.level == level)
    if is_active is not None:
        conditions.append(Category.is_active == is_active)
    if search:
        conditions.append(Category.name.ilike(f"%{search}%"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count(Category.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = (await db.execute(count_query)).scalar() or 0
    
    # 排序和分页
    query = query.order_by(Category.level, Category.sort_order, Category.id)
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    categories = result.scalars().unique().all()
    
    return CategoryListResponse(
        data=[_build_response(c) for c in categories],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/tree", response_model=List[CategoryTreeNode])
async def get_category_tree(
    *,
    db: AsyncSession = Depends(get_db),
    is_active: Optional[bool] = Query(True)) -> Any:
    """获取分类树"""
    query = select(Category).options(
        selectinload(Category.children),
        selectinload(Category.products))
    
    if is_active is not None:
        query = query.where(Category.is_active == is_active)
    
    query = query.order_by(Category.level, Category.sort_order)
    result = await db.execute(query)
    all_categories = result.scalars().unique().all()
    
    # 构建树
    cat_map = {c.id: c for c in all_categories}
    roots = []
    
    def build_node(cat: Category) -> CategoryTreeNode:
        children_list = [build_node(cat_map[child.id]) for child in cat.children if child.id in cat_map]
        return CategoryTreeNode(
            id=cat.id,
            name=cat.name,
            code=cat.code,
            parent_id=cat.parent_id,
            level=cat.level,
            description=cat.description,
            sort_order=cat.sort_order,
            is_active=cat.is_active,
            children_count=len(cat.children),
            products_count=len(cat.products) if cat.products else 0,
            created_at=cat.created_at,
            children=children_list)
    
    for cat in all_categories:
        if cat.parent_id is None:
            roots.append(build_node(cat))
    
    return roots

@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_id: int) -> Any:
    """获取分类详情"""
    result = await db.execute(
        select(Category).options(
            selectinload(Category.parent),
            selectinload(Category.children),
            selectinload(Category.products)).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    
    return _build_response(cat)

@router.post("/", response_model=CategoryResponse)
async def create_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_in: CategoryCreate) -> Any:
    """创建分类"""
    # 检查父分类
    parent = None
    parent_code = None
    level = 1
    if category_in.parent_id:
        parent = await db.get(Category, category_in.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="父分类不存在")
        parent_code = parent.code
        level = parent.level + 1
    
    # 检查名称唯一性（同级别内）
    existing = await db.execute(
        select(Category).where(
            and_(
                Category.name == category_in.name,
                Category.parent_id == category_in.parent_id
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="同级别下已存在同名分类")
    
    # 生成编码
    seq = await _get_next_seq(db, category_in.parent_id)
    code = _generate_category_code(parent_code, seq)
    
    cat = Category(
        name=category_in.name,
        code=code,
        parent_id=category_in.parent_id,
        level=level,
        description=category_in.description,
        sort_order=category_in.sort_order,
        created_by=1)
    db.add(cat)
    await db.commit()
    
    # 重新加载带关系的完整分类对象
    result = await db.execute(
        select(Category).options(
            selectinload(Category.parent),
            selectinload(Category.children),
            selectinload(Category.products)).where(Category.id == cat.id)
    )
    cat = result.scalar_one()
    
    return _build_response(cat)

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_id: int,
    category_in: CategoryUpdate) -> Any:
    """更新分类"""
    result = await db.execute(
        select(Category).options(
            selectinload(Category.parent),
            selectinload(Category.children),
            selectinload(Category.products)).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    
    # 检查名称唯一性
    if category_in.name and category_in.name != cat.name:
        existing = await db.execute(
            select(Category).where(
                and_(
                    Category.name == category_in.name,
                    Category.parent_id == cat.parent_id,
                    Category.id != category_id
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="同级别下已存在同名分类")
    
    # 更新字段
    update_data = category_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cat, field, value)
    
    await db.commit()
    await db.refresh(cat)
    
    return _build_response(cat)

@router.delete("/{category_id}")
async def delete_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_id: int) -> Any:
    """删除分类"""
    result = await db.execute(
        select(Category).options(
            selectinload(Category.children),
            selectinload(Category.products)).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    
    if cat.children:
        raise HTTPException(status_code=400, detail="该分类下有子分类，无法删除")
    
    if cat.products:
        raise HTTPException(status_code=400, detail="该分类下有商品，无法删除")
    
    await db.delete(cat)
    await db.commit()
    
    return {"message": "删除成功"}

