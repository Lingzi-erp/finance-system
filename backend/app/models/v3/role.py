"""
角色模型
RBAC权限管理的核心
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship
from app.db.base import Base


# 用户-角色关联表
user_roles = Table(
    'v3_user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('sys_user.id'), primary_key=True),
    Column('role_id', Integer, ForeignKey('v3_roles.id'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow)
)


class Role(Base):
    """角色模型"""
    __tablename__ = "v3_roles"

    id = Column(Integer, primary_key=True, index=True)
    
    # 基本信息
    name = Column(String(50), nullable=False, unique=True, comment="角色名称")
    code = Column(String(50), unique=True, index=True, comment="角色编码")
    description = Column(String(200), comment="角色描述")
    
    # 权限列表（JSON数组，存储权限代码）
    # 如：["entity.view", "entity.create", "order.view"]
    permissions = Column(JSON, nullable=False, default=[], comment="权限列表")
    
    # 是否是系统预置角色（不可删除）
    is_system = Column(Boolean, default=False, comment="是否系统角色")
    
    # 是否启用
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    users = relationship("User", secondary=user_roles, back_populates="roles")

    def __repr__(self):
        return f"<Role {self.code}: {self.name}>"
    
    def has_permission(self, permission: str) -> bool:
        """检查角色是否有某个权限"""
        return permission in (self.permissions or [])

