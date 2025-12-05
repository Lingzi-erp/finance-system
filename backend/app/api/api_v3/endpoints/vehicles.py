"""
车辆管理API
"""
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_db
from app.models.v3 import Vehicle, Entity
from app.schemas.v3.vehicle import (
    VehicleCreate,
    VehicleUpdate,
    VehicleResponse,
    VehicleSimpleResponse,
    VehicleListResponse)

router = APIRouter()

def build_vehicle_response(vehicle: Vehicle) -> VehicleResponse:
    """构建车辆响应"""
    return VehicleResponse(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        logistics_company_id=vehicle.logistics_company_id,
        company_name=vehicle.logistics_company.name if vehicle.logistics_company else "",
        vehicle_type=vehicle.vehicle_type,
        notes=vehicle.notes,
        is_active=vehicle.is_active,
        created_by=vehicle.created_by,
        created_at=vehicle.created_at,
        updated_at=vehicle.updated_at)

@router.get("/", response_model=VehicleListResponse)
async def list_vehicles(
    *,
    db: AsyncSession = Depends(get_db),
    logistics_company_id: Optional[int] = Query(None, description="按物流公司筛选"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200)) -> Any:
    """获取车辆列表"""
    query = select(Vehicle)
    count_query = select(func.count(Vehicle.id))
    
    if logistics_company_id:
        query = query.where(Vehicle.logistics_company_id == logistics_company_id)
        count_query = count_query.where(Vehicle.logistics_company_id == logistics_company_id)
    
    if is_active is not None:
        query = query.where(Vehicle.is_active == is_active)
        count_query = count_query.where(Vehicle.is_active == is_active)
    
    query = query.order_by(Vehicle.plate_number).offset(skip).limit(limit)
    
    result = await db.execute(query)
    vehicles = result.scalars().all()
    
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    return VehicleListResponse(
        data=[build_vehicle_response(v) for v in vehicles],
        total=total
    )

@router.get("/simple")
async def list_vehicles_simple(
    *,
    db: AsyncSession = Depends(get_db),
    logistics_company_id: Optional[int] = Query(None, description="按物流公司筛选")) -> list[VehicleSimpleResponse]:
    """获取车辆简单列表（用于下拉选择）"""
    query = select(Vehicle).where(Vehicle.is_active == True)
    
    if logistics_company_id:
        query = query.where(Vehicle.logistics_company_id == logistics_company_id)
    
    query = query.order_by(Vehicle.plate_number)
    
    result = await db.execute(query)
    vehicles = result.scalars().all()
    
    return [
        VehicleSimpleResponse(
            id=v.id,
            plate_number=v.plate_number,
            logistics_company_id=v.logistics_company_id,
            company_name=v.logistics_company.name if v.logistics_company else "",
            vehicle_type=v.vehicle_type)
        for v in vehicles
    ]

@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(
    *,
    db: AsyncSession = Depends(get_db),
    vehicle_id: int) -> Any:
    """获取单个车辆详情"""
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="车辆不存在")
    return build_vehicle_response(vehicle)

@router.post("/", response_model=VehicleResponse)
async def create_vehicle(
    *,
    db: AsyncSession = Depends(get_db),
    vehicle_in: VehicleCreate) -> Any:
    """创建车辆"""
    # 检查物流公司是否存在
    company = await db.get(Entity, vehicle_in.logistics_company_id)
    if not company:
        raise HTTPException(status_code=400, detail="物流公司不存在")
    if "logistics" not in company.entity_type:
        raise HTTPException(status_code=400, detail="所选实体不是物流公司")
    
    # 检查车牌号是否已存在
    existing = await db.execute(
        select(Vehicle).where(Vehicle.plate_number == vehicle_in.plate_number)
    )
    if existing.scalar():
        raise HTTPException(status_code=400, detail="该车牌号已存在")
    
    vehicle = Vehicle(
        **vehicle_in.model_dump(),
        created_by=1
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    
    return build_vehicle_response(vehicle)

@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    *,
    db: AsyncSession = Depends(get_db),
    vehicle_id: int,
    vehicle_in: VehicleUpdate) -> Any:
    """更新车辆"""
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="车辆不存在")
    
    # 如果更新车牌号，检查是否重复
    if vehicle_in.plate_number and vehicle_in.plate_number != vehicle.plate_number:
        existing = await db.execute(
            select(Vehicle).where(Vehicle.plate_number == vehicle_in.plate_number)
        )
        if existing.scalar():
            raise HTTPException(status_code=400, detail="该车牌号已存在")
    
    # 如果更新物流公司，检查是否存在
    if vehicle_in.logistics_company_id:
        company = await db.get(Entity, vehicle_in.logistics_company_id)
        if not company:
            raise HTTPException(status_code=400, detail="物流公司不存在")
        if "logistics" not in company.entity_type:
            raise HTTPException(status_code=400, detail="所选实体不是物流公司")
    
    update_data = vehicle_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)
    
    await db.commit()
    await db.refresh(vehicle)
    
    return build_vehicle_response(vehicle)

@router.delete("/{vehicle_id}")
async def delete_vehicle(
    *,
    db: AsyncSession = Depends(get_db),
    vehicle_id: int) -> Any:
    """删除车辆（软删除，设置为不启用）"""
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="车辆不存在")
    
    vehicle.is_active = False
    await db.commit()
    
    return {"message": "车辆已禁用"}

