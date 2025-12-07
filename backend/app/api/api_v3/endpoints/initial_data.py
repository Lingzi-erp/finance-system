"""期初数据录入API - 用于在系统启用前录入历史数据"""

from typing import Any, List, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.stock import Stock, StockFlow
from app.models.v3.stock_batch import StockBatch
from app.models.v3.account_balance import AccountBalance

router = APIRouter()


# ===== Schemas =====

class InitialStockCreate(BaseModel):
    """期初库存录入"""
    warehouse_id: int = Field(..., description="仓库ID")
    product_id: int = Field(..., description="商品ID")
    quantity: float = Field(..., ge=0, description="期初数量")
    notes: Optional[str] = Field(None, description="备注")


class InitialStockBatchCreate(BaseModel):
    """批量期初库存录入"""
    items: List[InitialStockCreate]


class InitialAccountCreate(BaseModel):
    """期初账款录入"""
    entity_id: int = Field(..., description="客户/供应商ID")
    balance_type: str = Field(..., description="账款类型: receivable(应收)/payable(应付)")
    amount: float = Field(..., gt=0, description="期初余额")
    notes: Optional[str] = Field(None, description="备注")


class InitialAccountBatchCreate(BaseModel):
    """批量期初账款录入"""
    items: List[InitialAccountCreate]


class InitialStockResponse(BaseModel):
    """期初库存响应"""
    id: int
    warehouse_id: int
    warehouse_name: str
    product_id: int
    product_name: str
    product_code: str
    product_specification: str = ""  # 商品规格
    quantity: float
    notes: Optional[str]
    created_at: datetime


class InitialAccountResponse(BaseModel):
    """期初账款响应"""
    id: int
    entity_id: int
    entity_name: str
    entity_code: str
    balance_type: str
    balance_type_display: str
    amount: float
    balance: float
    status: str
    notes: Optional[str]
    created_at: datetime


# ===== 期初库存 =====

@router.post("/stock", response_model=InitialStockResponse)
async def create_initial_stock(
    *,
    db: AsyncSession = Depends(get_db),
    stock_in: InitialStockCreate
) -> Any:
    """
    录入期初库存
    
    为指定仓库的商品设置初始库存数量。
    如果该仓库-商品组合已有库存记录，将更新现有记录。
    """
    # 验证仓库
    warehouse = await db.get(Entity, stock_in.warehouse_id)
    if not warehouse or "warehouse" not in warehouse.entity_type:
        raise HTTPException(status_code=404, detail="仓库不存在")
    
    # 验证商品
    product = await db.get(Product, stock_in.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    
    # 查找或创建库存记录
    result = await db.execute(
        select(Stock).where(
            and_(
                Stock.warehouse_id == stock_in.warehouse_id,
                Stock.product_id == stock_in.product_id
            )
        )
    )
    stock = result.scalar_one_or_none()
    
    now = datetime.utcnow()
    quantity = Decimal(str(stock_in.quantity))
    
    if stock:
        # 更新现有记录
        old_quantity = stock.quantity
        stock.quantity = quantity
        stock.updated_at = now
        
        # 记录调整流水
        if old_quantity != quantity:
            flow = StockFlow(
                stock_id=stock.id,
                flow_type="initial",
                quantity_change=quantity - old_quantity,
                quantity_before=old_quantity,
                quantity_after=quantity,
                reason=f"期初库存调整: {stock_in.notes or '无'}",
                operator_id=1,
                operated_at=now
            )
            db.add(flow)
    else:
        # 创建新记录
        stock = Stock(
            warehouse_id=stock_in.warehouse_id,
            product_id=stock_in.product_id,
            quantity=quantity,
            reserved_quantity=Decimal("0"),
            created_at=now,
            updated_at=now
        )
        db.add(stock)
        await db.flush()  # 获取ID
        
        # 记录入库流水
        if quantity > 0:
            flow = StockFlow(
                stock_id=stock.id,
                flow_type="initial",
                quantity_change=quantity,
                quantity_before=Decimal("0"),
                quantity_after=quantity,
                reason=f"期初库存录入: {stock_in.notes or '无'}",
                operator_id=1,
                operated_at=now
            )
            db.add(flow)
    
    await db.commit()
    
    return InitialStockResponse(
        id=stock.id,
        warehouse_id=stock.warehouse_id,
        warehouse_name=warehouse.name,
        product_id=stock.product_id,
        product_name=product.name,
        product_code=product.code,
        quantity=float(stock.quantity),
        notes=stock_in.notes,
        created_at=stock.created_at
    )


@router.post("/stock/batch")
async def create_initial_stock_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_in: InitialStockBatchCreate
) -> Any:
    """批量录入期初库存"""
    results = []
    errors = []
    
    for idx, item in enumerate(batch_in.items):
        try:
            # 验证仓库
            warehouse = await db.get(Entity, item.warehouse_id)
            if not warehouse or "warehouse" not in warehouse.entity_type:
                errors.append({"index": idx, "error": f"仓库ID {item.warehouse_id} 不存在"})
                continue
            
            # 验证商品
            product = await db.get(Product, item.product_id)
            if not product:
                errors.append({"index": idx, "error": f"商品ID {item.product_id} 不存在"})
                continue
            
            # 查找或创建库存记录
            result = await db.execute(
                select(Stock).where(
                    and_(
                        Stock.warehouse_id == item.warehouse_id,
                        Stock.product_id == item.product_id
                    )
                )
            )
            stock = result.scalar_one_or_none()
            
            now = datetime.utcnow()
            quantity = Decimal(str(item.quantity))
            
            if stock:
                old_quantity = stock.quantity
                stock.quantity = quantity
                stock.updated_at = now
                
                if old_quantity != quantity:
                    flow = StockFlow(
                        stock_id=stock.id,
                        flow_type="initial",
                        quantity_change=quantity - old_quantity,
                        quantity_before=old_quantity,
                        quantity_after=quantity,
                        reason=f"期初库存调整: {item.notes or '无'}",
                        operator_id=1,
                        operated_at=now
                    )
                    db.add(flow)
            else:
                stock = Stock(
                    warehouse_id=item.warehouse_id,
                    product_id=item.product_id,
                    quantity=quantity,
                    reserved_quantity=Decimal("0"),
                    created_at=now,
                    updated_at=now
                )
                db.add(stock)
                await db.flush()
                
                if quantity > 0:
                    flow = StockFlow(
                        stock_id=stock.id,
                        flow_type="initial",
                        quantity_change=quantity,
                        quantity_before=Decimal("0"),
                        quantity_after=quantity,
                        reason=f"期初库存录入: {item.notes or '无'}",
                        operator_id=1,
                        operated_at=now
                    )
                    db.add(flow)
            
            results.append({
                "warehouse_id": item.warehouse_id,
                "warehouse_name": warehouse.name,
                "product_id": item.product_id,
                "product_name": product.name,
                "quantity": float(quantity)
            })
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})
    
    await db.commit()
    
    return {
        "success_count": len(results),
        "error_count": len(errors),
        "results": results,
        "errors": errors
    }


@router.get("/stock")
async def list_initial_stocks(
    *,
    db: AsyncSession = Depends(get_db),
    warehouse_id: Optional[int] = Query(None, description="按仓库筛选")
) -> Any:
    """获取期初库存列表（只返回期初录入的记录）"""
    # 方法1: 查询 StockFlow 表中 flow_type='initial' 的记录
    query = (
        select(StockFlow)
        .options(
            selectinload(StockFlow.stock).selectinload(Stock.warehouse),
            selectinload(StockFlow.stock).selectinload(Stock.product)
        )
        .where(StockFlow.flow_type == "initial")
    )
    
    result = await db.execute(query)
    flows = result.scalars().all()
    
    # 按 stock_id 聚合（同一个库存可能有多次期初调整）
    stock_map = {}
    for flow in flows:
        stock = flow.stock
        if not stock:
            continue
        if warehouse_id and stock.warehouse_id != warehouse_id:
            continue
        
        # 保留最新的记录
        if stock.id not in stock_map or flow.operated_at > stock_map[stock.id]["created_at"]:
            stock_map[stock.id] = {
                "id": stock.id,
                "warehouse_id": stock.warehouse_id,
                "warehouse_name": stock.warehouse.name if stock.warehouse else "",
                "product_id": stock.product_id,
                "product_name": stock.product.name if stock.product else "",
                "product_code": stock.product.code if stock.product else "",
                "product_specification": (stock.product.specification or "") if stock.product else "",
                "quantity": float(flow.quantity_after),
                "created_at": flow.operated_at
            }
    
    return {
        "data": list(stock_map.values()),
        "total": len(stock_map)
    }


# ===== 期初账款 =====

@router.post("/account", response_model=InitialAccountResponse)
async def create_initial_account(
    *,
    db: AsyncSession = Depends(get_db),
    account_in: InitialAccountCreate
) -> Any:
    """
    录入期初账款
    
    为客户或供应商设置期初应收/应付余额。
    - 应收账款(receivable): 客户欠我们的钱
    - 应付账款(payable): 我们欠供应商的钱
    
    注意：每个实体只能有一条期初账款记录。
    """
    # 验证实体
    entity = await db.get(Entity, account_in.entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="客户/供应商不存在")
    
    # 验证账款类型
    if account_in.balance_type not in ["receivable", "payable"]:
        raise HTTPException(status_code=400, detail="账款类型必须是 receivable 或 payable")
    
    # 验证实体类型与账款类型匹配
    if account_in.balance_type == "receivable" and "customer" not in entity.entity_type:
        raise HTTPException(status_code=400, detail="应收账款只能关联客户")
    if account_in.balance_type == "payable" and "supplier" not in entity.entity_type:
        raise HTTPException(status_code=400, detail="应付账款只能关联供应商")
    
    # 检查是否已有期初账款
    existing = await db.execute(
        select(AccountBalance).where(
            and_(
                AccountBalance.entity_id == account_in.entity_id,
                AccountBalance.balance_type == account_in.balance_type,
                AccountBalance.is_initial == True
            )
        )
    )
    existing_account = existing.scalar_one_or_none()
    
    amount = Decimal(str(account_in.amount))
    now = datetime.utcnow()
    
    if existing_account:
        # 更新现有期初账款
        old_amount = existing_account.amount
        existing_account.amount = amount
        existing_account.balance = amount - existing_account.paid_amount
        existing_account.notes = account_in.notes
        existing_account.updated_at = now
        
        # 重新计算状态
        existing_account.recalculate()
        
        # 更新实体余额
        diff = amount - old_amount
        if account_in.balance_type == "receivable":
            entity.current_balance = (entity.current_balance or Decimal("0")) + diff
        else:
            entity.current_balance = (entity.current_balance or Decimal("0")) - diff
        
        account = existing_account
    else:
        # 创建新期初账款
        account = AccountBalance(
            entity_id=account_in.entity_id,
            order_id=None,  # 期初数据无关联订单
            is_initial=True,
            balance_type=account_in.balance_type,
            amount=amount,
            paid_amount=Decimal("0"),
            balance=amount,
            status="pending",
            notes=account_in.notes or "期初账款",
            created_by=1,
            created_at=now,
            updated_at=now
        )
        db.add(account)
        
        # 更新实体余额
        if account_in.balance_type == "receivable":
            entity.current_balance = (entity.current_balance or Decimal("0")) + amount
        else:
            entity.current_balance = (entity.current_balance or Decimal("0")) - amount
    
    await db.commit()
    await db.refresh(account)
    
    return InitialAccountResponse(
        id=account.id,
        entity_id=account.entity_id,
        entity_name=entity.name,
        entity_code=entity.code,
        balance_type=account.balance_type,
        balance_type_display="应收账款" if account.balance_type == "receivable" else "应付账款",
        amount=float(account.amount),
        balance=float(account.balance),
        status=account.status,
        notes=account.notes,
        created_at=account.created_at
    )


@router.post("/account/batch")
async def create_initial_account_batch(
    *,
    db: AsyncSession = Depends(get_db),
    batch_in: InitialAccountBatchCreate
) -> Any:
    """批量录入期初账款"""
    results = []
    errors = []
    
    for idx, item in enumerate(batch_in.items):
        try:
            # 验证实体
            entity = await db.get(Entity, item.entity_id)
            if not entity:
                errors.append({"index": idx, "error": f"实体ID {item.entity_id} 不存在"})
                continue
            
            # 验证账款类型
            if item.balance_type not in ["receivable", "payable"]:
                errors.append({"index": idx, "error": "账款类型必须是 receivable 或 payable"})
                continue
            
            # 验证实体类型与账款类型匹配
            if item.balance_type == "receivable" and "customer" not in entity.entity_type:
                errors.append({"index": idx, "error": "应收账款只能关联客户"})
                continue
            if item.balance_type == "payable" and "supplier" not in entity.entity_type:
                errors.append({"index": idx, "error": "应付账款只能关联供应商"})
                continue
            
            # 检查是否已有期初账款
            existing = await db.execute(
                select(AccountBalance).where(
                    and_(
                        AccountBalance.entity_id == item.entity_id,
                        AccountBalance.balance_type == item.balance_type,
                        AccountBalance.is_initial == True
                    )
                )
            )
            existing_account = existing.scalar_one_or_none()
            
            amount = Decimal(str(item.amount))
            now = datetime.utcnow()
            
            if existing_account:
                old_amount = existing_account.amount
                existing_account.amount = amount
                existing_account.balance = amount - existing_account.paid_amount
                existing_account.notes = item.notes
                existing_account.updated_at = now
                existing_account.recalculate()
                
                diff = amount - old_amount
                if item.balance_type == "receivable":
                    entity.current_balance = (entity.current_balance or Decimal("0")) + diff
                else:
                    entity.current_balance = (entity.current_balance or Decimal("0")) - diff
                
                account = existing_account
            else:
                account = AccountBalance(
                    entity_id=item.entity_id,
                    order_id=None,
                    is_initial=True,
                    balance_type=item.balance_type,
                    amount=amount,
                    paid_amount=Decimal("0"),
                    balance=amount,
                    status="pending",
                    notes=item.notes or "期初账款",
                    created_by=1,
                    created_at=now,
                    updated_at=now
                )
                db.add(account)
                
                if item.balance_type == "receivable":
                    entity.current_balance = (entity.current_balance or Decimal("0")) + amount
                else:
                    entity.current_balance = (entity.current_balance or Decimal("0")) - amount
            
            results.append({
                "entity_id": item.entity_id,
                "entity_name": entity.name,
                "balance_type": item.balance_type,
                "amount": float(amount)
            })
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})
    
    await db.commit()
    
    return {
        "success_count": len(results),
        "error_count": len(errors),
        "results": results,
        "errors": errors
    }


@router.get("/account")
async def list_initial_accounts(
    *,
    db: AsyncSession = Depends(get_db),
    balance_type: Optional[str] = Query(None, description="账款类型筛选")
) -> Any:
    """获取期初账款列表"""
    query = (
        select(AccountBalance)
        .options(selectinload(AccountBalance.entity))
        .where(AccountBalance.is_initial == True)
    )
    
    if balance_type:
        query = query.where(AccountBalance.balance_type == balance_type)
    
    result = await db.execute(query)
    accounts = result.scalars().all()
    
    return {
        "data": [
            {
                "id": a.id,
                "entity_id": a.entity_id,
                "entity_name": a.entity.name if a.entity else "",
                "entity_code": a.entity.code if a.entity else "",
                "balance_type": a.balance_type,
                "balance_type_display": "应收账款" if a.balance_type == "receivable" else "应付账款",
                "amount": float(a.amount),
                "paid_amount": float(a.paid_amount),
                "balance": float(a.balance),
                "status": a.status,
                "notes": a.notes,
                "created_at": a.created_at
            }
            for a in accounts
        ],
        "total": len(accounts)
    }


@router.delete("/account/{account_id}")
async def delete_initial_account(
    *,
    db: AsyncSession = Depends(get_db),
    account_id: int
) -> Any:
    """删除期初账款"""
    account = await db.get(AccountBalance, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账款记录不存在")
    
    if not account.is_initial:
        raise HTTPException(status_code=400, detail="只能删除期初账款记录")
    
    if account.paid_amount > Decimal("0"):
        raise HTTPException(status_code=400, detail="已有收付款记录，无法删除")
    
    # 更新实体余额
    entity = await db.get(Entity, account.entity_id)
    if entity:
        if account.balance_type == "receivable":
            entity.current_balance = (entity.current_balance or Decimal("0")) - account.amount
        else:
            entity.current_balance = (entity.current_balance or Decimal("0")) + account.amount
    
    await db.delete(account)
    await db.commit()
    
    return {"message": "删除成功"}


# ===== 汇总统计 =====

@router.get("/summary")
async def get_initial_data_summary(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取期初数据汇总"""
    # 期初库存统计 - 只统计 flow_type='initial' 的记录
    stock_result = await db.execute(
        select(func.count(func.distinct(StockFlow.stock_id)))
        .where(StockFlow.flow_type == "initial")
    )
    stock_count = stock_result.scalar() or 0
    
    # 期初应收统计
    receivable_result = await db.execute(
        select(
            func.count(AccountBalance.id),
            func.coalesce(func.sum(AccountBalance.amount), 0),
            func.coalesce(func.sum(AccountBalance.balance), 0)
        ).where(
            AccountBalance.is_initial == True,
            AccountBalance.balance_type == "receivable"
        )
    )
    receivable_row = receivable_result.first()
    
    # 期初应付统计
    payable_result = await db.execute(
        select(
            func.count(AccountBalance.id),
            func.coalesce(func.sum(AccountBalance.amount), 0),
            func.coalesce(func.sum(AccountBalance.balance), 0)
        ).where(
            AccountBalance.is_initial == True,
            AccountBalance.balance_type == "payable"
        )
    )
    payable_row = payable_result.first()
    
    return {
        "stock": {
            "count": stock_count,
            "total_quantity": 0  # 不再汇总数量，因为期初调整可能有增有减
        },
        "receivable": {
            "count": receivable_row[0] if receivable_row else 0,
            "total_amount": float(receivable_row[1]) if receivable_row else 0,
            "total_balance": float(receivable_row[2]) if receivable_row else 0
        },
        "payable": {
            "count": payable_row[0] if payable_row else 0,
            "total_amount": float(payable_row[1]) if payable_row else 0,
            "total_balance": float(payable_row[2]) if payable_row else 0
        }
    }

