"""商品包装规格模型

每个商品可以有多种包装规格，如：
- 冷冻鲅鱼：大箱(20kg)、小箱(10kg)、散装(kg)
- 啤酒：箱(24瓶)、打(12瓶)、瓶
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ProductSpec(Base):
    """商品包装规格
    
    定义商品的不同包装方式，一个商品可以有多个包装规格
    """
    __tablename__ = "v3_product_specs"
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("v3_products.id"), nullable=False, index=True, comment="商品ID")
    
    # 规格信息
    name = Column(String(50), nullable=False, comment="规格名称，如：大箱、小箱、散装")
    container_name = Column(String(20), nullable=False, comment="容器/单位名称，如：箱、件、kg")
    quantity = Column(Float, nullable=False, default=1.0, comment="每个容器包含的基础单位数量，散装为1")
    unit_id = Column(Integer, ForeignKey("v3_units.id"), nullable=False, comment="基础单位ID")
    
    # 状态
    is_default = Column(Boolean, default=False, comment="是否为默认规格")
    is_active = Column(Boolean, default=True, comment="是否启用")
    sort_order = Column(Integer, default=0, comment="排序")
    
    # 审计
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    product = relationship("Product", back_populates="specs")
    unit = relationship("Unit")
    
    @property
    def display_name(self) -> str:
        """显示名称
        
        如果 quantity == 1 且 container_name == unit.symbol，显示为 "散装(kg)"
        否则显示为 "大箱(20kg)"
        """
        if self.unit:
            if self.quantity == 1 and self.container_name == self.unit.symbol:
                return f"散装({self.unit.symbol})"
            return f"{self.container_name}({int(self.quantity) if self.quantity == int(self.quantity) else self.quantity}{self.unit.symbol})"
        return self.name
    
    @property
    def is_bulk(self) -> bool:
        """是否为散装（按基础单位计量）"""
        return self.quantity == 1 and self.unit and self.container_name == self.unit.symbol
    
    def __repr__(self):
        return f"<ProductSpec {self.id}: {self.name} - {self.display_name}>"

