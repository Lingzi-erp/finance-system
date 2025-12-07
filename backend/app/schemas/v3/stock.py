"""库存Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


# ===== 库存 =====
class StockBase(BaseModel):
    """库存基础字段"""
    warehouse_id: int = Field(..., description="仓库ID")
    product_id: int = Field(..., description="商品ID")
    safety_stock: int = Field(default=0, ge=0, description="安全库存")


class StockCreate(StockBase):
    """创建库存（一般由系统自动创建）"""
    quantity: int = Field(default=0, ge=0, description="初始库存")


class StockUpdate(BaseModel):
    """更新库存（仅允许更新安全库存）"""
    safety_stock: Optional[int] = Field(None, ge=0, description="安全库存")


class StockAdjust(BaseModel):
    """库存调整（盘点）"""
    new_quantity: int = Field(..., ge=0, description="调整后数量")
    reason: str = Field(..., max_length=200, description="调整原因")


class StockResponse(StockBase):
    """库存响应"""
    id: int
    quantity: int
    reserved_quantity: int
    available_quantity: int
    is_low_stock: bool
    last_check_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # 关联信息
    warehouse_name: str = ""
    warehouse_code: str = ""
    product_name: str = ""
    product_code: str = ""
    product_specification: str = ""  # 商品规格
    product_category: str = ""  # 商品分类
    product_unit: str = ""
    
    # 包装换算信息（从商品规格获取，用于显示重量换算）
    container_name: Optional[str] = None  # 容器名称：件、箱
    unit_quantity: Optional[float] = None  # 每件数量：15
    base_unit_symbol: Optional[str] = None  # 基础单位：kg

    class Config:
        from_attributes = True


class StockListResponse(BaseModel):
    """库存列表响应"""
    data: List[StockResponse]
    total: int
    page: int
    limit: int


class StockSummary(BaseModel):
    """库存汇总（按商品）"""
    product_id: int
    product_name: str
    product_code: str
    product_unit: str
    total_quantity: int
    total_reserved: int
    total_available: int
    warehouse_count: int


# ===== 库存流水 =====
class StockFlowBase(BaseModel):
    """库存流水基础字段"""
    flow_type: str = Field(..., description="流水类型：in/out/reserve/release/adjust")
    quantity_change: int = Field(..., description="变动数量")
    reason: Optional[str] = Field(None, max_length=200, description="变动原因")


class StockFlowCreate(StockFlowBase):
    """创建库存流水（一般由系统自动创建）"""
    stock_id: int
    order_id: Optional[int] = None
    order_item_id: Optional[int] = None


class StockFlowResponse(StockFlowBase):
    """库存流水响应"""
    id: int
    stock_id: int
    order_id: Optional[int] = None
    order_item_id: Optional[int] = None
    quantity_before: int
    quantity_after: int
    type_display: str = ""
    operator_id: int
    operator_name: str = ""
    operated_at: datetime
    created_at: datetime
    
    # 关联信息
    warehouse_name: str = ""
    product_name: str = ""
    product_specification: str = ""  # 商品规格
    order_no: Optional[str] = None
    
    # 是否可撤销（仅手动调整且未被重算覆盖的可撤销）
    can_revert: bool = False

    class Config:
        from_attributes = True


class StockFlowListResponse(BaseModel):
    """库存流水列表响应"""
    data: List[StockFlowResponse]
    total: int
    page: int
    limit: int


# ===== 库存查询 =====
class WarehouseStock(BaseModel):
    """仓库库存查询结果"""
    warehouse_id: int
    warehouse_name: str
    warehouse_code: str
    product_id: int
    product_name: str
    product_code: str
    product_unit: str
    quantity: int
    reserved_quantity: int
    available_quantity: int


class ProductStock(BaseModel):
    """商品库存查询结果（跨仓库）"""
    product_id: int
    product_name: str
    product_code: str
    product_unit: str
    warehouses: List[WarehouseStock]
    total_quantity: int
    total_available: int

