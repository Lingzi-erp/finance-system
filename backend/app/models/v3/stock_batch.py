"""
库存批次模型 - 每车货一个批次，独立追踪成本和来源
支持：
- 批次独立成本（每批货价格不同）
- 毛重/净重分开记录（毛重计运费冷藏费，净重计货款）
- 仓储费追踪（寄存在冷库的费用，按毛重计算）
- 来源追溯（从哪个冷库进的）
- 混批销售（一个销售单可以从多个批次出货）
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class StockBatch(Base):
    """库存批次 - 每车货一个批次"""
    __tablename__ = "v3_stock_batches"

    id = Column(Integer, primary_key=True, index=True)
    
    # 批次号（自动生成，格式：PH + 日期 + 序号，如 PH20250604-001）
    batch_no = Column(String(50), unique=True, nullable=False, index=True, comment="批次号")
    
    # 关联商品
    product_id = Column(Integer, ForeignKey("v3_products.id"), nullable=False, index=True)
    
    # === 商品规格（从订单明细复制，用于区分同商品不同规格）===
    spec_id = Column(Integer, ForeignKey("v3_product_specs.id"), comment="商品规格ID")
    spec_name = Column(String(50), comment="规格名称快照，如：大箱、小箱")
    
    # 存放位置（哪个冷库/仓库）
    storage_entity_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, index=True, comment="存放仓库")
    
    # 来源供应商（从谁那买的，可能和存放位置相同）
    source_entity_id = Column(Integer, ForeignKey("v3_entities.id"), index=True, comment="来源供应商")
    
    # 关联的采购单（可选，期初数据时为空）
    source_order_id = Column(Integer, ForeignKey("v3_business_orders.id"), index=True, comment="来源采购单")
    
    # 关联的扣重公式（可选，用于记录这批货用了什么公式计算净重）
    deduction_formula_id = Column(Integer, ForeignKey("v3_deduction_formulas.id"), index=True, comment="扣重公式")
    
    # === 重量（毛重/净重分开，重要！）===
    # 毛重：包含冰块、包装等的总重量，用于计算运费、冷藏费
    # 净重：实际商品重量，用于计算货款
    gross_weight = Column(DECIMAL(12, 2), comment="毛重（含冰、包装，用于计运费冷藏费）")
    tare_weight = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="皮重（冰块、包装重量）")
    # 净重 = 毛重 - 皮重，或直接录入
    
    # === 数量/净重（使用DECIMAL支持小数，按斤计量）===
    # initial_quantity 和 current_quantity 实际上就是净重
    initial_quantity = Column(DECIMAL(12, 2), nullable=False, comment="初始净重/数量")
    current_quantity = Column(DECIMAL(12, 2), nullable=False, comment="当前剩余净重/数量")
    reserved_quantity = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="预留数量（已确认未发货）")
    
    # 当前毛重（按比例计算）
    current_gross_weight = Column(DECIMAL(12, 2), comment="当前剩余毛重")
    
    # === 采购成本（按净重计算）===
    cost_price = Column(DECIMAL(12, 2), nullable=False, comment="采购单价（元/斤，按净重）")
    cost_amount = Column(DECIMAL(12, 2), comment="采购总成本 = 单价 × 净重")
    
    # === 仓储费相关（按毛重计算）===
    storage_start_date = Column(DateTime, comment="开始计费日期")
    storage_rate = Column(DECIMAL(10, 4), default=Decimal("0.00"), comment="仓储费率（元/斤/天，按毛重）")
    storage_fee_paid = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="已付仓储费")
    
    # === 运费（按毛重计算）===
    freight_cost = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="运费（按毛重计算）")
    freight_rate = Column(DECIMAL(10, 4), comment="运费费率（元/斤，按毛重）")
    
    # === 其他费用 ===
    extra_cost = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="其他费用（装卸费等）")
    extra_cost_notes = Column(String(200), comment="其他费用说明")
    
    # === 日期 ===
    received_at = Column(DateTime, default=datetime.utcnow, comment="入库日期")
    
    # === 状态 ===
    # active: 在库（有库存）
    # depleted: 已清空（库存为0）
    status = Column(String(20), default="active", index=True, comment="状态")
    
    # 是否为期初数据
    is_initial = Column(Boolean, default=False, comment="是否期初数据")
    
    # 备注（可以记录这车货的特殊情况、质量等）
    notes = Column(Text, comment="备注")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    product = relationship("Product", foreign_keys=[product_id])
    spec = relationship("ProductSpec", foreign_keys=[spec_id])
    storage_entity = relationship("Entity", foreign_keys=[storage_entity_id])
    source_entity = relationship("Entity", foreign_keys=[source_entity_id])
    source_order = relationship("BusinessOrder", foreign_keys=[source_order_id])
    deduction_formula = relationship("DeductionFormula", foreign_keys=[deduction_formula_id])
    creator = relationship("User", foreign_keys=[created_by])
    
    # 出货记录
    outbound_records = relationship("OrderItemBatch", back_populates="batch")

    def __repr__(self):
        return f"<StockBatch {self.batch_no}: {self.current_quantity}/{self.initial_quantity}>"
    
    @property
    def available_quantity(self) -> Decimal:
        """可用数量 = 当前数量 - 预留数量"""
        return self.current_quantity - (self.reserved_quantity or Decimal("0"))
    
    @property
    def is_depleted(self) -> bool:
        """是否已清空"""
        return self.current_quantity <= Decimal("0")
    
    @property
    def storage_days(self) -> int:
        """已存储天数"""
        if not self.storage_start_date:
            return 0
        return (datetime.utcnow() - self.storage_start_date).days
    
    @property
    def current_gross(self) -> Decimal:
        """当前毛重（如果没有单独记录，按比例计算）"""
        if self.current_gross_weight:
            return self.current_gross_weight
        if not self.gross_weight or not self.initial_quantity or self.initial_quantity <= 0:
            return self.current_quantity  # 没有毛重数据时，用净重代替
        # 按比例计算：当前毛重 = 初始毛重 × (当前净重 / 初始净重)
        ratio = self.current_quantity / self.initial_quantity
        return self.gross_weight * ratio
    
    @property
    def accumulated_storage_fee(self) -> Decimal:
        """累计仓储费（实时计算，按毛重）"""
        if not self.storage_rate or self.storage_rate <= 0:
            return Decimal("0")
        days = self.storage_days
        # 按当前毛重计算仓储费
        gross = self.current_gross
        return gross * self.storage_rate * Decimal(str(days))
    
    @property
    def total_cost(self) -> Decimal:
        """总成本 = 采购成本 + 运费 + 仓储费 + 其他费用"""
        purchase_cost = self.cost_amount or (self.cost_price * self.initial_quantity)
        freight = self.freight_cost or Decimal("0")
        storage_fee = self.accumulated_storage_fee + (self.storage_fee_paid or Decimal("0"))
        extra = self.extra_cost or Decimal("0")
        return purchase_cost + freight + storage_fee + extra
    
    @property
    def real_cost_price(self) -> Decimal:
        """真实成本单价（含运费、仓储费等，按净重均摊）"""
        if self.current_quantity <= 0:
            return self.cost_price
        # 剩余部分需要承担的各项成本
        remaining_purchase_cost = self.cost_price * self.current_quantity
        # 运费按比例分摊
        freight_portion = (self.freight_cost or Decimal("0")) * self.current_quantity / self.initial_quantity
        # 仓储费（实时累计）
        storage_fee = self.accumulated_storage_fee
        # 其他费用按比例分摊
        extra_portion = (self.extra_cost or Decimal("0")) * self.current_quantity / self.initial_quantity
        total = remaining_purchase_cost + freight_portion + storage_fee + extra_portion
        return total / self.current_quantity
    
    @property
    def status_display(self) -> str:
        """状态显示"""
        status_map = {
            "active": "在库",
            "partial": "部分在库",
            "depleted": "已清空",
        }
        return status_map.get(self.status, self.status)
    
    def update_status(self):
        """根据数量更新状态"""
        if self.current_quantity <= Decimal("0"):
            self.status = "depleted"
        elif self.current_quantity < self.initial_quantity:
            self.status = "partial"
        else:
            self.status = "active"


class OrderItemBatch(Base):
    """订单明细-批次关联 - 记录一个销售明细从哪些批次出货"""
    __tablename__ = "v3_order_item_batches"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联订单明细
    order_item_id = Column(Integer, ForeignKey("v3_order_items.id"), nullable=False, index=True)
    
    # 关联批次
    batch_id = Column(Integer, ForeignKey("v3_stock_batches.id"), nullable=False, index=True)
    
    # 从这个批次出货的数量
    quantity = Column(DECIMAL(12, 2), nullable=False, comment="出货数量")
    
    # 这个批次的成本单价（出货时记录，含仓储费）
    cost_price = Column(DECIMAL(12, 2), comment="成本单价（出货时的真实成本）")
    
    # 成本小计
    cost_amount = Column(DECIMAL(12, 2), comment="成本金额")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    order_item = relationship("OrderItem", backref="batch_records")
    batch = relationship("StockBatch", back_populates="outbound_records")

    def __repr__(self):
        return f"<OrderItemBatch item:{self.order_item_id} batch:{self.batch_id} qty:{self.quantity}>"
    
    def calculate_cost(self):
        """计算成本"""
        if self.cost_price and self.quantity:
            self.cost_amount = self.cost_price * self.quantity


class ReturnItemBatch(Base):
    """
    退货明细-批次关联
    
    记录退货时涉及的批次信息：
    - 退供应商（return_out）：记录从哪个批次退出
    - 客户退货（return_in）：记录退回到哪个批次（可能是原批次或新批次）
    
    支持复杂场景：
    1. 一个退货明细可能涉及多个批次（混批退货）
    2. 一个批次可能被部分退货
    3. 退货可能产生冷藏费等额外费用
    """
    __tablename__ = "v3_return_item_batches"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联退货订单明细（BusinessOrder类型为return_in/return_out的订单明细）
    order_item_id = Column(Integer, ForeignKey("v3_order_items.id"), nullable=False, index=True)
    
    # 来源批次（退供应商时：从哪个批次退出；客户退货时：原销售时的批次）
    source_batch_id = Column(Integer, ForeignKey("v3_stock_batches.id"), index=True, comment="来源批次")
    
    # 目标批次（客户退货时：退回到哪个批次；可能是原批次或新建批次）
    target_batch_id = Column(Integer, ForeignKey("v3_stock_batches.id"), index=True, comment="目标批次")
    
    # 退货数量
    quantity = Column(DECIMAL(12, 2), nullable=False, comment="退货数量")
    
    # 退货金额（按原销售/采购价）
    amount = Column(DECIMAL(12, 2), comment="退货金额")
    
    # 冷藏费（退货过程中产生的仓储费用）
    storage_fee = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="退货冷藏费")
    
    # 其他费用（搬运费、损耗费等）
    other_fee = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="其他费用")
    other_fee_notes = Column(String(200), comment="其他费用说明")
    
    # 退货原因
    reason = Column(String(200), comment="退货原因")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("sys_user.id"))

    # 关系
    order_item = relationship("OrderItem", backref="return_batch_records")
    source_batch = relationship("StockBatch", foreign_keys=[source_batch_id])
    target_batch = relationship("StockBatch", foreign_keys=[target_batch_id])
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<ReturnItemBatch item:{self.order_item_id} src:{self.source_batch_id} tgt:{self.target_batch_id} qty:{self.quantity}>"

