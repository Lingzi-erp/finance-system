"""商品分类Schema"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="分类名称")
    parent_id: Optional[int] = Field(None, description="父分类ID")
    description: Optional[str] = Field(None, max_length=500)
    sort_order: int = Field(0, ge=0)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    parent_id: Optional[int] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(CategoryBase):
    id: int
    code: str
    level: int
    is_active: bool
    parent_name: Optional[str] = None
    children_count: int = 0
    products_count: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True


class CategoryTreeNode(CategoryResponse):
    """分类树节点"""
    children: List["CategoryTreeNode"] = []


class CategoryListResponse(BaseModel):
    data: List[CategoryResponse]
    total: int
    page: int
    limit: int

