"""操作日志 Schema"""

from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    """日志响应"""
    id: int
    user_id: int
    action: str
    resource_type: str
    resource_id: Optional[int]
    resource_name: Optional[str]
    description: Optional[str]
    old_value: Optional[Dict[str, Any]]
    new_value: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    created_at: datetime
    
    # 显示字段
    action_display: str
    resource_type_display: str
    username: str = ""

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """日志列表响应"""
    data: List[AuditLogResponse]
    total: int
    page: int
    limit: int

    class Config:
        from_attributes = True

