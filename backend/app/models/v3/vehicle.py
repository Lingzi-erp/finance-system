"""
车辆模型

结构说明：
- 物流公司（Entity，type=logistics）
  └── 车辆（Vehicle）
      - 车牌号（必填，唯一标识）
      - 车辆类型（可选）
      
- 司机电话：在订单中临时填写，因为同一辆车可能由不同司机驾驶
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base


class Vehicle(Base):
    """车辆模型 - 属于某个物流公司"""
    __tablename__ = "v3_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(20), nullable=False, unique=True, comment="车牌号（唯一）")
    
    # 所属物流公司
    logistics_company_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, comment="物流公司ID")
    
    # 车辆基础信息（可选）
    vehicle_type = Column(String(50), comment="车辆类型（如：冷藏车、普通货车）")
    notes = Column(String(200), comment="备注")
    
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    logistics_company = relationship("Entity", backref="vehicles", lazy="joined")
    creator = relationship("User", backref="created_vehicles", lazy="joined")

    @property
    def display_name(self) -> str:
        """显示名称：车牌号"""
        return self.plate_number
    
    @property
    def company_name(self) -> str:
        """物流公司名称"""
        return self.logistics_company.name if self.logistics_company else "未知"

