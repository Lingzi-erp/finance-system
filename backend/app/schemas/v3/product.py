"""商品Schema - 纯粹的物品信息"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.v3.product_spec import ProductSpecResponse, ProductSpecCreate


class ProductBase(BaseModel):
    """商品基础字段"""
    name: str = Field(..., min_length=1, max_length=100, description="品名")
    specification: Optional[str] = Field(None, max_length=200, description="规格型号")
    unit: str = Field(default="个", max_length=20, description="计量单位")
    unit_id: Optional[int] = Field(None, description="基本单位ID")
    category: Optional[str] = Field(None, max_length=50, description="分类")
    cost_price: float = Field(default=0, ge=0, description="成本价/进货价")
    suggested_price: Optional[float] = Field(None, ge=0, description="建议售价")
    description: Optional[str] = Field(None, description="描述")
    is_active: bool = Field(default=True, description="是否启用")


class ProductCreate(ProductBase):
    """创建商品"""
    specs: Optional[List[ProductSpecCreate]] = Field(default=None, description="包装规格列表")


class ProductUpdate(BaseModel):
    """更新商品"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    specification: Optional[str] = None
    unit: Optional[str] = None
    unit_id: Optional[int] = None
    category: Optional[str] = None
    cost_price: Optional[float] = Field(None, ge=0)
    suggested_price: Optional[float] = Field(None, ge=0)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    specs: Optional[List[ProductSpecCreate]] = Field(default=None, description="包装规格列表（提供时会替换现有规格）")


class ProductResponse(ProductBase):
    """商品响应"""
    id: int
    code: str
    created_by: int
    created_at: datetime
    updated_at: datetime
    # 包装规格列表（从 ProductSpec 获取）
    specs: List[ProductSpecResponse] = Field(default_factory=list, description="包装规格列表")

    class Config:
        from_attributes = True


class ProductListResponse(BaseModel):
    """商品列表响应"""
    data: List[ProductResponse]
    total: int
    page: int
    limit: int

