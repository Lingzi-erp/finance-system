"""单位模型 - 支持单位组换算和复式单位"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class UnitGroup(Base):
    """单位组 - 同类单位的集合
    
    如：重量组（kg, g, t, mg）、体积组（L, mL）、长度组（m, cm, mm）
    """
    __tablename__ = "v3_unit_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True, comment="单位组名称，如：重量、体积")
    base_unit = Column(String(20), nullable=False, comment="基准单位，如：kg、L")
    description = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    units = relationship("Unit", back_populates="group", cascade="all, delete-orphan")


class Unit(Base):
    """单位 - 属于某个单位组
    
    如：kg(1)、g(0.001)、t(1000) 都属于重量组，括号内为换算到基准单位的系数
    """
    __tablename__ = "v3_units"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("v3_unit_groups.id"), nullable=False)
    name = Column(String(20), nullable=False, comment="单位名称，如：kg、g")
    symbol = Column(String(10), nullable=False, comment="单位符号")
    conversion_rate = Column(Float, nullable=False, default=1.0, comment="换算到基准单位的系数")
    sort_order = Column(Integer, default=0)
    is_base = Column(Boolean, default=False, comment="是否为基准单位")
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    group = relationship("UnitGroup", back_populates="units")


class CompositeUnit(Base):
    """复式单位 - 组合单位
    
    如：每件20kg、每箱12瓶、每包500g
    """
    __tablename__ = "v3_composite_units"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, comment="复式单位名称，如：件(20kg)")
    container_name = Column(String(20), nullable=False, comment="容器名称，如：件、箱、包")
    quantity = Column(Float, nullable=False, comment="每个容器包含的数量")
    unit_id = Column(Integer, ForeignKey("v3_units.id"), nullable=False, comment="内容单位")
    description = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    unit = relationship("Unit")
    creator = relationship("User", foreign_keys=[created_by])
    
    @property
    def display_name(self) -> str:
        """显示名称，如：件(20kg)"""
        return f"{self.container_name}({self.quantity}{self.unit.symbol})"

