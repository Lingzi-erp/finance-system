"""
收付款记录模型 - 记录实际的资金流动
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from app.db.base import Base


class PaymentRecord(Base):
    """收付款记录 - 实际的资金流动
    
    支持场景：
    - 客户付款（对应应收账款）
    - 向供应商付款（对应应付账款）
    - 预收款/预付款（不关联具体账款）
    - 一笔付款核销多笔账款
    """
    __tablename__ = "v3_payment_records"

    id = Column(Integer, primary_key=True, index=True)
    
    # 收付款编号（自动生成）
    # 格式：REC20241203001（收款）、PAY20241203001（付款）
    payment_no = Column(String(50), unique=True, nullable=False, index=True, comment="收付款单号")
    
    # 关联实体（付款方/收款方）
    entity_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, index=True)
    
    # 关联账款（可选，预收/预付款时为空）
    account_balance_id = Column(Integer, ForeignKey("v3_account_balances.id"), index=True, comment="关联账款")
    
    # 收付款类型
    # receive: 收款（客户付给我们）
    # pay: 付款（我们付给供应商）
    payment_type = Column(String(20), nullable=False, index=True, comment="收付款类型")
    
    # 金额
    amount = Column(DECIMAL(12, 2), nullable=False, comment="金额")
    
    # 支付方式（关联到 PaymentMethod）
    payment_method_id = Column(Integer, ForeignKey("v3_payment_methods.id"), comment="收付款方式ID")
    
    # 向后兼容：保留旧的支付方式字段
    # cash: 现金
    # bank: 银行转账
    # wechat: 微信
    # alipay: 支付宝
    # check: 支票
    # other: 其他
    payment_method = Column(String(20), default="bank", comment="支付方式（旧字段，向后兼容）")
    
    # 付款日期
    payment_date = Column(DateTime, default=datetime.utcnow, comment="付款日期")
    
    # 备注
    notes = Column(Text, comment="备注")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    entity = relationship("Entity", foreign_keys=[entity_id])
    account_balance = relationship("AccountBalance", back_populates="payments")
    method = relationship("PaymentMethod", back_populates="payment_records")
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<PaymentRecord {self.payment_no}: {self.payment_type} ¥{self.amount}>"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            "receive": "收款",
            "pay": "付款"
        }
        return type_map.get(self.payment_type, self.payment_type)
    
    @property
    def method_display(self) -> str:
        """支付方式显示名称"""
        # 优先使用新的 PaymentMethod 关系
        if self.method:
            return self.method.display_name
        # 向后兼容旧数据
        method_map = {
            "cash": "现金",
            "bank": "银行转账",
            "wechat": "微信",
            "alipay": "支付宝",
            "check": "支票",
            "other": "其他"
        }
        return method_map.get(self.payment_method, self.payment_method)

