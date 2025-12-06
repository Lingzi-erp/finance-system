"""商品管理API（单机版）"""

from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.product import Product
from app.models.v3.product_spec import ProductSpec
from app.models.v3.unit import CompositeUnit, Unit
from app.models.v3.order_item import OrderItem
from app.models.v3.stock import Stock, StockFlow
from app.schemas.v3.product import (
    ProductCreate, ProductUpdate, ProductResponse, ProductListResponse
)
from app.schemas.v3.product_spec import (
    ProductSpecCreate, ProductSpecUpdate, ProductSpecResponse, ProductSpecListResponse
)

router = APIRouter()


async def generate_product_code(db: AsyncSession) -> str:
    """生成商品编码"""
    result = await db.execute(
        select(func.max(Product.code)).where(Product.code.like("G%"))
    )
    max_code = result.scalar()
    
    if max_code:
        try:
            num = int(max_code[1:]) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    
    return f"G{num:05d}"


async def build_spec_response(spec: ProductSpec, db: AsyncSession) -> dict:
    """构建包装规格响应"""
    unit = await db.get(Unit, spec.unit_id) if spec.unit_id else None
    unit_symbol = unit.symbol if unit else ""
    
    # 计算 display_name
    if unit:
        if spec.quantity == 1 and spec.container_name == unit.symbol:
            display_name = f"散装({unit.symbol})"
        else:
            qty = int(spec.quantity) if spec.quantity == int(spec.quantity) else spec.quantity
            display_name = f"{spec.container_name}({qty}{unit.symbol})"
    else:
        display_name = spec.name
    
    # 判断是否散装
    is_bulk = spec.quantity == 1 and unit and spec.container_name == unit.symbol
    
    return {
        "id": spec.id,
        "product_id": spec.product_id,
        "name": spec.name,
        "container_name": spec.container_name,
        "quantity": spec.quantity,
        "unit_id": spec.unit_id,
        "is_default": spec.is_default,
        "is_active": spec.is_active,
        "sort_order": spec.sort_order,
        "created_at": spec.created_at,
        "updated_at": spec.updated_at,
        "unit_symbol": unit_symbol,
        "display_name": display_name,
        "is_bulk": is_bulk,
    }


async def build_product_response(product: Product, db: AsyncSession) -> dict:
    """构建商品响应，包含复式单位信息和包装规格"""
    data = {
        "id": product.id,
        "code": product.code,
        "name": product.name,
        "specification": product.specification,
        "unit": product.unit,
        "unit_id": product.unit_id,
        "composite_unit_id": product.composite_unit_id,
        "category": product.category,
        "cost_price": product.cost_price,
        "suggested_price": product.suggested_price,
        "description": product.description,
        "is_active": product.is_active,
        "created_by": product.created_by,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
        "composite_unit_name": None,
        "composite_unit_quantity": None,
        "composite_unit_base_unit": None,
        "specs": [],
    }
    
    # 如果有复式单位，加载其信息（兼容旧数据）
    if product.composite_unit_id:
        composite = await db.get(CompositeUnit, product.composite_unit_id)
        if composite:
            data["composite_unit_name"] = composite.name
            data["composite_unit_quantity"] = composite.quantity
            base_unit = await db.get(Unit, composite.unit_id)
            if base_unit:
                data["composite_unit_base_unit"] = base_unit.symbol
    
    # 加载包装规格列表
    specs_result = await db.execute(
        select(ProductSpec)
        .where(ProductSpec.product_id == product.id)
        .order_by(ProductSpec.sort_order, ProductSpec.id)
    )
    specs = specs_result.scalars().all()
    
    for spec in specs:
        spec_data = await build_spec_response(spec, db)
        data["specs"].append(ProductSpecResponse(**spec_data))
    
    return data


@router.get("/", response_model=ProductListResponse)
async def list_products(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None, description="分类筛选"),
    search: Optional[str] = Query(None, description="搜索"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
) -> Any:
    """获取商品列表"""
    query = select(Product)
    conditions = []
    
    if category:
        conditions.append(Product.category == category)
    if is_active is not None:
        conditions.append(Product.is_active == is_active)
    if search:
        conditions.append(
            Product.name.contains(search) | 
            Product.code.contains(search)
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.order_by(Product.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    products = result.scalars().all()
    
    # 构建响应，包含复式单位信息
    product_responses = []
    for p in products:
        resp_data = await build_product_response(p, db)
        product_responses.append(ProductResponse(**resp_data))
    
    return ProductListResponse(
        data=product_responses,
        total=total,
        page=page,
        limit=limit
    )


@router.post("/", response_model=ProductResponse)
async def create_product(
    *,
    db: AsyncSession = Depends(get_db),
    product_in: ProductCreate,
) -> Any:
    """创建商品"""
    code = await generate_product_code(db)
    
    # 提取 specs，剩余字段用于创建商品
    product_data = product_in.model_dump(exclude={"specs"})
    
    product = Product(
        **product_data,
        code=code,
        created_by=1  # 单机版固定用户ID
    )
    
    db.add(product)
    await db.flush()  # 获取 product.id
    
    # 创建包装规格
    if product_in.specs:
        has_default = False
        for idx, spec_data in enumerate(product_in.specs):
            spec = ProductSpec(
                product_id=product.id,
                name=spec_data.name,
                container_name=spec_data.container_name,
                quantity=spec_data.quantity,
                unit_id=spec_data.unit_id,
                is_default=spec_data.is_default,
                is_active=spec_data.is_active,
                sort_order=spec_data.sort_order if spec_data.sort_order else idx,
            )
            if spec.is_default:
                has_default = True
            db.add(spec)
        
        # 确保至少有一个默认规格
        if not has_default and product_in.specs:
            # 将第一个设为默认
            pass  # 已经添加了，需要在 flush 后更新
    
    await db.commit()
    await db.refresh(product)
    
    resp_data = await build_product_response(product, db)
    return ProductResponse(**resp_data)


@router.get("/categories")
async def list_categories(
    *,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """获取所有分类"""
    result = await db.execute(
        select(Product.category).where(Product.category.isnot(None)).distinct()
    )
    categories = [r[0] for r in result.fetchall() if r[0]]
    return {"categories": categories}


@router.get("/units")
async def list_units() -> Any:
    """获取常用计量单位"""
    return {
        "units": [
            {"value": "个", "label": "个"},
            {"value": "件", "label": "件"},
            {"value": "箱", "label": "箱"},
            {"value": "套", "label": "套"},
            {"value": "台", "label": "台"},
            {"value": "只", "label": "只"},
            {"value": "把", "label": "把"},
            {"value": "张", "label": "张"},
            {"value": "瓶", "label": "瓶"},
            {"value": "包", "label": "包"},
            {"value": "卷", "label": "卷"},
            {"value": "kg", "label": "千克"},
            {"value": "g", "label": "克"},
            {"value": "t", "label": "吨"},
            {"value": "m", "label": "米"},
            {"value": "cm", "label": "厘米"},
            {"value": "L", "label": "升"},
            {"value": "mL", "label": "毫升"},
        ]
    }


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
) -> Any:
    """获取商品详情"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    resp_data = await build_product_response(product, db)
    return ProductResponse(**resp_data)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
    product_in: ProductUpdate,
) -> Any:
    """更新商品"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    update_data = product_in.model_dump(exclude_unset=True)
    
    # 处理 specs 更新
    specs_data = update_data.pop("specs", None)
    
    for field, value in update_data.items():
        setattr(product, field, value)
    
    # 如果提供了 specs，替换现有规格
    if specs_data is not None:
        # 删除现有规格
        existing_specs = await db.execute(
            select(ProductSpec).where(ProductSpec.product_id == product_id)
        )
        for spec in existing_specs.scalars().all():
            await db.delete(spec)
        
        # 创建新规格
        for idx, spec_data in enumerate(specs_data):
            spec = ProductSpec(
                product_id=product_id,
                name=spec_data.get("name"),
                container_name=spec_data.get("container_name"),
                quantity=spec_data.get("quantity", 1.0),
                unit_id=spec_data.get("unit_id"),
                is_default=spec_data.get("is_default", False),
                is_active=spec_data.get("is_active", True),
                sort_order=spec_data.get("sort_order", idx),
            )
            db.add(spec)
    
    await db.commit()
    await db.refresh(product)
    
    resp_data = await build_product_response(product, db)
    return ProductResponse(**resp_data)


@router.delete("/{product_id}")
async def delete_product(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
) -> Any:
    """删除商品"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    # 检查是否有关联订单明细
    order_items_count = (await db.execute(
        select(func.count(OrderItem.id)).where(OrderItem.product_id == product_id)
    )).scalar() or 0
    
    if order_items_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该商品已被 {order_items_count} 个业务单引用，无法删除"
        )
    
    # 检查是否有关联库存记录
    stocks_count = (await db.execute(
        select(func.count(Stock.id)).where(Stock.product_id == product_id)
    )).scalar() or 0
    
    if stocks_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该商品有 {stocks_count} 条库存记录，请先清空库存后再删除"
        )
    
    # 检查是否有关联库存流水记录（通过Stock关联）
    flows_count = (await db.execute(
        select(func.count(StockFlow.id))
        .select_from(StockFlow)
        .join(Stock, Stock.id == StockFlow.stock_id)
        .where(Stock.product_id == product_id)
    )).scalar() or 0
    
    if flows_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"该商品有 {flows_count} 条库存流水记录，无法删除"
        )
    
    await db.delete(product)
    await db.commit()
    
    return {"message": "删除成功"}


# ========== 包装规格管理 ==========

@router.get("/{product_id}/specs", response_model=ProductSpecListResponse)
async def list_product_specs(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
) -> Any:
    """获取商品的包装规格列表"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    result = await db.execute(
        select(ProductSpec)
        .where(ProductSpec.product_id == product_id)
        .order_by(ProductSpec.sort_order, ProductSpec.id)
    )
    specs = result.scalars().all()
    
    spec_responses = []
    for spec in specs:
        spec_data = await build_spec_response(spec, db)
        spec_responses.append(ProductSpecResponse(**spec_data))
    
    return ProductSpecListResponse(data=spec_responses, total=len(spec_responses))


@router.post("/{product_id}/specs", response_model=ProductSpecResponse)
async def add_product_spec(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
    spec_in: ProductSpecCreate,
) -> Any:
    """添加商品包装规格"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    # 如果设置为默认，取消其他默认
    if spec_in.is_default:
        await db.execute(
            select(ProductSpec)
            .where(ProductSpec.product_id == product_id, ProductSpec.is_default == True)
        )
        existing_defaults = (await db.execute(
            select(ProductSpec).where(
                ProductSpec.product_id == product_id,
                ProductSpec.is_default == True
            )
        )).scalars().all()
        for existing in existing_defaults:
            existing.is_default = False
    
    spec = ProductSpec(
        product_id=product_id,
        name=spec_in.name,
        container_name=spec_in.container_name,
        quantity=spec_in.quantity,
        unit_id=spec_in.unit_id,
        is_default=spec_in.is_default,
        is_active=spec_in.is_active,
        sort_order=spec_in.sort_order,
    )
    db.add(spec)
    await db.commit()
    await db.refresh(spec)
    
    spec_data = await build_spec_response(spec, db)
    return ProductSpecResponse(**spec_data)


@router.put("/{product_id}/specs/{spec_id}", response_model=ProductSpecResponse)
async def update_product_spec(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
    spec_id: int,
    spec_in: ProductSpecUpdate,
) -> Any:
    """更新商品包装规格"""
    spec = await db.get(ProductSpec, spec_id)
    if not spec or spec.product_id != product_id:
        raise HTTPException(status_code=404, detail="规格不存在")
    
    update_data = spec_in.model_dump(exclude_unset=True)
    
    # 如果设置为默认，取消其他默认
    if update_data.get("is_default"):
        existing_defaults = (await db.execute(
            select(ProductSpec).where(
                ProductSpec.product_id == product_id,
                ProductSpec.is_default == True,
                ProductSpec.id != spec_id
            )
        )).scalars().all()
        for existing in existing_defaults:
            existing.is_default = False
    
    for field, value in update_data.items():
        setattr(spec, field, value)
    
    await db.commit()
    await db.refresh(spec)
    
    spec_data = await build_spec_response(spec, db)
    return ProductSpecResponse(**spec_data)


@router.delete("/{product_id}/specs/{spec_id}")
async def delete_product_spec(
    *,
    db: AsyncSession = Depends(get_db),
    product_id: int,
    spec_id: int,
) -> Any:
    """删除商品包装规格"""
    spec = await db.get(ProductSpec, spec_id)
    if not spec or spec.product_id != product_id:
        raise HTTPException(status_code=404, detail="规格不存在")
    
    await db.delete(spec)
    await db.commit()
    
    return {"message": "删除成功"}
