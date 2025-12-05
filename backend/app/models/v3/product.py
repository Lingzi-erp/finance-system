"""
商品模型 - 纯粹的"物"
商品本身只有固有属性，交易价格在订单明细中
但成本价作为商品的基础属性保留在这里
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint, DECIMAL
from sqlalchemy.orm import relationship
from app.db.base import Base


class Product(Base):
    """商品 - 纯粹的物品信息
    
    唯一性约束：品名 + 规格 必须唯一，防止重复商品
    """
    __tablename__ = "v3_products"
    __table_args__ = (
        UniqueConstraint('name', 'specification', name='uq_product_name_spec'),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # 核心属性（商品固有的）
    name = Column(String(100), nullable=False, index=True, comment="品名")
    code = Column(String(50), unique=True, index=True, comment="编码（自动生成）")
    
    # 分类（关联分类表）
    category_id = Column(Integer, ForeignKey("v3_categories.id"), nullable=True, comment="分类ID")
    category = Column(String(50), comment="分类名称（兼容旧数据）")
    
    # 规格（关联规格表或自定义）
    specification_id = Column(Integer, ForeignKey("v3_specifications.id"), nullable=True, comment="规格模板ID")
    specification = Column(String(200), comment="规格型号（可从模板填充或自定义）")
    
    # 单位系统
    unit_id = Column(Integer, ForeignKey("v3_units.id"), nullable=True, comment="基本单位ID")
    composite_unit_id = Column(Integer, ForeignKey("v3_composite_units.id"), nullable=True, comment="复式单位ID")
    unit = Column(String(20), nullable=False, default="个", comment="计量单位（显示用）")
    
    # 成本价（进货成本，用于利润计算）
    cost_price = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="成本价/进货价")
    
    # 建议售价（可选，仅作参考）
    suggested_price = Column(DECIMAL(12, 2), comment="建议售价")
    
    # 描述
    description = Column(Text, comment="描述")
    
    # 状态
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    creator = relationship("User", foreign_keys=[created_by])
    category_rel = relationship("Category", back_populates="products")
    specification_template = relationship("Specification", foreign_keys=[specification_id])
    base_unit = relationship("Unit", foreign_keys=[unit_id])
    composite_unit = relationship("CompositeUnit", foreign_keys=[composite_unit_id])  # 兼容旧数据
    order_items = relationship("OrderItem", back_populates="product")
    stocks = relationship("Stock", back_populates="product")
    specs = relationship("ProductSpec", back_populates="product", cascade="all, delete-orphan", order_by="ProductSpec.sort_order")

    def __repr__(self):
        return f"<Product {self.code}: {self.name} ({self.specification}) - {self.unit}>"
    
    @property
    def full_name(self) -> str:
        """完整名称：品名 + 规格"""
        if self.specification:
            return f"{self.name} ({self.specification})"
        return self.name
    
    @property
    def category_name(self) -> str:
        """分类名称"""
        return self.category_rel.name if self.category_rel else ""
