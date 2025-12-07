"""库存批次Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal


# ===== 库存批次 =====
class StockBatchBase(BaseModel):
    """批次基础字段"""
    product_id: int = Field(..., description="商品ID")
    storage_entity_id: int = Field(..., description="存放仓库/冷库ID")
    source_entity_id: Optional[int] = Field(None, description="来源供应商ID")
    
    # 毛重/净重
    gross_weight: Optional[Decimal] = Field(None, ge=0, description="毛重（含冰、包装）")
    tare_weight: Decimal = Field(default=Decimal("0"), ge=0, description="皮重（冰块、包装）")
    initial_quantity: Decimal = Field(..., gt=0, description="净重/初始数量")
    
    # 成本（按净重）
    cost_price: Decimal = Field(..., ge=0, description="采购单价（元/斤，按净重）")
    
    # 仓储费（按毛重）
    storage_rate: Decimal = Field(default=Decimal("0"), ge=0, description="仓储费率（元/斤/天，按毛重）")
    
    # 运费（按毛重）
    freight_cost: Decimal = Field(default=Decimal("0"), ge=0, description="运费（按毛重计算）")
    freight_rate: Optional[Decimal] = Field(None, ge=0, description="运费费率（元/斤）")
    
    notes: Optional[str] = Field(None, max_length=500, description="备注")


class StockBatchCreate(StockBatchBase):
    """创建批次"""
    source_order_id: Optional[int] = Field(None, description="来源采购单ID")
    deduction_formula_id: Optional[int] = Field(None, description="扣重公式ID（选择公式后自动计算净重）")
    storage_start_date: Optional[datetime] = Field(None, description="开始计费日期")
    extra_cost: Decimal = Field(default=Decimal("0"), ge=0, description="其他费用")
    extra_cost_notes: Optional[str] = Field(None, max_length=200, description="其他费用说明")
    is_initial: bool = Field(default=False, description="是否期初数据")
    received_at: Optional[datetime] = Field(None, description="入库日期")


class StockBatchUpdate(BaseModel):
    """更新批次"""
    gross_weight: Optional[Decimal] = Field(None, ge=0, description="毛重")
    tare_weight: Optional[Decimal] = Field(None, ge=0, description="皮重")
    storage_rate: Optional[Decimal] = Field(None, ge=0, description="仓储费率")
    storage_fee_paid: Optional[Decimal] = Field(None, ge=0, description="已付仓储费")
    freight_cost: Optional[Decimal] = Field(None, ge=0, description="运费")
    freight_rate: Optional[Decimal] = Field(None, ge=0, description="运费费率")
    extra_cost: Optional[Decimal] = Field(None, ge=0, description="其他费用")
    extra_cost_notes: Optional[str] = Field(None, max_length=200, description="其他费用说明")
    notes: Optional[str] = Field(None, max_length=500, description="备注")


class StockBatchAdjust(BaseModel):
    """批次数量调整（盘点）"""
    new_quantity: Decimal = Field(..., ge=0, description="调整后数量")
    reason: str = Field(..., max_length=200, description="调整原因")


class StockBatchResponse(BaseModel):
    """批次响应"""
    id: int
    batch_no: str
    product_id: int
    storage_entity_id: int
    source_entity_id: Optional[int] = None
    source_order_id: Optional[int] = None
    deduction_formula_id: Optional[int] = None
    
    # 毛重/净重
    gross_weight: Optional[Decimal] = None
    tare_weight: Decimal = Decimal("0")
    current_gross_weight: Optional[Decimal] = None
    
    # 扣重公式信息
    deduction_formula_name: str = ""
    deduction_formula_display: str = ""
    
    # 数量（净重）
    initial_quantity: Decimal
    current_quantity: Decimal
    reserved_quantity: Decimal
    available_quantity: Decimal
    
    # 成本（按净重）
    cost_price: Decimal
    cost_amount: Optional[Decimal] = None
    
    # 运费（按毛重）
    freight_cost: Decimal = Decimal("0")
    freight_rate: Optional[Decimal] = None
    
    # 仓储费（按毛重）
    storage_start_date: Optional[datetime] = None
    storage_rate: Decimal
    storage_fee_paid: Decimal
    storage_days: int = 0
    accumulated_storage_fee: Decimal = Decimal("0")
    
    # 其他费用
    extra_cost: Decimal
    extra_cost_notes: Optional[str] = None
    
    # 计算字段
    total_cost: Decimal = Decimal("0")
    real_cost_price: Decimal = Decimal("0")
    
    # 状态
    status: str
    status_display: str = ""
    is_depleted: bool = False
    is_initial: bool = False
    
    # 日期
    received_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # 关联信息
    product_name: str = ""
    product_code: str = ""
    product_unit: str = ""
    product_specification: str = ""  # 商品规格
    storage_entity_name: str = ""
    storage_entity_code: str = ""
    source_entity_name: str = ""
    source_entity_code: str = ""
    source_order_no: str = ""
    creator_name: str = ""
    
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class StockBatchListResponse(BaseModel):
    """批次列表响应"""
    data: List[StockBatchResponse]
    total: int
    page: int
    limit: int


class StockBatchSimple(BaseModel):
    """批次简要信息（用于选择）"""
    id: int
    batch_no: str
    product_id: int
    product_name: str
    storage_entity_name: str
    # 重量
    gross_weight: Optional[Decimal] = None
    current_quantity: Decimal  # 净重
    available_quantity: Decimal
    # 成本
    cost_price: Decimal
    real_cost_price: Decimal
    # 其他
    storage_days: int
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


# ===== 批次出货记录 =====
class OrderItemBatchCreate(BaseModel):
    """创建出货记录"""
    batch_id: int = Field(..., description="批次ID")
    quantity: Decimal = Field(..., gt=0, description="出货数量")


class OrderItemBatchResponse(BaseModel):
    """出货记录响应（批次追溯 - 出库去向）"""
    id: int
    order_item_id: int
    batch_id: int
    batch_no: str
    quantity: Decimal
    cost_price: Optional[Decimal] = None
    cost_amount: Optional[Decimal] = None
    created_at: datetime
    
    # 销售单信息（出库去向）
    order_id: Optional[int] = None
    order_no: str = ""
    order_type: str = ""
    order_type_display: str = ""
    order_date: Optional[datetime] = None
    # 客户信息
    customer_id: Optional[int] = None
    customer_name: str = ""
    # 销售金额
    sale_price: Optional[Decimal] = None
    sale_amount: Optional[Decimal] = None
    # 利润
    profit: Optional[Decimal] = None
    
    # 批次信息（保留兼容）
    storage_entity_name: str = ""
    source_entity_name: str = ""

    class Config:
        from_attributes = True


# ===== 期初批次导入 =====
class InitialBatchItem(BaseModel):
    """期初批次单项"""
    product_id: int = Field(..., description="商品ID")
    storage_entity_id: int = Field(..., description="存放仓库ID")
    gross_weight: Optional[Decimal] = Field(None, ge=0, description="毛重")
    tare_weight: Decimal = Field(default=Decimal("0"), ge=0, description="皮重")
    quantity: Decimal = Field(..., gt=0, description="净重/数量")
    cost_price: Decimal = Field(..., ge=0, description="成本单价（按净重）")
    storage_rate: Decimal = Field(default=Decimal("0"), ge=0, description="仓储费率（按毛重）")
    freight_cost: Decimal = Field(default=Decimal("0"), ge=0, description="运费")
    notes: Optional[str] = Field(None, description="备注")


class InitialBatchImport(BaseModel):
    """期初批次批量导入"""
    items: List[InitialBatchItem] = Field(..., min_length=1, description="批次列表")
    as_of_date: Optional[datetime] = Field(None, description="期初日期")


# ===== 批次查询/统计 =====
class BatchSummaryByProduct(BaseModel):
    """按商品汇总批次"""
    product_id: int
    product_name: str
    product_code: str
    product_unit: str
    batch_count: int
    total_quantity: Decimal
    total_available: Decimal
    avg_cost_price: Decimal
    total_cost: Decimal


class BatchSummaryByStorage(BaseModel):
    """按存放位置汇总批次"""
    storage_entity_id: int
    storage_entity_name: str
    storage_entity_code: str
    batch_count: int
    total_quantity: Decimal
    total_storage_fee: Decimal


class BatchTraceRecord(BaseModel):
    """批次追溯记录"""
    record_type: str  # in: 入库, out: 出库, adjust: 调整
    record_date: datetime
    quantity: Decimal
    order_id: Optional[int] = None
    order_no: Optional[str] = None
    entity_name: str = ""  # 来源/目标实体
    operator_name: str = ""
    notes: Optional[str] = None

