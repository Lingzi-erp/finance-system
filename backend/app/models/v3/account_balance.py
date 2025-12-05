"""
应收/应付账款模型 - 往来账管理
记录与客户/供应商之间的债权债务关系
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class AccountBalance(Base):
    """应收/应付账款 - 往来账余额
    
    核心逻辑：
    - 销售完成 → 产生应收账款（客户欠我们）
    - 采购完成 → 产生应付账款（我们欠供应商）
    - 客户退货完成 → 减少应收账款
    - 退供应商完成 → 减少应付账款
    """
    __tablename__ = "v3_account_balances"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联实体（客户或供应商）
    entity_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, index=True)
    
    # 关联业务单
    order_id = Column(Integer, ForeignKey("v3_business_orders.id"), nullable=False, index=True)
    
    # 账款类型
    # receivable: 应收账款（销售产生，客户欠我们）
    # payable: 应付账款（采购产生，我们欠供应商）
    balance_type = Column(String(20), nullable=False, index=True, comment="账款类型")
    
    # 金额信息
    amount = Column(DECIMAL(12, 2), nullable=False, comment="应收/应付金额")
    paid_amount = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="已收/已付金额")
    
    # 余额 = amount - paid_amount（动态计算更准确，但这里也存储方便查询）
    balance = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="余额")
    
    # 到期日（可选，用于账龄分析）
    due_date = Column(DateTime, comment="到期日")
    
    # 状态
    # pending: 待收/待付
    # partial: 部分收/付
    # paid: 已结清
    # cancelled: 已取消
    status = Column(String(20), default="pending", index=True, comment="状态")
    
    # 备注
    notes = Column(Text, comment="备注")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    entity = relationship("Entity", foreign_keys=[entity_id])
    order = relationship("BusinessOrder", foreign_keys=[order_id])
    creator = relationship("User", foreign_keys=[created_by])
    
    # 关联的收付款记录
    payments = relationship("PaymentRecord", back_populates="account_balance", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AccountBalance {self.balance_type}: {self.entity_id} ¥{self.balance}>"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            "receivable": "应收账款",
            "payable": "应付账款"
        }
        return type_map.get(self.balance_type, self.balance_type)
    
    @property
    def status_display(self) -> str:
        """状态显示名称"""
        status_map = {
            "pending": "待处理",
            "partial": "部分结算",
            "paid": "已结清",
            "cancelled": "已取消"
        }
        return status_map.get(self.status, self.status)
    
    def recalculate(self):
        """重新计算余额和状态"""
        self.balance = self.amount - self.paid_amount
        
        if self.balance <= Decimal("0"):
            self.status = "paid"
            self.balance = Decimal("0")
        elif self.paid_amount > Decimal("0"):
            self.status = "partial"
        else:
            self.status = "pending"

