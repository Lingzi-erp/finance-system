"""
收付款方式模型 - 管理自定义的收付款渠道
支持：银行账户、微信、支付宝、代收账户等
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class PaymentMethod(Base):
    """收付款方式 - 自定义的收付款渠道
    
    支持场景：
    - 银行账户（工商银行尾号1234）
    - 微信收款码
    - 支付宝个人账户
    - 代收账户（张三代收）
    - 现金
    """
    __tablename__ = "v3_payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    
    # 基本信息
    name = Column(String(100), nullable=False, comment="名称（如：工商银行尾号1234）")
    
    # 方式类型
    # bank: 银行账户
    # wechat: 微信
    # alipay: 支付宝
    # cash: 现金
    # proxy: 代收/代付账户
    # other: 其他
    method_type = Column(String(20), nullable=False, default="bank", comment="方式类型")
    
    # 账户信息（根据类型可选填写）
    account_no = Column(String(50), comment="账号（银行卡号后4位、微信号等）")
    account_name = Column(String(50), comment="账户名")
    bank_name = Column(String(50), comment="银行名称（银行类型时）")
    
    # 代收代付相关
    is_proxy = Column(Boolean, default=False, comment="是否代收/代付账户")
    proxy_entity_id = Column(Integer, ForeignKey("v3_entities.id"), comment="代收人实体ID")
    proxy_balance = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="代收余额（代收的钱减去代付的钱）")
    
    # 备注
    notes = Column(Text, comment="备注说明")
    
    # 状态和排序
    is_default = Column(Boolean, default=False, comment="是否默认")
    is_active = Column(Boolean, default=True, comment="是否启用")
    sort_order = Column(Integer, default=0, comment="排序")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    proxy_entity = relationship("Entity", foreign_keys=[proxy_entity_id])
    creator = relationship("User", foreign_keys=[created_by])
    
    # 使用此方式的收付款记录
    payment_records = relationship("PaymentRecord", back_populates="method", lazy="dynamic")

    def __repr__(self):
        return f"<PaymentMethod {self.name} ({self.method_type})>"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            "bank": "银行账户",
            "wechat": "微信",
            "alipay": "支付宝",
            "cash": "现金",
            "proxy": "代收账户",
            "other": "其他"
        }
        return type_map.get(self.method_type, self.method_type)
    
    @property
    def display_name(self) -> str:
        """完整显示名称"""
        if self.is_proxy and self.proxy_entity:
            return f"{self.name}（{self.proxy_entity.name}代收）"
        return self.name
    
    @property
    def icon(self) -> str:
        """图标"""
        icon_map = {
            "bank": "🏦",
            "wechat": "💚",
            "alipay": "🔵",
            "cash": "💵",
            "proxy": "👤",
            "other": "💳"
        }
        return icon_map.get(self.method_type, "💳")

