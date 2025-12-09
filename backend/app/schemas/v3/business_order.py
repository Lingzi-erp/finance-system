"""业务单Schema"""
from typing import Optional, List, Any
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal


# ===== 明细 =====
class OrderItemBase(BaseModel):
    """明细基础字段"""
    product_id: int = Field(..., description="商品ID")
    quantity: float = Field(..., gt=0, description="数量/净重（支持小数）")
    unit_price: float = Field(..., ge=0, description="单价")
    shipping_cost: float = Field(default=0, ge=0, description="运费")
    shipping_type: Optional[str] = Field(None, description="运费计算方式")
    shipping_rate: Optional[float] = Field(None, description="运费费率")
    discount: float = Field(default=0, ge=0, description="折扣")
    notes: Optional[str] = Field(None, description="备注")
    # 运输信息
    logistics_company_id: Optional[int] = Field(None, description="物流公司ID（用于生成运费账单）")
    vehicle_id: Optional[int] = Field(None, description="车辆ID")
    plate_number: Optional[str] = Field(None, max_length=20, description="车牌号")
    driver_phone: Optional[str] = Field(None, max_length=20, description="司机联系方式（每次运输可能不同）")
    logistics_company: Optional[str] = Field(None, max_length=100, description="物流公司名称（冗余）")
    invoice_no: Optional[str] = Field(None, max_length=50, description="发票号")


class BatchAllocation(BaseModel):
    """批次分配（销售时指定从哪些批次出货）"""
    batch_id: int = Field(..., description="批次ID")
    quantity: float = Field(..., gt=0, description="从该批次出货的数量")


class OrderItemCreate(OrderItemBase):
    """创建明细"""
    original_item_id: Optional[int] = None
    # === 商品规格（从 ProductSpec 获取）===
    spec_id: Optional[int] = Field(None, description="商品规格ID")
    spec_name: Optional[str] = Field(None, max_length=50, description="规格名称快照，如：大件、小件")
    # === 包装换算信息（从 ProductSpec 获取）===
    container_name: Optional[str] = Field(None, max_length=20, description="容器名称，如：件、箱")
    unit_quantity: Optional[float] = Field(None, description="每件数量，如：15")
    base_unit_symbol: Optional[str] = Field(None, max_length=10, description="基础单位符号，如：kg")
    # === 计价方式 ===
    pricing_mode: Optional[str] = Field("weight", description="计价方式: container(按件)/weight(按重量)")
    container_count: Optional[float] = Field(None, ge=0, description="件数")
    # 批次相关（采购单使用）
    gross_weight: Optional[float] = Field(None, ge=0, description="毛重（采购时的过磅重量）")
    deduction_formula_id: Optional[int] = Field(None, description="扣重公式ID（用于从毛重计算净重）")
    storage_rate: Optional[float] = Field(None, ge=0, description="仓储费率（元/斤/天）")
    # 批次分配（销售单使用）
    batch_allocations: Optional[List[BatchAllocation]] = Field(None, description="批次分配（销售时指定从哪些批次出货）")


class OrderItemResponse(OrderItemBase):
    """明细响应"""
    id: int
    order_id: int
    amount: float
    subtotal: float
    product_name: str = ""
    product_code: str = ""
    product_unit: str = ""
    original_item_id: Optional[int] = None
    returned_quantity: float = 0
    returnable_quantity: float = 0
    # === 商品规格（从订单明细快照读取）===
    spec_id: Optional[int] = None
    spec_name: Optional[str] = None  # 如：大件、小件
    # === 包装换算信息（从订单明细快照读取，确保历史数据准确）===
    container_name: Optional[str] = None  # 如：件、箱
    unit_quantity: Optional[float] = None  # 每件多少，如 15
    base_unit_symbol: Optional[str] = None  # 基础单位符号，如 kg
    # === 计价方式 ===
    pricing_mode: str = "weight"  # container/weight
    container_count: Optional[float] = None  # 件数
    # 批次相关
    gross_weight: Optional[float] = None
    deduction_formula_id: Optional[int] = None
    deduction_formula_name: str = ""
    storage_rate: Optional[float] = None
    batch_id: Optional[int] = None
    batch_no: str = ""
    # 成本相关
    cost_price: Optional[float] = None
    cost_amount: Optional[float] = None
    profit: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ===== 流程 =====
class OrderFlowBase(BaseModel):
    """流程基础字段"""
    flow_type: str = Field(..., description="流程类型")
    description: Optional[str] = Field(None, max_length=200, description="描述")
    meta_data: Optional[dict] = Field(None, description="扩展数据")
    notes: Optional[str] = Field(None, description="备注")


class OrderFlowCreate(OrderFlowBase):
    """创建流程"""
    pass


class OrderFlowResponse(OrderFlowBase):
    """流程响应"""
    id: int
    order_id: int
    flow_status: str
    type_display: str = ""
    operator_id: int
    operator_name: str = ""
    operated_at: datetime

    class Config:
        from_attributes = True


# ===== 业务单 =====
class BusinessOrderBase(BaseModel):
    """业务单基础字段"""
    # 新架构: loading(装货单), unloading(卸货单)
    # 兼容旧类型: purchase,sale,return_in,return_out,transfer
    order_type: str = Field(..., description="业务类型：loading(装货单),unloading(卸货单)")
    source_id: int = Field(..., description="来源实体ID")
    target_id: int = Field(..., description="目标实体ID")
    logistics_company_id: Optional[int] = Field(None, description="物流公司ID（装货单必填）")
    order_date: Optional[datetime] = Field(None, description="业务日期（装货单=装货日期，卸货单=卸货日期）")
    loading_date: Optional[datetime] = Field(None, description="装货日期（兼容旧数据）")
    unloading_date: Optional[datetime] = Field(None, description="卸货日期（兼容旧数据）")
    total_discount: float = Field(default=0, ge=0, description="总折扣")
    total_shipping: float = Field(default=0, ge=0, description="总运费")
    total_storage_fee: float = Field(default=0, ge=0, description="总冷藏费")
    other_fee: float = Field(default=0, ge=0, description="其他费用")
    calculate_storage_fee: bool = Field(default=True, description="是否计算冷藏费")
    notes: Optional[str] = Field(None, description="备注")


class BusinessOrderCreate(BusinessOrderBase):
    """创建业务单"""
    items: List[OrderItemCreate] = Field(..., min_length=1, description="明细列表")


class BusinessOrderUpdate(BaseModel):
    """更新业务单（仅草稿状态可更新）"""
    source_id: Optional[int] = None
    target_id: Optional[int] = None
    logistics_company_id: Optional[int] = None
    order_date: Optional[datetime] = None
    loading_date: Optional[datetime] = None
    unloading_date: Optional[datetime] = None
    total_discount: Optional[float] = None
    total_shipping: Optional[float] = None
    total_storage_fee: Optional[float] = None
    other_fee: Optional[float] = None
    calculate_storage_fee: Optional[bool] = None
    notes: Optional[str] = None
    items: Optional[List[OrderItemCreate]] = None


class BusinessOrderResponse(BusinessOrderBase):
    """业务单响应"""
    id: int
    order_no: str
    status: str
    type_display: str = ""
    status_display: str = ""
    business_type: str = ""  # X-D-Y业务类型，如 "A-D", "D-B"
    business_type_display: str = ""  # 业务类型显示名称
    
    # 来源/目标信息
    source_name: str = ""
    source_code: str = ""
    source_type: str = ""  # 实体类型：supplier/customer/warehouse/transit
    target_name: str = ""
    target_code: str = ""
    target_type: str = ""  # 实体类型
    
    # 物流公司信息
    logistics_company_name: str = ""
    logistics_company_code: str = ""
    
    # 汇总
    total_quantity: float = 0
    total_amount: float = 0
    total_shipping: float = 0
    total_storage_fee: float = 0
    other_fee: float = 0
    final_amount: float = 0
    
    # 明细和流程
    items: List[OrderItemResponse] = []
    flows: List[OrderFlowResponse] = []
    
    # 装卸货日期（兼容旧数据）
    loading_date: Optional[datetime] = None
    unloading_date: Optional[datetime] = None
    
    # 审计（简化）
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    related_order_id: Optional[int] = None
    related_order: Optional["RelatedOrderInfo"] = None
    return_orders: List["RelatedOrderInfo"] = []

    class Config:
        from_attributes = True


class BusinessOrderListResponse(BaseModel):
    """业务单列表响应"""
    data: List[BusinessOrderResponse]
    total: int
    page: int
    limit: int


# ===== 状态变更 =====
class OrderStatusChange(BaseModel):
    """状态变更请求"""
    action: str = Field(..., description="操作：confirm,ship,receive,complete,cancel,return")
    description: Optional[str] = Field(None, description="操作描述")
    meta_data: Optional[dict] = Field(None, description="扩展数据（如物流单号）")
    notes: Optional[str] = Field(None, description="备注")
    return_target_id: Optional[int] = Field(None, description="退货目标实体ID（action=return 时可指定）")
    return_date: Optional[datetime] = Field(None, description="退货日期（action=return 时可指定）")
    return_items: Optional[List["ReturnItemInput"]] = Field(None, description="退货明细（用于部分退货）")
    return_shipping: Optional[float] = Field(None, ge=0, description="退货总运费（action=return 时可指定）")


class ReturnBatchInput(BaseModel):
    """退货批次分配"""
    batch_id: int = Field(..., description="批次ID")
    quantity: float = Field(..., gt=0, description="从该批次退货的数量")
    storage_fee: float = Field(default=0, ge=0, description="该批次的冷藏费")
    reason: Optional[str] = Field(None, max_length=200, description="退货原因")


class ReturnItemInput(BaseModel):
    order_item_id: int = Field(..., description="原单明细ID")
    quantity: float = Field(..., gt=0, description="退货数量（支持小数）")
    shipping_cost: Optional[float] = Field(None, ge=0, description="退货运费（可选，不填则按比例计算）")
    storage_fee: Optional[float] = Field(None, ge=0, description="退货冷藏费（可选）")
    # 批次分配（可选，如果不提供则按FIFO自动分配）
    batch_allocations: Optional[List[ReturnBatchInput]] = Field(None, description="批次分配（退供应商时指定从哪些批次退）")


class RelatedOrderInfo(BaseModel):
    id: int
    order_no: str
    order_type: str
    type_display: str
    status: str
    status_display: str
    total_quantity: float
    final_amount: float
    created_at: datetime
    completed_at: Optional[datetime] = None


BusinessOrderResponse.model_rebuild()
OrderStatusChange.model_rebuild()
OrderItemCreate.model_rebuild()
ReturnItemInput.model_rebuild()

