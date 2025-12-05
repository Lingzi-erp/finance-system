"""角色Schema"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class RoleBase(BaseModel):
    """角色基础字段"""
    name: str = Field(..., min_length=1, max_length=50, description="角色名称")
    description: Optional[str] = Field(None, max_length=200, description="角色描述")
    permissions: List[str] = Field(default=[], description="权限列表")
    is_active: bool = Field(default=True, description="是否启用")


class RoleCreate(RoleBase):
    """创建角色"""
    pass


class RoleUpdate(BaseModel):
    """更新角色"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RoleResponse(RoleBase):
    """角色响应"""
    id: int
    code: str
    is_system: bool
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    user_count: int = 0  # 使用该角色的用户数

    class Config:
        from_attributes = True


class RoleListResponse(BaseModel):
    """角色列表响应"""
    data: List[RoleResponse]
    total: int


# 权限相关
class PermissionInfo(BaseModel):
    """权限信息"""
    code: str
    name: str
    module: str
    description: str


class PermissionModule(BaseModel):
    """权限模块"""
    key: str
    name: str
    icon: str
    permissions: List[PermissionInfo]


class PermissionListResponse(BaseModel):
    """权限列表响应（按模块分组）"""
    modules: List[PermissionModule]


# 用户角色分配
class UserRoleAssign(BaseModel):
    """用户角色分配"""
    user_id: int
    role_ids: List[int]

