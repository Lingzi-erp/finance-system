"""扣重公式管理API"""

from typing import Any, Optional, List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.deduction_formula import DeductionFormula
from app.schemas.v3.deduction_formula import (
    DeductionFormulaCreate, DeductionFormulaUpdate,
    DeductionFormulaResponse, DeductionFormulaListResponse,
    DeductionFormulaSimple,
    CalculateNetWeightRequest, CalculateNetWeightResponse)

router = APIRouter()

def build_formula_response(formula: DeductionFormula) -> DeductionFormulaResponse:
    """构建公式响应"""
    return DeductionFormulaResponse(
        id=formula.id,
        name=formula.name,
        formula_type=formula.formula_type,
        value=formula.value,
        description=formula.description,
        is_default=formula.is_default,
        is_active=formula.is_active,
        sort_order=formula.sort_order,
        formula_display=formula.formula_display,
        type_display=formula.type_display,
        creator_name=formula.creator.username if formula.creator else "",
        created_at=formula.created_at,
        updated_at=formula.updated_at)

@router.get("/", response_model=DeductionFormulaListResponse)
async def list_formulas(
    *,
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(True, description="仅显示启用的公式")) -> Any:
    """获取扣重公式列表"""
    query = select(DeductionFormula).options(
        selectinload(DeductionFormula.creator)
    )
    
    if active_only:
        query = query.where(DeductionFormula.is_active == True)
    
    query = query.order_by(DeductionFormula.sort_order, DeductionFormula.id)
    
    result = await db.execute(query)
    formulas = result.scalars().all()
    
    return DeductionFormulaListResponse(
        data=[build_formula_response(f) for f in formulas],
        total=len(formulas))

@router.get("/simple", response_model=List[DeductionFormulaSimple])
async def list_formulas_simple(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取扣重公式简要列表（用于下拉选择）"""
    query = select(DeductionFormula).where(
        DeductionFormula.is_active == True
    ).order_by(DeductionFormula.sort_order, DeductionFormula.id)
    
    result = await db.execute(query)
    formulas = result.scalars().all()
    
    return [
        DeductionFormulaSimple(
            id=f.id,
            name=f.name,
            formula_type=f.formula_type,
            value=f.value,
            formula_display=f.formula_display,
            is_default=f.is_default)
        for f in formulas
    ]

@router.get("/{formula_id}", response_model=DeductionFormulaResponse)
async def get_formula(
    *,
    db: AsyncSession = Depends(get_db),
    formula_id: int) -> Any:
    """获取扣重公式详情"""
    result = await db.execute(
        select(DeductionFormula).options(
            selectinload(DeductionFormula.creator)
        ).where(DeductionFormula.id == formula_id)
    )
    formula = result.scalar_one_or_none()
    
    if not formula:
        raise HTTPException(status_code=404, detail="公式不存在")
    
    return build_formula_response(formula)

@router.post("/", response_model=DeductionFormulaResponse)
async def create_formula(
    *,
    db: AsyncSession = Depends(get_db),
    formula_in: DeductionFormulaCreate) -> Any:
    """创建扣重公式"""
    # 检查名称是否重复
    existing = await db.execute(
        select(DeductionFormula).where(DeductionFormula.name == formula_in.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="公式名称已存在")
    
    # 如果设为默认，取消其他默认
    if formula_in.is_default:
        await db.execute(
            select(DeductionFormula).where(DeductionFormula.is_default == True)
        )
        # 使用原生SQL更新
        from sqlalchemy import update
        await db.execute(
            update(DeductionFormula).where(DeductionFormula.is_default == True).values(is_default=False)
        )
    
    formula = DeductionFormula(
        name=formula_in.name,
        formula_type=formula_in.formula_type,
        value=formula_in.value,
        description=formula_in.description,
        is_default=formula_in.is_default,
        is_active=formula_in.is_active,
        sort_order=formula_in.sort_order,
        created_by=1)
    db.add(formula)
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(DeductionFormula).options(
            selectinload(DeductionFormula.creator)
        ).where(DeductionFormula.id == formula.id)
    )
    formula = result.scalar_one()
    
    return build_formula_response(formula)

@router.put("/{formula_id}", response_model=DeductionFormulaResponse)
async def update_formula(
    *,
    db: AsyncSession = Depends(get_db),
    formula_id: int,
    formula_in: DeductionFormulaUpdate) -> Any:
    """更新扣重公式"""
    formula = await db.get(DeductionFormula, formula_id)
    if not formula:
        raise HTTPException(status_code=404, detail="公式不存在")
    
    # 检查名称是否重复
    if formula_in.name and formula_in.name != formula.name:
        existing = await db.execute(
            select(DeductionFormula).where(
                and_(
                    DeductionFormula.name == formula_in.name,
                    DeductionFormula.id != formula_id
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="公式名称已存在")
    
    # 如果设为默认，取消其他默认
    if formula_in.is_default:
        from sqlalchemy import update
        await db.execute(
            update(DeductionFormula).where(
                and_(
                    DeductionFormula.is_default == True,
                    DeductionFormula.id != formula_id
                )
            ).values(is_default=False)
        )
    
    update_data = formula_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(formula, field, value)
    
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(DeductionFormula).options(
            selectinload(DeductionFormula.creator)
        ).where(DeductionFormula.id == formula_id)
    )
    formula = result.scalar_one()
    
    return build_formula_response(formula)

@router.delete("/{formula_id}")
async def delete_formula(
    *,
    db: AsyncSession = Depends(get_db),
    formula_id: int) -> Any:
    """删除扣重公式"""
    formula = await db.get(DeductionFormula, formula_id)
    if not formula:
        raise HTTPException(status_code=404, detail="公式不存在")
    
    await db.delete(formula)
    await db.commit()
    
    return {"message": "删除成功"}

@router.post("/calculate", response_model=CalculateNetWeightResponse)
async def calculate_net_weight(
    *,
    db: AsyncSession = Depends(get_db),
    request: CalculateNetWeightRequest) -> Any:
    """根据公式计算净重"""
    formula = await db.get(DeductionFormula, request.formula_id)
    if not formula:
        raise HTTPException(status_code=404, detail="公式不存在")
    
    net_weight = formula.calculate_net_weight(request.gross_weight, request.unit_count)
    tare_weight = request.gross_weight - net_weight
    
    return CalculateNetWeightResponse(
        gross_weight=request.gross_weight,
        net_weight=net_weight,
        tare_weight=tare_weight,
        formula_name=formula.name,
        formula_display=formula.formula_display)

@router.post("/init-defaults")
async def init_default_formulas(
    *,
    db: AsyncSession = Depends(get_db),
    force: bool = Query(False, description="是否强制重新初始化（会删除现有公式）")) -> Any:
    """初始化默认扣重公式"""
    from sqlalchemy import delete
    
    # 如果强制重新初始化，先删除现有公式
    if force:
        await db.execute(delete(DeductionFormula))
        await db.commit()
    else:
        # 检查是否已有公式
        existing = await db.execute(select(func.count(DeductionFormula.id)))
        if existing.scalar() > 0:
            return {"message": "已存在公式，跳过初始化（使用 force=true 可强制重新初始化）", "created": 0}
    
    default_formulas = [
        {
            "name": "不扣重",
            "formula_type": "none",
            "value": Decimal("1.00"),
            "description": "净重等于毛重，不扣除任何重量",
            "is_default": True,
            "sort_order": 1,
        },
        {
            "name": "扣1%",
            "formula_type": "percentage",
            "value": Decimal("0.99"),
            "description": "扣除1%的冰块/包装重量，净重=毛重×0.99",
            "sort_order": 2,
        },
        {
            "name": "每件扣0.5kg",
            "formula_type": "fixed_per_unit",
            "value": Decimal("0.50"),
            "description": "按件扣重，净重=毛重-(件数×0.5kg)，适用于有冰块包装的散件",
            "sort_order": 3,
        },
    ]
    
    for data in default_formulas:
        formula = DeductionFormula(
            **data,
            created_by=1)
        db.add(formula)
    
    await db.commit()
    
    return {
        "message": "初始化成功",
        "created": len(default_formulas),
    }

