"""应收/应付账款 Schema"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AccountBalanceCreate(BaseModel):
    """创建账款"""
    entity_id: int
    order_id: int
    balance_type: str = Field(..., pattern="^(receivable|payable)$")
    amount: float
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class AccountBalanceUpdate(BaseModel):
    """更新账款"""
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class AccountBalanceResponse(BaseModel):
    """账款响应"""
    id: int
    entity_id: int
    order_id: int
    balance_type: str
    amount: float
    paid_amount: float
    balance: float
    due_date: Optional[datetime]
    status: str
    notes: Optional[str]
    
    # 显示字段
    type_display: str
    status_display: str
    entity_name: str = ""
    entity_code: str = ""
    order_no: str = ""
    
    # 审计信息
    created_by: int
    creator_name: str = ""
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AccountBalanceListResponse(BaseModel):
    """账款列表响应"""
    data: List[AccountBalanceResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True


class AccountBalanceSummary(BaseModel):
    """账款汇总"""
    total_receivable: float = 0  # 应收总额
    total_payable: float = 0     # 应付总额
    receivable_balance: float = 0  # 应收余额
    payable_balance: float = 0     # 应付余额
    overdue_receivable: float = 0  # 逾期应收
    overdue_payable: float = 0     # 逾期应付

