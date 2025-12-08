"""
库存模型 - 记录每个仓库中每个商品的库存数量
改革说明：
- quantity 从 Integer 改为 DECIMAL(12,2)，支持小数计量（如 10.5kg）
- 与批次表(StockBatch)保持类型一致
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, DECIMAL, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from app.db.base import Base


class Stock(Base):
    """库存 - 仓库中商品的当前数量
    
    改革说明（v1.2.6+）：
    - 添加 spec_id 字段，支持同商品不同规格分开记库存
    - 唯一约束改为 (warehouse_id, product_id, spec_id)
    - spec_id 为 NULL 时表示不区分规格（向后兼容）
    """
    __tablename__ = "v3_stocks"
    
    # 联合唯一约束：同一仓库同一商品同一规格只有一条记录
    # 注意：SQLite 中 NULL 值不参与唯一约束比较，所以 spec_id=NULL 的记录可以重复
    # 这是符合预期的：不区分规格的商品只会有一条记录
    __table_args__ = (
        UniqueConstraint('warehouse_id', 'product_id', 'spec_id', name='uq_warehouse_product_spec'),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # 仓库（必须是 entity_type 包含 warehouse 的实体）
    warehouse_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, index=True)
    
    # 商品
    product_id = Column(Integer, ForeignKey("v3_products.id"), nullable=False, index=True)
    
    # 商品规格（可选，NULL 表示不区分规格）
    spec_id = Column(Integer, ForeignKey("v3_product_specs.id"), index=True, comment="商品规格ID")
    spec_name = Column(String(50), comment="规格名称快照")
    
    # 库存数量（使用DECIMAL支持小数，如10.5kg）
    quantity = Column(DECIMAL(12, 2), nullable=False, default=Decimal("0.00"), comment="当前库存数量")
    
    # 预留数量（已确认但未完成的出库单占用）
    reserved_quantity = Column(DECIMAL(12, 2), nullable=False, default=Decimal("0.00"), comment="预留数量")
    
    # 可用数量 = quantity - reserved_quantity（计算字段，不存储）
    
    # 安全库存（可选，用于预警）
    safety_stock = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="安全库存")
    
    # 最后盘点时间
    last_check_at = Column(DateTime, comment="最后盘点时间")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    warehouse = relationship("Entity", foreign_keys=[warehouse_id])
    product = relationship("Product", foreign_keys=[product_id])
    spec = relationship("ProductSpec", foreign_keys=[spec_id])

    def __repr__(self):
        return f"<Stock {self.warehouse_id}:{self.product_id} = {self.quantity}>"
    
    @property
    def available_quantity(self) -> Decimal:
        """可用库存 = 当前库存 - 预留数量"""
        return (self.quantity or Decimal("0")) - (self.reserved_quantity or Decimal("0"))
    
    @property
    def is_low_stock(self) -> bool:
        """是否低于安全库存"""
        return (self.quantity or Decimal("0")) < (self.safety_stock or Decimal("0"))


class StockFlow(Base):
    """库存流水 - 记录每次库存变动"""
    __tablename__ = "v3_stock_flows"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联库存记录
    stock_id = Column(Integer, ForeignKey("v3_stocks.id"), nullable=False, index=True)
    
    # 关联业务单（可选，手动调整时为空）
    order_id = Column(Integer, ForeignKey("v3_business_orders.id"), index=True)
    order_item_id = Column(Integer, ForeignKey("v3_order_items.id"), index=True)
    
    # 流水类型
    # in: 入库
    # out: 出库
    # reserve: 预留（确认出库单时）
    # release: 释放预留（取消出库单时）
    # adjust: 手动调整/盘点
    flow_type = Column(String(20), nullable=False, comment="流水类型")
    
    # 变动数量（正数表示增加，负数表示减少）
    quantity_change = Column(DECIMAL(12, 2), nullable=False, comment="变动数量")
    
    # 变动前后数量（用于追溯）
    quantity_before = Column(DECIMAL(12, 2), nullable=False, comment="变动前数量")
    quantity_after = Column(DECIMAL(12, 2), nullable=False, comment="变动后数量")
    
    # 变动原因/备注
    reason = Column(String(200), comment="变动原因")
    
    # 操作人
    operator_id = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    operated_at = Column(DateTime, default=datetime.utcnow, comment="操作时间")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    stock = relationship("Stock", foreign_keys=[stock_id])
    order = relationship("BusinessOrder", foreign_keys=[order_id])
    order_item = relationship("OrderItem", foreign_keys=[order_item_id])
    operator = relationship("User", foreign_keys=[operator_id])

    def __repr__(self):
        return f"<StockFlow {self.stock_id}: {self.flow_type} {self.quantity_change:+d}>"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            "in": "入库",
            "out": "出库",
            "reserve": "预留",
            "release": "释放",
            "adjust": "调整"
        }
        return type_map.get(self.flow_type, self.flow_type)

