from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field


# 共享属性
class UserBase(BaseModel):
    username: str


# 创建用户时的属性
class UserCreate(UserBase):
    password: str
    role: str = "user"  # admin(管理员), manager(二级管理员), user(普通用户)
    superior_id: Optional[int] = None  # 上级ID，只有普通用户需要设置
    status: bool = True


# 更新用户时的属性
class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    superior_id: Optional[int] = None
    status: Optional[bool] = None


# 数据库中存储的用户属性
class UserInDBBase(UserBase):
    id: int
    role: str
    superior_id: Optional[int] = None
    status: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# 返回给API的用户属性
class User(UserInDBBase):
    pass


# 包含下属用户的用户信息
class UserWithSubordinates(User):
    subordinates: List["User"] = []


# 数据库中存储的用户属性（包含密码）
class UserInDB(UserInDBBase):
    password: str 