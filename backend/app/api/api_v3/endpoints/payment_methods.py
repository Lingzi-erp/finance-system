"""收付款方式管理 API"""
from typing import Any, List, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.payment_method import PaymentMethod
from app.models.v3.entity import Entity
from app.schemas.v3.payment_method import (
    PaymentMethodCreate,
    PaymentMethodUpdate,
    PaymentMethodResponse,
    PaymentMethodListResponse,
    PaymentMethodSimpleResponse)

router = APIRouter()

def build_response(method: PaymentMethod) -> PaymentMethodResponse:
    """构建响应对象"""
    return PaymentMethodResponse(
        id=method.id,
        name=method.name,
        method_type=method.method_type,
        account_no=method.account_no,
        account_name=method.account_name,
        bank_name=method.bank_name,
        is_proxy=method.is_proxy,
        proxy_entity_id=method.proxy_entity_id,
        proxy_balance=float(method.proxy_balance or 0),
        proxy_entity_name=method.proxy_entity.name if method.proxy_entity else "",
        notes=method.notes,
        is_default=method.is_default,
        is_active=method.is_active,
        sort_order=method.sort_order,
        type_display=method.type_display,
        display_name=method.display_name,
        icon=method.icon,
        created_by=method.created_by,
        created_at=method.created_at,
        updated_at=method.updated_at)

@router.get("/", response_model=PaymentMethodListResponse)
async def list_payment_methods(
    *,
    db: AsyncSession = Depends(get_db),
    method_type: Optional[str] = Query(None, description="按类型筛选"),
    is_proxy: Optional[bool] = Query(None, description="是否代收账户"),
    is_active: Optional[bool] = Query(True, description="是否启用"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)) -> Any:
    """获取收付款方式列表"""
    query = select(PaymentMethod).options(selectinload(PaymentMethod.proxy_entity))
    
    if method_type:
        query = query.where(PaymentMethod.method_type == method_type)
    if is_proxy is not None:
        query = query.where(PaymentMethod.is_proxy == is_proxy)
    if is_active is not None:
        query = query.where(PaymentMethod.is_active == is_active)
    if search:
        query = query.where(
            or_(
                PaymentMethod.name.ilike(f"%{search}%"),
                PaymentMethod.account_no.ilike(f"%{search}%"),
                PaymentMethod.account_name.ilike(f"%{search}%"))
        )
    
    # 计算总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()
    
    # 分页和排序
    query = query.order_by(PaymentMethod.sort_order, PaymentMethod.id)
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    methods = result.scalars().all()
    
    return PaymentMethodListResponse(
        data=[build_response(m) for m in methods],
        total=total,
        page=page,
        page_size=page_size)

@router.get("/simple", response_model=List[PaymentMethodSimpleResponse])
async def list_simple(
    *,
    db: AsyncSession = Depends(get_db),
    is_active: bool = Query(True)) -> Any:
    """获取简单列表（用于下拉选择）"""
    query = (
        select(PaymentMethod)
        .options(selectinload(PaymentMethod.proxy_entity))
        .where(PaymentMethod.is_active == is_active)
        .order_by(PaymentMethod.sort_order, PaymentMethod.id)
    )
    result = await db.execute(query)
    methods = result.scalars().all()
    
    return [
        PaymentMethodSimpleResponse(
            id=m.id,
            name=m.name,
            method_type=m.method_type,
            type_display=m.type_display,
            display_name=m.display_name,
            icon=m.icon,
            is_proxy=m.is_proxy,
            proxy_balance=float(m.proxy_balance or 0))
        for m in methods
    ]

@router.get("/{method_id}", response_model=PaymentMethodResponse)
async def get_payment_method(
    *,
    db: AsyncSession = Depends(get_db),
    method_id: int) -> Any:
    """获取单个收付款方式"""
    query = (
        select(PaymentMethod)
        .options(selectinload(PaymentMethod.proxy_entity))
        .where(PaymentMethod.id == method_id)
    )
    result = await db.execute(query)
    method = result.scalar_one_or_none()
    
    if not method:
        raise HTTPException(status_code=404, detail="收付款方式不存在")
    
    return build_response(method)

@router.post("/", response_model=PaymentMethodResponse)
async def create_payment_method(
    *,
    db: AsyncSession = Depends(get_db),
    data: PaymentMethodCreate) -> Any:
    """创建收付款方式"""
    # 如果是代收账户，验证实体
    if data.is_proxy and data.proxy_entity_id:
        entity = await db.get(Entity, data.proxy_entity_id)
        if not entity:
            raise HTTPException(status_code=400, detail="代收人实体不存在")
    
    # 如果设为默认，取消其他默认
    if data.is_default:
        await db.execute(
            PaymentMethod.__table__.update().values(is_default=False)
        )
    
    method = PaymentMethod(
        **data.model_dump(),
        created_by=1)
    db.add(method)
    await db.commit()
    await db.refresh(method)
    
    # 重新加载关系
    query = (
        select(PaymentMethod)
        .options(selectinload(PaymentMethod.proxy_entity))
        .where(PaymentMethod.id == method.id)
    )
    result = await db.execute(query)
    method = result.scalar_one()
    
    return build_response(method)

@router.put("/{method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    *,
    db: AsyncSession = Depends(get_db),
    method_id: int,
    data: PaymentMethodUpdate) -> Any:
    """更新收付款方式"""
    method = await db.get(PaymentMethod, method_id)
    if not method:
        raise HTTPException(status_code=404, detail="收付款方式不存在")
    
    # 如果是代收账户，验证实体
    if data.is_proxy and data.proxy_entity_id:
        entity = await db.get(Entity, data.proxy_entity_id)
        if not entity:
            raise HTTPException(status_code=400, detail="代收人实体不存在")
    
    # 如果设为默认，取消其他默认
    if data.is_default:
        await db.execute(
            PaymentMethod.__table__.update()
            .where(PaymentMethod.id != method_id)
            .values(is_default=False)
        )
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(method, field, value)
    
    method.updated_at = datetime.utcnow()
    await db.commit()
    
    # 重新加载关系
    query = (
        select(PaymentMethod)
        .options(selectinload(PaymentMethod.proxy_entity))
        .where(PaymentMethod.id == method.id)
    )
    result = await db.execute(query)
    method = result.scalar_one()
    
    return build_response(method)

@router.delete("/{method_id}")
async def delete_payment_method(
    *,
    db: AsyncSession = Depends(get_db),
    method_id: int) -> Any:
    """删除收付款方式"""
    method = await db.get(PaymentMethod, method_id)
    if not method:
        raise HTTPException(status_code=404, detail="收付款方式不存在")
    
    # 检查是否有关联的收付款记录
    from app.models.v3.payment_record import PaymentRecord
    count_query = select(func.count()).where(PaymentRecord.payment_method_id == method_id)
    count = (await db.execute(count_query)).scalar_one()
    if count > 0:
        raise HTTPException(status_code=400, detail=f"该收付款方式已有 {count} 条收付款记录，无法删除")
    
    await db.delete(method)
    await db.commit()
    
    return {"message": "删除成功"}

@router.post("/init-defaults")
async def init_default_methods(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """初始化默认收付款方式"""
    # 检查是否已有数据
    count_query = select(func.count()).select_from(PaymentMethod)
    count = (await db.execute(count_query)).scalar_one()
    if count > 0:
        return {"message": f"已有 {count} 种收付款方式，跳过初始化", "created": 0}
    
    default_methods = [
        {
            "name": "现金",
            "method_type": "cash",
            "is_default": True,
            "sort_order": 1,
        },
        {
            "name": "银行转账",
            "method_type": "bank",
            "sort_order": 2,
        },
        {
            "name": "微信收款",
            "method_type": "wechat",
            "sort_order": 3,
        },
        {
            "name": "支付宝收款",
            "method_type": "alipay",
            "sort_order": 4,
        },
    ]
    
    created = 0
    for data in default_methods:
        method = PaymentMethod(**data, created_by=1)
        db.add(method)
        created += 1
    
    await db.commit()
    
    return {"message": "初始化成功", "created": created}

