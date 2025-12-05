from datetime import datetime
from typing import List, Set, TYPE_CHECKING
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base

# 延迟导入避免循环依赖
if TYPE_CHECKING:
    from app.models.v3.role import Role


class User(Base):
    __tablename__ = "sys_user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    # 旧角色字段（保留用于兼容，新系统用roles关联）
    role = Column(String, nullable=False, default="user")  
    # 上级ID（保留用于兼容）
    superior_id = Column(Integer, ForeignKey("sys_user.id"), nullable=True)
    status = Column(Boolean, nullable=False, default=True)  # True: 启用, False: 禁用
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 下属用户关系（旧系统兼容）
    subordinates = relationship("User", backref="superior", remote_side=[id])
    
    # 新的角色关联（V3权限系统）
    roles = relationship("Role", secondary="v3_user_roles", back_populates="users", lazy="select")
    
    @property
    def is_admin(self):
        """检查是否是超级管理员（兼容旧系统或新系统）"""
        if self.role == "admin":
            return True
        # 新系统：检查是否有超级管理员角色
        return any(r.code == "super_admin" for r in (self.roles or []))
    
    @property
    def is_manager(self):
        return self.role == "manager"
    
    @property
    def is_user(self):
        return self.role == "user"
    
    @property
    def is_active(self):
        return self.status
    
    def get_all_permissions(self) -> Set[str]:
        """获取用户的所有权限（来自所有角色）"""
        permissions = set()
        for role in (self.roles or []):
            if role.is_active:
                permissions.update(role.permissions or [])
        # 兼容旧系统：admin拥有所有权限
        if self.role == "admin":
            from app.core.permissions import PERMISSIONS
            permissions.update(PERMISSIONS.keys())
        return permissions
    
    def has_permission(self, permission: str) -> bool:
        """检查用户是否有某个权限"""
        return permission in self.get_all_permissions()
    
    def has_any_permission(self, permissions: List[str]) -> bool:
        """检查用户是否有任一权限"""
        user_perms = self.get_all_permissions()
        return any(p in user_perms for p in permissions) 