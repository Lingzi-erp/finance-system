"""
操作日志模型 - 记录系统中的所有重要操作
用于审计追踪和问题排查
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship
from app.db.base import Base


class AuditLog(Base):
    """操作日志 - 审计追踪
    
    记录以下类型的操作：
    - 实体的增删改
    - 商品的增删改
    - 业务单的关键操作
    - 收付款操作
    - 库存调整
    - 用户登录等
    """
    __tablename__ = "v3_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # 操作人
    user_id = Column(Integer, ForeignKey("sys_user.id"), nullable=False, index=True)
    
    # 操作类型
    # create: 创建
    # update: 更新
    # delete: 删除
    # login: 登录
    # logout: 登出
    # confirm: 确认
    # cancel: 取消
    # payment: 收付款
    # adjust: 调整
    action = Column(String(20), nullable=False, index=True, comment="操作类型")
    
    # 资源类型
    # entity: 实体
    # product: 商品
    # order: 业务单
    # stock: 库存
    # account: 账款
    # payment: 收付款
    # user: 用户
    resource_type = Column(String(50), nullable=False, index=True, comment="资源类型")
    
    # 资源ID
    resource_id = Column(Integer, index=True, comment="资源ID")
    
    # 资源名称/编号（便于查看）
    resource_name = Column(String(100), comment="资源名称")
    
    # 操作描述
    description = Column(String(500), comment="操作描述")
    
    # 修改前的值（JSON格式）
    old_value = Column(JSON, comment="修改前")
    
    # 修改后的值（JSON格式）
    new_value = Column(JSON, comment="修改后")
    
    # IP地址（可选）
    ip_address = Column(String(50), comment="IP地址")
    
    # 操作时间
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 关系
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<AuditLog {self.action} {self.resource_type}:{self.resource_id}>"
    
    @property
    def action_display(self) -> str:
        """操作类型显示名称"""
        action_map = {
            "create": "创建",
            "update": "更新",
            "delete": "删除",
            "login": "登录",
            "logout": "登出",
            "confirm": "确认",
            "cancel": "取消",
            "payment": "收付款",
            "adjust": "调整"
        }
        return action_map.get(self.action, self.action)
    
    @property
    def resource_type_display(self) -> str:
        """资源类型显示名称"""
        type_map = {
            "entity": "实体",
            "product": "商品",
            "order": "业务单",
            "stock": "库存",
            "account": "账款",
            "payment": "收付款",
            "user": "用户"
        }
        return type_map.get(self.resource_type, self.resource_type)

