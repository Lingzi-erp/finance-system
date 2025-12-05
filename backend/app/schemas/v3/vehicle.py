"""
车辆相关的Pydantic模式
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class VehicleBase(BaseModel):
    """车辆基础字段"""
    plate_number: str = Field(..., min_length=1, max_length=20, description="车牌号")
    logistics_company_id: int = Field(..., description="物流公司ID")
    vehicle_type: Optional[str] = Field(None, max_length=50, description="车辆类型")
    notes: Optional[str] = Field(None, max_length=200, description="备注")


class VehicleCreate(VehicleBase):
    """创建车辆"""
    pass


class VehicleUpdate(BaseModel):
    """更新车辆"""
    plate_number: Optional[str] = Field(None, min_length=1, max_length=20)
    logistics_company_id: Optional[int] = None
    vehicle_type: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class VehicleResponse(VehicleBase):
    """车辆响应"""
    id: int
    is_active: bool
    company_name: str = Field(default="", description="物流公司名称")
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VehicleSimpleResponse(BaseModel):
    """车辆简单响应（用于下拉选择）"""
    id: int
    plate_number: str
    logistics_company_id: int
    company_name: str = ""
    vehicle_type: Optional[str] = None

    class Config:
        from_attributes = True


class VehicleListResponse(BaseModel):
    """车辆列表响应"""
    data: List[VehicleResponse]
    total: int

