"""收付款记录 Schema"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class PaymentRecordCreate(BaseModel):
    """创建收付款"""
    entity_id: int
    account_balance_id: Optional[int] = None
    payment_type: str = Field(..., pattern="^(receive|pay)$")
    amount: float = Field(..., gt=0)
    payment_method_id: Optional[int] = None  # 新的收付款方式ID
    payment_method: str = Field(default="bank")  # 向后兼容，放宽验证
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None


class PaymentRecordUpdate(BaseModel):
    """更新收付款"""
    payment_method: Optional[str] = None
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None


class PaymentRecordResponse(BaseModel):
    """收付款响应"""
    id: int
    payment_no: str
    entity_id: int
    account_balance_id: Optional[int]
    payment_type: str
    amount: float
    payment_method_id: Optional[int] = None
    payment_method: str
    payment_date: datetime
    notes: Optional[str]
    
    # 显示字段
    type_display: str
    method_display: str
    method_icon: str = ""  # 收付款方式图标
    entity_name: str = ""
    entity_code: str = ""
    order_no: str = ""  # 关联订单号（通过账款获取）
    
    # 审计信息
    created_by: int
    creator_name: str = ""
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class PaymentRecordListResponse(BaseModel):
    """收付款列表响应"""
    data: List[PaymentRecordResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True


class PaymentSummary(BaseModel):
    """收付款汇总"""
    total_received: float = 0   # 总收款
    total_paid: float = 0       # 总付款
    today_received: float = 0   # 今日收款
    today_paid: float = 0       # 今日付款
    month_received: float = 0   # 本月收款
    month_paid: float = 0       # 本月付款

