"""实体Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class EntityBase(BaseModel):
    """实体基础字段"""
    name: str = Field(..., min_length=1, max_length=100, description="名称")
    entity_type: str = Field(default="warehouse", description="类型：supplier,customer,warehouse，可组合")
    contact_name: Optional[str] = Field(None, max_length=50, description="联系人")
    phone: Optional[str] = Field(None, max_length=20, description="电话")
    address: Optional[str] = Field(None, max_length=200, description="地址")
    credit_level: int = Field(default=5, ge=1, le=5, description="信用等级")
    credit_limit: Optional[float] = Field(None, ge=0, description="信用额度")
    notes: Optional[str] = Field(None, description="备注")
    is_active: bool = Field(default=True, description="是否启用")


class EntityCreate(EntityBase):
    """创建实体"""
    pass


class EntityUpdate(BaseModel):
    """更新实体"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    entity_type: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    credit_level: Optional[int] = Field(None, ge=1, le=5)
    credit_limit: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EntityResponse(EntityBase):
    """实体响应"""
    id: int
    code: str
    type_display: str = ""
    current_balance: float = 0.0  # 当前欠款余额
    is_system: bool = False  # 是否为系统内置实体
    created_by: int
    created_at: datetime
    updated_at: datetime
    
    # 统计字段（可选）
    order_count: int = 0
    total_amount: float = 0.0
    receivable_balance: float = 0.0  # 应收余额
    payable_balance: float = 0.0     # 应付余额

    class Config:
        from_attributes = True


class EntityListResponse(BaseModel):
    """实体列表响应"""
    data: List[EntityResponse]
    total: int
    page: int
    limit: int

