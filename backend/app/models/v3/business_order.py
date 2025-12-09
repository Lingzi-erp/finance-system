"""
业务单模型 - 在途仓架构

新架构：
- 装货单 (loading): X → D（在途仓）
- 卸货单 (unloading): D（在途仓）→ Y

X-D-Y 九种业务组合由来源和目标的实体类型决定：
- A: 供应商
- B: 仓库  
- C: 客户
- D: 在途仓
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class BusinessOrder(Base):
    """业务单 - 装货单或卸货单"""
    __tablename__ = "v3_business_orders"

    id = Column(Integer, primary_key=True, index=True)
    
    # 单号（自动生成）
    # 格式：{类型前缀}{年月日}{序号}
    # ZH20241202001(装货)、XH20241202001(卸货)
    order_no = Column(String(50), unique=True, nullable=False, index=True, comment="业务单号")
    
    # 业务类型（新架构）
    # loading: 装货单（X → 在途仓）
    # unloading: 卸货单（在途仓 → Y）
    # 保留旧类型用于兼容：purchase, sale, transfer, return_in, return_out
    order_type = Column(String(20), nullable=False, index=True, comment="业务类型")
    
    # 状态（简化为两种）
    # draft: 草稿（可编辑，取消则直接删除）
    # completed: 已完成（已生效，影响库存和账款）
    status = Column(String(20), nullable=False, default="draft", index=True, comment="状态")
    
    # 来源 → 目标
    source_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, comment="来源实体ID")
    target_id = Column(Integer, ForeignKey("v3_entities.id"), nullable=False, comment="目标实体ID")
    
    # 物流公司（装货单必填，卸货单继承）
    logistics_company_id = Column(Integer, ForeignKey("v3_entities.id"), comment="物流公司ID")
    
    # 金额汇总（从明细计算得出）
    total_quantity = Column(DECIMAL(12, 2), default=0, comment="总数量")
    total_amount = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="商品总金额")
    total_shipping = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="总运费")
    total_storage_fee = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="总冷藏费")
    other_fee = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="其他费用")
    total_discount = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="总折扣")
    final_amount = Column(DECIMAL(12, 2), default=Decimal("0.00"), comment="最终金额")
    
    # 业务日期（装货单=装货日期，卸货单=卸货日期）
    order_date = Column(DateTime, default=datetime.utcnow, comment="业务日期")
    
    # 保留旧字段用于兼容（新系统不再使用）
    loading_date = Column(DateTime, comment="装货日期（兼容旧数据）")
    unloading_date = Column(DateTime, comment="卸货日期（兼容旧数据）")
    
    # 备注
    notes = Column(Text, comment="备注")
    
    # 是否计算冷藏费（默认计算）
    calculate_storage_fee = Column(Boolean, default=True, comment="是否计算冷藏费")
    
    # 关联原单（用于退货单追溯）
    related_order_id = Column(Integer, ForeignKey("v3_business_orders.id"), comment="关联原单ID")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, comment="完成时间")

    # 关系
    source_entity = relationship("Entity", foreign_keys=[source_id], back_populates="orders_as_source")
    target_entity = relationship("Entity", foreign_keys=[target_id], back_populates="orders_as_target")
    logistics_company = relationship("Entity", foreign_keys=[logistics_company_id])
    creator = relationship("User", foreign_keys=[created_by])
    
    # 明细和流程
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    flows = relationship("OrderFlow", back_populates="order", cascade="all, delete-orphan")
    
    # 关联单据关系（用于批次追溯，不用于X-D-Y关联）
    related_order = relationship("BusinessOrder", remote_side=[id], foreign_keys=[related_order_id], backref="return_orders")

    def __repr__(self):
        return f"<BusinessOrder {self.order_no} ({self.order_type}: {self.status})>"
    
    @property
    def is_loading(self) -> bool:
        """是否是装货单（目标是在途仓）"""
        return self.order_type == "loading"
    
    @property
    def is_unloading(self) -> bool:
        """是否是卸货单（来源是在途仓）"""
        return self.order_type == "unloading"
    
    @property
    def type_display(self) -> str:
        """类型显示名称"""
        type_map = {
            # 新类型
            "loading": "装货单",
            "unloading": "卸货单",
            # 兼容旧类型
            "purchase": "采购",
            "sale": "销售", 
            "transfer": "调拨",
            "return_in": "客户退货",
            "return_out": "退供应商"
        }
        return type_map.get(self.order_type, self.order_type)
    
    @property
    def business_type(self) -> str:
        """
        获取X-D-Y业务类型组合
        如：A-D-B（采购）、B-D-C（销售）、A-D-C（直销）等
        """
        if not self.source_entity or not self.target_entity:
            return "未知"
        src = self.source_entity.entity_category
        tgt = self.target_entity.entity_category
        return f"{src}-{tgt}"
    
    @property
    def business_type_display(self) -> str:
        """业务类型显示名称（基于X-D-Y组合）"""
        # 这里只能判断单个二元结构
        # 完整的X-D-Y需要通过批次追溯来确定
        bt = self.business_type
        type_map = {
            # 装货单场景 (X→D)
            "A-D": "发往在途",
            "B-D": "发往在途",
            "C-D": "发往在途",
            # 卸货单场景 (D→Y)
            "D-A": "送达供应商",
            "D-B": "送达仓库",
            "D-C": "送达客户",
            # 兼容旧结构
            "A-B": "采购入库",
            "B-C": "销售出库",
            "B-A": "退供应商",
            "C-B": "客户退货",
            "B-B": "仓库调拨",
        }
        return type_map.get(bt, bt)
    
    @property
    def status_display(self) -> str:
        """状态显示名称"""
        status_map = {
            "draft": "草稿",
            "completed": "已完成"
        }
        return status_map.get(self.status, self.status)
    
    def recalculate_totals(self):
        """重新计算汇总金额"""
        self.total_quantity = sum(Decimal(str(item.quantity)) for item in self.items)
        self.total_amount = sum(item.amount for item in self.items)
        self.total_shipping = sum(item.shipping_cost or Decimal("0") for item in self.items)
        # 冷藏费和其他费用由用户手动输入
        storage_fee = self.total_storage_fee or Decimal("0")
        other = self.other_fee or Decimal("0")
        self.final_amount = self.total_amount + self.total_shipping + storage_fee + other - self.total_discount

