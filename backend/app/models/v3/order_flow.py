"""
业务流程记录模型 - 记录业务单的每一步操作
使得每笔业务都有完整的生命周期可追溯
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship
from app.db.base import Base


class OrderFlow(Base):
    """业务流程记录 - 业务单的生命周期"""
    __tablename__ = "v3_order_flows"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联业务单
    order_id = Column(Integer, ForeignKey("v3_business_orders.id"), nullable=False, index=True)
    
    # 流程类型（简化）
    # created: 创建
    # completed: 完成
    flow_type = Column(String(20), nullable=False, comment="流程类型")
    
    # 流程状态
    # pending: 待处理
    # completed: 已完成
    flow_status = Column(String(20), default="completed", comment="流程状态")
    
    # 操作描述
    description = Column(String(200), comment="操作描述")
    
    # 扩展数据（JSON格式，可存储各种附加信息）
    # 如：物流单号、签收人、退货原因、实际数量等
    meta_data = Column(JSON, comment="扩展数据")
    
    # 备注
    notes = Column(Text, comment="备注")
    
    # 操作人和时间
    operator_id = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    operated_at = Column(DateTime, default=datetime.utcnow, comment="操作时间")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    order = relationship("BusinessOrder", back_populates="flows")
    operator = relationship("User", foreign_keys=[operator_id])

    def __repr__(self):
        return f"<OrderFlow {self.order_id}: {self.flow_type} ({self.flow_status})>"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            "created": "创建",
            "completed": "完成"
        }
        return type_map.get(self.flow_type, self.flow_type)

