"""单位相关Schema"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ========== 单位组 ==========

class UnitGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="单位组名称")
    base_unit: str = Field(..., min_length=1, max_length=20, description="基准单位")
    description: Optional[str] = Field(None, max_length=200)


class UnitGroupCreate(UnitGroupBase):
    pass


class UnitGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    base_unit: Optional[str] = Field(None, min_length=1, max_length=20)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class UnitInGroup(BaseModel):
    """单位组内的单位"""
    id: int
    name: str
    symbol: str
    conversion_rate: float
    is_base: bool
    
    class Config:
        from_attributes = True


class UnitGroupResponse(UnitGroupBase):
    id: int
    is_active: bool
    units: List[UnitInGroup] = []
    created_at: datetime
    
    class Config:
        from_attributes = True


class UnitGroupListResponse(BaseModel):
    data: List[UnitGroupResponse]
    total: int


# ========== 单位 ==========

class UnitBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    symbol: str = Field(..., min_length=1, max_length=10)
    conversion_rate: float = Field(1.0, gt=0, description="换算到基准单位的系数")
    is_base: bool = Field(False, description="是否为基准单位")
    sort_order: int = Field(0, ge=0)


class UnitCreate(UnitBase):
    group_id: int


class UnitUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    symbol: Optional[str] = Field(None, min_length=1, max_length=10)
    conversion_rate: Optional[float] = Field(None, gt=0)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class UnitResponse(UnitBase):
    id: int
    group_id: int
    group_name: str = ""
    is_active: bool
    
    class Config:
        from_attributes = True


# ========== 复式单位 ==========

class CompositeUnitBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="复式单位名称")
    container_name: str = Field(..., min_length=1, max_length=20, description="容器名称，如：件、箱")
    quantity: float = Field(..., gt=0, description="每个容器包含的数量")
    unit_id: int = Field(..., description="内容单位ID")
    description: Optional[str] = Field(None, max_length=100)


class CompositeUnitCreate(BaseModel):
    """创建复式单位 - name可选，会自动生成"""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="复式单位名称（可选，自动生成）")
    container_name: str = Field(..., min_length=1, max_length=20, description="容器名称，如：件、箱")
    quantity: float = Field(..., gt=0, description="每个容器包含的数量")
    unit_id: int = Field(..., description="内容单位ID")
    description: Optional[str] = Field(None, max_length=100)


class CompositeUnitUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    container_name: Optional[str] = Field(None, min_length=1, max_length=20)
    quantity: Optional[float] = Field(None, gt=0)
    unit_id: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CompositeUnitResponse(CompositeUnitBase):
    id: int
    is_active: bool
    display_name: str = ""  # 如：件(20kg)
    unit_name: str = ""
    unit_symbol: str = ""
    created_at: datetime
    
    class Config:
        from_attributes = True


class CompositeUnitListResponse(BaseModel):
    data: List[CompositeUnitResponse]
    total: int
    page: int
    limit: int

