"""规格模板模型 - 预设规格供选择"""

from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class Specification(Base):
    """规格模板
    
    按分类预设规格，创建商品时选择，如：
    - 鱼类分类下：500g、1kg、2kg、整条
    - 番茄酱分类下：250ml、500ml、1L
    """
    __tablename__ = "v3_specifications"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="规格名称，如：500g、1kg")
    category_id = Column(Integer, ForeignKey("v3_categories.id"), nullable=True, comment="所属分类（可为空表示通用）")
    sort_order = Column(Integer, default=0, comment="排序")
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    category = relationship("Category", back_populates="specifications")
    creator = relationship("User", foreign_keys=[created_by])

