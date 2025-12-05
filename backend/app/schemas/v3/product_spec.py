"""商品包装规格 Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class ProductSpecBase(BaseModel):
    """包装规格基础字段"""
    name: str = Field(..., min_length=1, max_length=50, description="规格名称，如：大箱、小箱、散装")
    container_name: str = Field(..., min_length=1, max_length=20, description="容器/单位名称，如：箱、件、kg")
    quantity: float = Field(default=1.0, gt=0, description="每个容器包含的基础单位数量")
    unit_id: int = Field(..., description="基础单位ID")
    is_default: bool = Field(default=False, description="是否为默认规格")
    is_active: bool = Field(default=True, description="是否启用")
    sort_order: int = Field(default=0, description="排序")


class ProductSpecCreate(ProductSpecBase):
    """创建包装规格"""
    product_id: Optional[int] = Field(None, description="商品ID（批量创建时可选）")


class ProductSpecUpdate(BaseModel):
    """更新包装规格"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    container_name: Optional[str] = Field(None, min_length=1, max_length=20)
    quantity: Optional[float] = Field(None, gt=0)
    unit_id: Optional[int] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ProductSpecResponse(ProductSpecBase):
    """包装规格响应"""
    id: int
    product_id: int
    created_at: datetime
    updated_at: datetime
    
    # 展开的单位信息
    unit_symbol: Optional[str] = None
    display_name: Optional[str] = None
    is_bulk: bool = False

    class Config:
        from_attributes = True


class ProductSpecListResponse(BaseModel):
    """包装规格列表响应"""
    data: List[ProductSpecResponse]
    total: int

