"""统计报表 Schema"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


# ==================== 销售统计 ====================

class SalesStatItem(BaseModel):
    """销售统计项"""
    date: str = ""
    entity_id: Optional[int] = None
    entity_name: str = ""
    product_id: Optional[int] = None
    product_name: str = ""
    order_count: int = 0
    total_quantity: int = 0
    total_amount: float = 0
    total_cost: float = 0
    total_profit: float = 0
    profit_rate: float = 0  # 利润率


class SalesStatResponse(BaseModel):
    """销售统计响应"""
    items: List[SalesStatItem]
    summary: Dict[str, Any] = {}
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ==================== 采购统计 ====================

class PurchaseStatItem(BaseModel):
    """采购统计项"""
    date: str = ""
    entity_id: Optional[int] = None
    entity_name: str = ""
    product_id: Optional[int] = None
    product_name: str = ""
    order_count: int = 0
    total_quantity: int = 0
    total_amount: float = 0


class PurchaseStatResponse(BaseModel):
    """采购统计响应"""
    items: List[PurchaseStatItem]
    summary: Dict[str, Any] = {}
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ==================== 库存分析 ====================

class StockAnalysisItem(BaseModel):
    """库存分析项"""
    warehouse_id: int
    warehouse_name: str = ""
    product_id: int
    product_name: str = ""
    product_code: str = ""
    quantity: int = 0
    reserved_quantity: int = 0
    available_quantity: int = 0
    safety_stock: int = 0
    cost_price: float = 0
    stock_value: float = 0  # 库存金额 = 数量 × 成本价
    is_low_stock: bool = False  # 是否低库存


class StockAnalysisResponse(BaseModel):
    """库存分析响应"""
    items: List[StockAnalysisItem]
    total_stock_value: float = 0
    low_stock_count: int = 0
    out_of_stock_count: int = 0


# ==================== 库存预警 ====================

class StockWarningItem(BaseModel):
    """库存预警项"""
    warehouse_id: int
    warehouse_name: str = ""
    product_id: int
    product_name: str = ""
    product_code: str = ""
    quantity: int = 0
    safety_stock: int = 0
    shortage: int = 0  # 缺口 = 安全库存 - 当前库存
    warning_level: str = "low"  # low: 低库存, out: 缺货


class StockWarningResponse(BaseModel):
    """库存预警响应"""
    items: List[StockWarningItem]
    low_stock_count: int = 0
    out_of_stock_count: int = 0


# ==================== 仪表盘 ====================

class DashboardData(BaseModel):
    """仪表盘数据"""
    # 今日数据
    today_sales: float = 0
    today_sales_count: int = 0
    today_purchase: float = 0
    today_purchase_count: int = 0
    today_received: float = 0
    today_paid: float = 0
    
    # 本月数据
    month_sales: float = 0
    month_sales_count: int = 0
    month_purchase: float = 0
    month_purchase_count: int = 0
    month_profit: float = 0
    
    # 待处理
    pending_orders: int = 0
    draft_orders: int = 0
    
    # 账款
    total_receivable: float = 0
    total_payable: float = 0
    overdue_receivable: float = 0
    
    # 库存预警
    low_stock_count: int = 0
    out_of_stock_count: int = 0
    
    # 最近业务单
    recent_orders: List[Dict[str, Any]] = []
    
    # 销售趋势（最近7天/30天）
    sales_trend: List[Dict[str, Any]] = []


# ==================== 实体排行 ====================

class EntityRankItem(BaseModel):
    """实体排行项"""
    entity_id: int
    entity_name: str = ""
    entity_code: str = ""
    order_count: int = 0
    total_amount: float = 0
    total_profit: float = 0


class EntityRankResponse(BaseModel):
    """实体排行响应"""
    items: List[EntityRankItem]
    rank_type: str = "sales"  # sales: 销售排行, purchase: 采购排行


# ==================== 商品排行 ====================

class ProductRankItem(BaseModel):
    """商品排行项"""
    product_id: int
    product_name: str = ""
    product_code: str = ""
    total_quantity: int = 0
    total_amount: float = 0
    total_profit: float = 0


class ProductRankResponse(BaseModel):
    """商品排行响应"""
    items: List[ProductRankItem]
    rank_type: str = "sales"  # sales: 销量排行, profit: 利润排行

