"""
业务单管理API模块

按功能拆分为多个子模块：
- core: 核心功能、响应构建、通用查询
- crud: 创建、读取、更新、删除操作
- actions: 状态变更操作（确认、发货、收货、取消等）
- stock_ops: 库存变动逻辑
- account_ops: 账款生成逻辑
"""

from fastapi import APIRouter
from .crud import router as crud_router
from .actions import router as actions_router

router = APIRouter()

# 合并所有路由
router.include_router(crud_router)
router.include_router(actions_router)

