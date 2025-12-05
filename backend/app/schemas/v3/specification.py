"""规格模板Schema"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class SpecificationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="规格名称")
    category_id: Optional[int] = Field(None, description="所属分类ID")
    sort_order: int = Field(0, ge=0)


class SpecificationCreate(SpecificationBase):
    pass


class SpecificationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class SpecificationResponse(SpecificationBase):
    id: int
    is_active: bool
    category_name: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class SpecificationListResponse(BaseModel):
    data: List[SpecificationResponse]
    total: int
    page: int
    limit: int

