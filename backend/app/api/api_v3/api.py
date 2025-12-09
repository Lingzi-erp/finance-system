"""V3 API 路由聚合 - 单机版（无认证）"""
from fastapi import APIRouter

from app.api.api_v3.endpoints import (
    entities, products, stocks, batches, deduction_formulas,
    categories, specifications, units,
    accounts, payments, payment_methods, audit_logs, backup, system,
    initial_data
)
# 使用拆分后的 orders 模块
from app.api.api_v3.endpoints.orders import router as orders_router

api_router = APIRouter()

# V3 核心业务API
api_router.include_router(entities.router, prefix="/entities", tags=["实体管理"])
api_router.include_router(categories.router, prefix="/categories", tags=["商品分类"])
api_router.include_router(specifications.router, prefix="/specifications", tags=["规格模板"])
api_router.include_router(units.router, prefix="/units", tags=["单位管理"])
api_router.include_router(products.router, prefix="/products", tags=["商品管理"])
api_router.include_router(orders_router, prefix="/orders", tags=["业务单管理"])
api_router.include_router(stocks.router, prefix="/stocks", tags=["库存管理"])
api_router.include_router(batches.router, prefix="/batches", tags=["批次管理"])
api_router.include_router(deduction_formulas.router, prefix="/deduction-formulas", tags=["扣重公式"])

# V3 财务管理API
api_router.include_router(accounts.router, prefix="/accounts", tags=["应收应付账款"])
api_router.include_router(payment_methods.router, prefix="/payment-methods", tags=["收付款方式"])
api_router.include_router(payments.router, prefix="/payments", tags=["收付款管理"])

# V3 系统API
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["操作日志"])
api_router.include_router(backup.router, prefix="/backup", tags=["数据备份"])
api_router.include_router(system.router, prefix="/system", tags=["系统管理"])
api_router.include_router(initial_data.router, prefix="/initial-data", tags=["期初数据"])
