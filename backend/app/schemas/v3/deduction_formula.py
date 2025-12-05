"""扣重公式Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal


class DeductionFormulaBase(BaseModel):
    """扣重公式基础字段"""
    name: str = Field(..., min_length=1, max_length=50, description="公式名称")
    formula_type: str = Field(
        default="none", 
        pattern="^(none|percentage|fixed|fixed_per_unit)$",
        description="公式类型：none/percentage/fixed/fixed_per_unit"
    )
    value: Decimal = Field(default=Decimal("1.00"), description="公式参数值")
    description: Optional[str] = Field(None, max_length=200, description="描述说明")
    is_default: bool = Field(default=False, description="是否默认")
    is_active: bool = Field(default=True, description="是否启用")
    sort_order: int = Field(default=0, ge=0, description="排序")


class DeductionFormulaCreate(DeductionFormulaBase):
    """创建扣重公式"""
    pass


class DeductionFormulaUpdate(BaseModel):
    """更新扣重公式"""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="公式名称")
    formula_type: Optional[str] = Field(None, pattern="^(none|percentage|fixed|fixed_per_unit)$")
    value: Optional[Decimal] = Field(None, description="公式参数值")
    description: Optional[str] = Field(None, max_length=200)
    is_default: Optional[bool] = Field(None)
    is_active: Optional[bool] = Field(None)
    sort_order: Optional[int] = Field(None, ge=0)


class DeductionFormulaResponse(DeductionFormulaBase):
    """扣重公式响应"""
    id: int
    formula_display: str = ""
    type_display: str = ""
    creator_name: str = ""
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeductionFormulaListResponse(BaseModel):
    """扣重公式列表响应"""
    data: List[DeductionFormulaResponse]
    total: int


class DeductionFormulaSimple(BaseModel):
    """扣重公式简要信息（用于下拉选择）"""
    id: int
    name: str
    formula_type: str
    value: Decimal
    formula_display: str
    is_default: bool


# ===== 计算请求/响应 =====
class CalculateNetWeightRequest(BaseModel):
    """计算净重请求"""
    formula_id: int = Field(..., description="公式ID")
    gross_weight: Decimal = Field(..., gt=0, description="毛重")
    unit_count: int = Field(default=1, ge=1, description="件数（按件扣重时使用）")


class CalculateNetWeightResponse(BaseModel):
    """计算净重响应"""
    gross_weight: Decimal
    net_weight: Decimal
    tare_weight: Decimal
    formula_name: str
    formula_display: str

