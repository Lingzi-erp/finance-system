"""收付款方式 Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal


class PaymentMethodBase(BaseModel):
    """收付款方式基础字段"""
    name: str = Field(..., min_length=1, max_length=100, description="名称")
    method_type: str = Field(default="bank", description="类型：bank/wechat/alipay/cash/proxy/other")
    account_no: Optional[str] = Field(None, max_length=50, description="账号")
    account_name: Optional[str] = Field(None, max_length=50, description="账户名")
    bank_name: Optional[str] = Field(None, max_length=50, description="银行名称")
    is_proxy: bool = Field(default=False, description="是否代收账户")
    proxy_entity_id: Optional[int] = Field(None, description="代收人实体ID")
    notes: Optional[str] = Field(None, description="备注")
    is_default: bool = Field(default=False, description="是否默认")
    sort_order: int = Field(default=0, description="排序")


class PaymentMethodCreate(PaymentMethodBase):
    """创建收付款方式"""
    pass


class PaymentMethodUpdate(BaseModel):
    """更新收付款方式"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    method_type: Optional[str] = None
    account_no: Optional[str] = Field(None, max_length=50)
    account_name: Optional[str] = Field(None, max_length=50)
    bank_name: Optional[str] = Field(None, max_length=50)
    is_proxy: Optional[bool] = None
    proxy_entity_id: Optional[int] = None
    notes: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class PaymentMethodResponse(PaymentMethodBase):
    """收付款方式响应"""
    id: int
    is_active: bool
    proxy_balance: float = 0
    proxy_entity_name: str = ""
    type_display: str = ""
    display_name: str = ""
    icon: str = ""
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentMethodListResponse(BaseModel):
    """收付款方式列表响应"""
    data: List[PaymentMethodResponse]
    total: int
    page: int
    page_size: int


class PaymentMethodSimpleResponse(BaseModel):
    """收付款方式简单响应（用于下拉选择）"""
    id: int
    name: str
    method_type: str
    type_display: str
    display_name: str
    icon: str
    is_proxy: bool
    proxy_balance: float = 0

    class Config:
        from_attributes = True


# 类型常量
PAYMENT_METHOD_TYPES = {
    "bank": "银行账户",
    "wechat": "微信",
    "alipay": "支付宝", 
    "cash": "现金",
    "proxy": "代收账户",
    "other": "其他"
}

