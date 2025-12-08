"""
业务明细模型 - 业务单中的商品行
价格、运费等交易属性都在这里，因为它们是交易时产生的

改革说明：
- 添加复式单位快照字段（composite_unit_*），确保历史订单显示正确
- 添加计价方式(pricing_mode)，记录用户是按件还是按重量计价
- 添加件数(container_count)，与基础数量(quantity)分开存储
"""

from datetime import datetime
from decimal import Decimal
import json
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Float
from sqlalchemy.orm import relationship
from app.db.base import Base


class OrderItem(Base):
    """业务明细 - 业务单中的每一行商品"""
    __tablename__ = "v3_order_items"

    id = Column(Integer, primary_key=True, index=True)
    
    # 关联业务单
    order_id = Column(Integer, ForeignKey("v3_business_orders.id"), nullable=False, index=True)
    
    # 关联商品
    product_id = Column(Integer, ForeignKey("v3_products.id"), nullable=False, index=True)
    
    # 原始明细（用于退货追溯）
    original_item_id = Column(Integer, ForeignKey("v3_order_items.id"), comment="原始明细ID")
    
    # === 商品规格快照 ===
    spec_id = Column(Integer, ForeignKey("v3_product_specs.id"), comment="商品规格ID")
    spec_name = Column(String(50), comment="规格名称快照，如：大箱")
    
    # === 复式单位快照（下单时记录，即使商品修改了也不影响历史订单显示）===
    composite_unit_id = Column(Integer, ForeignKey("v3_composite_units.id"), comment="复式单位ID（兼容旧数据）")
    composite_unit_name = Column(String(50), comment="复式单位名称快照，如：件(20kg)")
    container_name = Column(String(20), comment="容器名称快照，如：件、箱")
    unit_quantity = Column(Float, comment="每件数量快照，如：20")
    base_unit_symbol = Column(String(10), comment="基础单位符号快照，如：kg")
    
    # === 计价方式 ===
    # container: 按件计价（单价是元/件，quantity是件数）
    # weight: 按重量计价（单价是元/kg，quantity是重量）
    pricing_mode = Column(String(20), default="weight", comment="计价方式: container/weight")
    
    # 件数（使用复式单位时记录，方便追溯）
    container_count = Column(DECIMAL(12, 2), comment="件数（复式单位时）")
    
    # 数量（始终存储基础单位数量，如 kg/斤）
    quantity = Column(DECIMAL(12, 2), nullable=False, default=1, comment="基础单位数量")
    
    # === 交易时产生的信息 ===
    
    # 单价（根据计价方式，可能是元/件或元/kg）
    unit_price = Column(DECIMAL(12, 2), nullable=False, default=Decimal("0.00"), comment="单价")
    
    # 金额 = 数量 × 单价
    amount = Column(DECIMAL(12, 2), nullable=False, default=Decimal("0.00"), comment="金额")
    
    # 运费（该商品行的运费，可以按重量、体积或固定金额计算）
    shipping_cost = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="运费")
    
    # 运费计算方式（可选，用于记录运费是怎么算的）
    # fixed: 固定金额
    # per_unit: 每单位运费
    # per_kg: 每kg运费
    # per_volume: 每立方米运费
    shipping_type = Column(String(20), comment="运费计算方式")
    shipping_rate = Column(DECIMAL(12, 4), comment="运费费率（如每kg多少钱）")
    
    # === 运输信息 ===
    logistics_company_id = Column(Integer, ForeignKey("v3_entities.id"), comment="物流公司ID（用于生成运费账单）")
    vehicle_id = Column(Integer, ForeignKey("v3_vehicles.id"), comment="车辆ID")
    plate_number = Column(String(20), comment="车牌号")
    driver_phone = Column(String(20), comment="司机联系方式（每次运输可能不同）")
    logistics_company = Column(String(100), comment="物流公司名称（冗余字段）")
    invoice_no = Column(String(50), comment="发票号")
    
    # 折扣（该行的折扣）
    discount = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="折扣")
    
    # 小计 = 金额 + 运费 - 折扣
    subtotal = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="小计")
    
    # 成本信息（销售时记录，用于利润计算）
    cost_price = Column(DECIMAL(12, 2), comment="成本单价（下单时从商品复制）")
    cost_amount = Column(DECIMAL(12, 2), comment="成本金额 = 成本单价 × 数量")
    profit = Column(DECIMAL(12, 2), comment="毛利 = 金额 - 成本金额")
    
    # === 批次相关（采购单使用）===
    # 毛重（采购时录入，用于计算净重、运费、仓储费）
    gross_weight = Column(DECIMAL(12, 2), comment="毛重（采购时的过磅重量）")
    # 扣重公式（用于从毛重计算净重）
    deduction_formula_id = Column(Integer, ForeignKey("v3_deduction_formulas.id"), comment="扣重公式ID")
    # 仓储费率（采购时约定）
    storage_rate = Column(DECIMAL(10, 4), comment="仓储费率（元/斤/天）")
    # 生成的批次ID（采购完成后填入）
    batch_id = Column(Integer, ForeignKey("v3_stock_batches.id"), comment="生成的批次ID")
    
    # === 批次分配（退货/销售时使用）===
    # JSON格式: [{"batch_id": 1, "quantity": 10}, {"batch_id": 2, "quantity": 5}]
    batch_allocations_json = Column(Text, comment="批次分配JSON（退货时记录从哪些批次退货）")
    
    # 备注
    notes = Column(Text, comment="备注")
    
    # 审计字段
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    order = relationship("BusinessOrder", back_populates="items")
    product = relationship("Product", back_populates="order_items")
    original_item = relationship("OrderItem", remote_side=[id], backref="return_items", foreign_keys=[original_item_id])
    spec = relationship("ProductSpec", foreign_keys=[spec_id])
    composite_unit = relationship("CompositeUnit", foreign_keys=[composite_unit_id])
    deduction_formula = relationship("DeductionFormula", foreign_keys=[deduction_formula_id])
    batch = relationship("StockBatch", foreign_keys=[batch_id])

    def __repr__(self):
        return f"<OrderItem {self.product_id} x {self.quantity} @ {self.unit_price}>"
    
    def calculate(self):
        """计算金额"""
        self.amount = Decimal(str(self.quantity)) * self.unit_price
        self.subtotal = self.amount + (self.shipping_cost or Decimal("0")) - (self.discount or Decimal("0"))
    
    def calculate_profit(self):
        """计算利润（仅对销售单有意义）"""
        if self.cost_price:
            self.cost_amount = Decimal(str(self.quantity)) * self.cost_price
            self.profit = self.amount - self.cost_amount
        else:
            self.cost_amount = None
            self.profit = None
    
    @property
    def batch_allocations(self):
        """获取批次分配列表"""
        if self.batch_allocations_json:
            try:
                return json.loads(self.batch_allocations_json)
            except (json.JSONDecodeError, TypeError):
                return []
        return []
    
    @batch_allocations.setter
    def batch_allocations(self, value):
        """设置批次分配列表"""
        if value:
            self.batch_allocations_json = json.dumps(value)
        else:
            self.batch_allocations_json = None

