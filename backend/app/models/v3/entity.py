"""
实体模型 - 统一的参与方
供应商、客户、仓库本质上都是"实体"，只是角色不同
一个实体可以同时扮演多种角色
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from app.db.base import Base


class Entity(Base):
    """实体 - 统一的业务参与方"""
    __tablename__ = "v3_entities"

    id = Column(Integer, primary_key=True, index=True)
    
    # 基本信息
    name = Column(String(100), nullable=False, index=True, comment="名称")
    code = Column(String(50), unique=True, index=True, comment="编码（自动生成）")
    
    # 实体类型：可以是多种角色的组合
    # supplier(供应商), customer(客户), warehouse(仓库)
    # 用逗号分隔表示多重身份，如 "supplier,customer"
    entity_type = Column(String(100), nullable=False, default="warehouse", comment="实体类型")
    
    # 联系信息
    contact_name = Column(String(50), comment="联系人")
    phone = Column(String(20), comment="电话")
    address = Column(String(200), comment="地址")
    
    # 业务属性
    credit_level = Column(Integer, default=5, comment="信用等级 1-5")
    credit_limit = Column(DECIMAL(12, 2), comment="信用额度（可欠款上限）")
    current_balance = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="当前欠款余额")
    notes = Column(Text, comment="备注")
    
    # 状态
    is_active = Column(Boolean, default=True, comment="是否启用")
    is_system = Column(Boolean, default=False, comment="是否系统客商（不可删除）")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    creator = relationship("User", foreign_keys=[created_by])
    
    # 作为来源的业务单
    orders_as_source = relationship(
        "BusinessOrder", 
        foreign_keys="BusinessOrder.source_id",
        back_populates="source_entity"
    )
    # 作为目标的业务单
    orders_as_target = relationship(
        "BusinessOrder",
        foreign_keys="BusinessOrder.target_id", 
        back_populates="target_entity"
    )

    def __repr__(self):
        return f"<Entity {self.code}: {self.name} ({self.entity_type})>"
    
    @property
    def is_supplier(self) -> bool:
        """是否是供应商"""
        return "supplier" in self.entity_type
    
    @property
    def is_customer(self) -> bool:
        """是否是客户"""
        return "customer" in self.entity_type
    
    @property
    def is_warehouse(self) -> bool:
        """是否是仓库"""
        return "warehouse" in self.entity_type
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        types = []
        if self.is_supplier:
            types.append("供应商")
        if self.is_customer:
            types.append("客户")
        if self.is_warehouse:
            types.append("仓库")
        return "/".join(types) if types else "未知"

