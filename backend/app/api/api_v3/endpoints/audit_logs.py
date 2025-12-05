"""操作日志API"""

from typing import Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.audit_log import AuditLog
from app.schemas.v3.audit_log import AuditLogResponse, AuditLogListResponse

router = APIRouter()

def build_log_response(log: AuditLog) -> AuditLogResponse:
    """构建日志响应"""
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        resource_name=log.resource_name,
        description=log.description,
        old_value=log.old_value,
        new_value=log.new_value,
        ip_address=log.ip_address,
        created_at=log.created_at,
        action_display=log.action_display,
        resource_type_display=log.resource_type_display,
        username=log.user.username if log.user else ""
    )

@router.get("/", response_model=AuditLogListResponse)
async def list_logs(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)) -> Any:
    """获取操作日志列表"""
    query = select(AuditLog).options(selectinload(AuditLog.user))
    
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if start_date:
        conditions.append(AuditLog.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(AuditLog.created_at <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 计算总数
    count_query = select(func.count(AuditLog.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页查询
    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return AuditLogListResponse(
        data=[build_log_response(log) for log in logs],
        total=total,
        page=page,
        limit=limit
    )

# 日志记录工具函数
async def create_audit_log(
    db: AsyncSession,
    user_id: int,
    action: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    resource_name: Optional[str] = None,
    description: Optional[str] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    ip_address: Optional[str] = None) -> AuditLog:
    """创建审计日志"""
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        description=description,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address
    )
    db.add(log)
    return log

