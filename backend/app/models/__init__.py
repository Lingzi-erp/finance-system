# models包初始化文件
# V3模型 - 完全使用新架构

from app.models.user import User
from app.models.v3.entity import Entity
from app.models.v3.category import Category
from app.models.v3.specification import Specification
from app.models.v3.unit import UnitGroup, Unit, CompositeUnit
from app.models.v3.product import Product
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.order_flow import OrderFlow
from app.models.v3.role import Role
from app.models.v3.stock import Stock, StockFlow

__all__ = [
    "User",
    "Entity",
    "Category",
    "Specification",
    "UnitGroup",
    "Unit",
    "CompositeUnit",
    "Product",
    "BusinessOrder",
    "OrderItem",
    "OrderFlow",
    "Role",
    "Stock",
    "StockFlow",
]
