"""商品分类模型 - 支持多层级树形结构"""

from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class Category(Base):
    """商品分类
    
    支持多层级树形结构，如：
    - 鱼类
      - 淡水鱼
        - 鲫鱼
        - 草鱼
      - 咸水鱼
        - 带鱼
        - 黄鱼
    - 番茄酱
      - 原味
      - 蒜香
    """
    __tablename__ = "v3_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="分类名称")
    code = Column(String(50), unique=True, nullable=False, comment="分类编码")
    parent_id = Column(Integer, ForeignKey("v3_categories.id"), nullable=True, comment="父分类ID")
    level = Column(Integer, default=1, comment="层级（1=一级分类）")
    sort_order = Column(Integer, default=0, comment="排序")
    description = Column(String(500), nullable=True, comment="描述")
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    parent = relationship("Category", remote_side=[id], backref="children")
    creator = relationship("User", foreign_keys=[created_by])
    products = relationship("Product", back_populates="category_rel")
    specifications = relationship("Specification", back_populates="category")

