"""统计报表API"""

from typing import Any, Optional, List, Dict
from datetime import datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.business_order import BusinessOrder
from app.models.v3.order_item import OrderItem
from app.models.v3.entity import Entity
from app.models.v3.product import Product
from app.models.v3.stock import Stock
from app.models.v3.stock_batch import StockBatch, OrderItemBatch
from app.models.v3.account_balance import AccountBalance
from app.models.v3.payment_record import PaymentRecord
from app.schemas.v3.statistics import (
    SalesStatItem, SalesStatResponse,
    PurchaseStatItem, PurchaseStatResponse,
    StockAnalysisItem, StockAnalysisResponse,
    StockWarningItem, StockWarningResponse,
    DashboardData, EntityRankItem, EntityRankResponse,
    ProductRankItem, ProductRankResponse
)

router = APIRouter()

@router.get("/dashboard", response_model=DashboardData)
async def get_dashboard(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取仪表盘数据"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    
    # 今日销售（使用业务日期 order_date 筛选）
    today_sales_result = await db.execute(
        select(
            func.coalesce(func.sum(BusinessOrder.final_amount), 0),
            func.count(BusinessOrder.id)
        ).where(
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= today_start
        )
    )
    today_sales_row = today_sales_result.first()
    today_sales = float(today_sales_row[0]) if today_sales_row else 0
    today_sales_count = int(today_sales_row[1]) if today_sales_row else 0
    
    # 今日采购（使用业务日期 order_date 筛选）
    today_purchase_result = await db.execute(
        select(
            func.coalesce(func.sum(BusinessOrder.final_amount), 0),
            func.count(BusinessOrder.id)
        ).where(
            BusinessOrder.order_type == "purchase",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= today_start
        )
    )
    today_purchase_row = today_purchase_result.first()
    today_purchase = float(today_purchase_row[0]) if today_purchase_row else 0
    today_purchase_count = int(today_purchase_row[1]) if today_purchase_row else 0
    
    # 今日收款
    today_received_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "receive",
            PaymentRecord.payment_date >= today_start
        )
    )
    today_received = float(today_received_result.scalar() or 0)
    
    # 今日付款
    today_paid_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "pay",
            PaymentRecord.payment_date >= today_start
        )
    )
    today_paid = float(today_paid_result.scalar() or 0)
    
    # 本月销售（使用业务日期 order_date 筛选）
    month_sales_result = await db.execute(
        select(
            func.coalesce(func.sum(BusinessOrder.final_amount), 0),
            func.count(BusinessOrder.id)
        ).where(
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= month_start
        )
    )
    month_sales_row = month_sales_result.first()
    month_sales = float(month_sales_row[0]) if month_sales_row else 0
    month_sales_count = int(month_sales_row[1]) if month_sales_row else 0
    
    # 本月采购（使用业务日期 order_date 筛选）
    month_purchase_result = await db.execute(
        select(
            func.coalesce(func.sum(BusinessOrder.final_amount), 0),
            func.count(BusinessOrder.id)
        ).where(
            BusinessOrder.order_type == "purchase",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= month_start
        )
    )
    month_purchase_row = month_purchase_result.first()
    month_purchase = float(month_purchase_row[0]) if month_purchase_row else 0
    month_purchase_count = int(month_purchase_row[1]) if month_purchase_row else 0
    
    # 本月利润（完全从单据和批次追溯计算）
    # 利润 = 销售金额 - 批次成本 - 销售运费 - 销售冷藏费
    # 注意：运费和冷藏费"两头都是支出"：
    #   - 采购端支付的运费和冷藏费 → 已计入批次成本（real_cost_price）
    #   - 销售端支付的运费和冷藏费 → 额外支出
    
    # 1. 获取本月销售金额（商品金额，不含运费冷藏费）
    month_sale_amount_result = await db.execute(
        select(func.coalesce(func.sum(BusinessOrder.total_amount), 0)).where(
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= month_start
        )
    )
    month_sale_amount = float(month_sale_amount_result.scalar() or 0)
    
    # 2. 获取本月销售对应的批次成本（已包含采购运费和冷藏费）
    month_cost_result = await db.execute(
        select(func.coalesce(func.sum(OrderItemBatch.cost_amount), 0))
        .join(OrderItem, OrderItemBatch.order_item_id == OrderItem.id)
        .join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
        .where(
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= month_start
        )
    )
    month_cost = float(month_cost_result.scalar() or 0)
    
    # 3. 获取本月销售端支付的运费和冷藏费
    month_fees_result = await db.execute(
        select(
            func.coalesce(func.sum(BusinessOrder.total_shipping), 0),
            func.coalesce(func.sum(BusinessOrder.total_storage_fee), 0)
        ).where(
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            BusinessOrder.order_date >= month_start
        )
    )
    month_fees_row = month_fees_result.first()
    month_shipping = float(month_fees_row[0]) if month_fees_row else 0
    month_storage_fee = float(month_fees_row[1]) if month_fees_row else 0
    
    # 4. 计算利润 = 销售金额 - 批次成本 - 销售运费 - 销售冷藏费
    month_profit = month_sale_amount - month_cost - month_shipping - month_storage_fee
    
    # 待处理订单
    pending_orders_result = await db.execute(
        select(func.count(BusinessOrder.id)).where(
            BusinessOrder.status.in_(["confirmed", "shipping"])
        )
    )
    pending_orders = int(pending_orders_result.scalar() or 0)
    
    # 草稿订单
    draft_orders_result = await db.execute(
        select(func.count(BusinessOrder.id)).where(
            BusinessOrder.status == "draft"
        )
    )
    draft_orders = int(draft_orders_result.scalar() or 0)
    
    # 应收账款
    receivable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.balance_type == "receivable",
            AccountBalance.status.in_(["pending", "partial"])
        )
    )
    total_receivable = float(receivable_result.scalar() or 0)
    
    # 应付账款
    payable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.balance_type == "payable",
            AccountBalance.status.in_(["pending", "partial"])
        )
    )
    total_payable = float(payable_result.scalar() or 0)
    
    # 逾期应收
    overdue_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.balance_type == "receivable",
            AccountBalance.status.in_(["pending", "partial"]),
            AccountBalance.due_date < now
        )
    )
    overdue_receivable = float(overdue_result.scalar() or 0)
    
    # 库存预警
    low_stock_result = await db.execute(
        select(func.count(Stock.id)).where(
            Stock.quantity < Stock.safety_stock,
            Stock.quantity > 0
        )
    )
    low_stock_count = int(low_stock_result.scalar() or 0)
    
    out_of_stock_result = await db.execute(
        select(func.count(Stock.id)).where(Stock.quantity <= 0)
    )
    out_of_stock_count = int(out_of_stock_result.scalar() or 0)
    
    # 最近业务单（最近10条）
    recent_orders_result = await db.execute(
        select(BusinessOrder).options(
            selectinload(BusinessOrder.source_entity),
            selectinload(BusinessOrder.target_entity)
        ).order_by(BusinessOrder.created_at.desc()).limit(10)
    )
    recent_orders = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "order_type": o.order_type,
            "type_display": o.type_display,
            "status": o.status,
            "status_display": o.status_display,
            "final_amount": float(o.final_amount or 0),
            "created_at": o.created_at.isoformat() if o.created_at else None
        }
        for o in recent_orders_result.scalars().all()
    ]
    
    # 销售趋势（最近7天，使用业务日期 order_date）
    sales_trend = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        day_result = await db.execute(
            select(func.coalesce(func.sum(BusinessOrder.final_amount), 0)).where(
                BusinessOrder.order_type == "sale",
                BusinessOrder.status == "completed",
                BusinessOrder.order_date >= day_start,
                BusinessOrder.order_date < day_end
            )
        )
        sales_trend.append({
            "date": day_start.strftime("%m-%d"),
            "amount": float(day_result.scalar() or 0)
        })
    
    return DashboardData(
        today_sales=today_sales,
        today_sales_count=today_sales_count,
        today_purchase=today_purchase,
        today_purchase_count=today_purchase_count,
        today_received=today_received,
        today_paid=today_paid,
        month_sales=month_sales,
        month_sales_count=month_sales_count,
        month_purchase=month_purchase,
        month_purchase_count=month_purchase_count,
        month_profit=month_profit,
        pending_orders=pending_orders,
        draft_orders=draft_orders,
        total_receivable=total_receivable,
        total_payable=total_payable,
        overdue_receivable=overdue_receivable,
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count,
        recent_orders=recent_orders,
        sales_trend=sales_trend
    )

@router.get("/sales", response_model=SalesStatResponse)
async def get_sales_statistics(
    *,
    db: AsyncSession = Depends(get_db),
    group_by: str = Query("date", pattern="^(date|entity|product)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200)) -> Any:
    """获取销售统计"""
    conditions = [
        BusinessOrder.order_type == "sale",
        BusinessOrder.status == "completed"
    ]
    
    # 使用业务日期（order_date）筛选，而非完成时间
    if start_date:
        conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(BusinessOrder.order_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    items = []
    
    if group_by == "entity":
        # 按客户统计
        result = await db.execute(
            select(
                BusinessOrder.target_id,
                Entity.name,
                func.count(BusinessOrder.id).label("order_count"),
                func.coalesce(func.sum(BusinessOrder.total_quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(BusinessOrder.final_amount), 0).label("total_amount")
            ).join(
                Entity, BusinessOrder.target_id == Entity.id
            ).where(
                and_(*conditions)
            ).group_by(
                BusinessOrder.target_id, Entity.name
            ).order_by(
                func.sum(BusinessOrder.final_amount).desc()
            ).limit(limit)
        )
        
        for row in result:
            items.append(SalesStatItem(
                entity_id=row[0],
                entity_name=row[1],
                order_count=row[2],
                total_quantity=row[3],
                total_amount=float(row[4])
            ))
    
    elif group_by == "product":
        # 按商品统计
        result = await db.execute(
            select(
                OrderItem.product_id,
                Product.name,
                func.count(func.distinct(OrderItem.order_id)).label("order_count"),
                func.coalesce(func.sum(OrderItem.quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(OrderItem.amount), 0).label("total_amount"),
                func.coalesce(func.sum(OrderItem.cost_amount), 0).label("total_cost"),
                func.coalesce(func.sum(OrderItem.profit), 0).label("total_profit")
            ).join(
                BusinessOrder, OrderItem.order_id == BusinessOrder.id
            ).join(
                Product, OrderItem.product_id == Product.id
            ).where(
                and_(*conditions)
            ).group_by(
                OrderItem.product_id, Product.name
            ).order_by(
                func.sum(OrderItem.amount).desc()
            ).limit(limit)
        )
        
        for row in result:
            total_amount = float(row[4])
            total_profit = float(row[6])
            profit_rate = (total_profit / total_amount * 100) if total_amount > 0 else 0
            
            items.append(SalesStatItem(
                product_id=row[0],
                product_name=row[1],
                order_count=row[2],
                total_quantity=row[3],
                total_amount=total_amount,
                total_cost=float(row[5]),
                total_profit=total_profit,
                profit_rate=round(profit_rate, 2)
            ))
    
    else:
        # 按日期统计（使用业务日期 order_date）
        result = await db.execute(
            select(
                func.date(BusinessOrder.order_date).label("date"),
                func.count(BusinessOrder.id).label("order_count"),
                func.coalesce(func.sum(BusinessOrder.total_quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(BusinessOrder.final_amount), 0).label("total_amount")
            ).where(
                and_(*conditions)
            ).group_by(
                func.date(BusinessOrder.order_date)
            ).order_by(
                func.date(BusinessOrder.order_date).desc()
            ).limit(limit)
        )
        
        for row in result:
            items.append(SalesStatItem(
                date=str(row[0]) if row[0] else "",
                order_count=row[1],
                total_quantity=row[2],
                total_amount=float(row[3])
            ))
    
    # 计算汇总
    summary_result = await db.execute(
        select(
            func.count(BusinessOrder.id),
            func.coalesce(func.sum(BusinessOrder.total_quantity), 0),
            func.coalesce(func.sum(BusinessOrder.final_amount), 0)
        ).where(and_(*conditions))
    )
    summary_row = summary_result.first()
    summary = {
        "total_orders": summary_row[0] if summary_row else 0,
        "total_quantity": int(summary_row[1]) if summary_row else 0,
        "total_amount": float(summary_row[2]) if summary_row else 0
    }
    
    return SalesStatResponse(
        items=items,
        summary=summary,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/purchase", response_model=PurchaseStatResponse)
async def get_purchase_statistics(
    *,
    db: AsyncSession = Depends(get_db),
    group_by: str = Query("date", pattern="^(date|entity|product)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200)) -> Any:
    """获取采购统计"""
    conditions = [
        BusinessOrder.order_type == "purchase",
        BusinessOrder.status == "completed"
    ]
    
    # 使用业务日期（order_date）筛选，而非完成时间
    if start_date:
        conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(BusinessOrder.order_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    items = []
    
    if group_by == "entity":
        # 按供应商统计
        result = await db.execute(
            select(
                BusinessOrder.source_id,
                Entity.name,
                func.count(BusinessOrder.id).label("order_count"),
                func.coalesce(func.sum(BusinessOrder.total_quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(BusinessOrder.final_amount), 0).label("total_amount")
            ).join(
                Entity, BusinessOrder.source_id == Entity.id
            ).where(
                and_(*conditions)
            ).group_by(
                BusinessOrder.source_id, Entity.name
            ).order_by(
                func.sum(BusinessOrder.final_amount).desc()
            ).limit(limit)
        )
        
        for row in result:
            items.append(PurchaseStatItem(
                entity_id=row[0],
                entity_name=row[1],
                order_count=row[2],
                total_quantity=row[3],
                total_amount=float(row[4])
            ))
    
    elif group_by == "product":
        # 按商品统计
        result = await db.execute(
            select(
                OrderItem.product_id,
                Product.name,
                func.count(func.distinct(OrderItem.order_id)).label("order_count"),
                func.coalesce(func.sum(OrderItem.quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(OrderItem.amount), 0).label("total_amount")
            ).join(
                BusinessOrder, OrderItem.order_id == BusinessOrder.id
            ).join(
                Product, OrderItem.product_id == Product.id
            ).where(
                and_(*conditions)
            ).group_by(
                OrderItem.product_id, Product.name
            ).order_by(
                func.sum(OrderItem.amount).desc()
            ).limit(limit)
        )
        
        for row in result:
            items.append(PurchaseStatItem(
                product_id=row[0],
                product_name=row[1],
                order_count=row[2],
                total_quantity=row[3],
                total_amount=float(row[4])
            ))
    
    else:
        # 按日期统计（使用业务日期 order_date）
        result = await db.execute(
            select(
                func.date(BusinessOrder.order_date).label("date"),
                func.count(BusinessOrder.id).label("order_count"),
                func.coalesce(func.sum(BusinessOrder.total_quantity), 0).label("total_quantity"),
                func.coalesce(func.sum(BusinessOrder.final_amount), 0).label("total_amount")
            ).where(
                and_(*conditions)
            ).group_by(
                func.date(BusinessOrder.order_date)
            ).order_by(
                func.date(BusinessOrder.order_date).desc()
            ).limit(limit)
        )
        
        for row in result:
            items.append(PurchaseStatItem(
                date=str(row[0]) if row[0] else "",
                order_count=row[1],
                total_quantity=row[2],
                total_amount=float(row[3])
            ))
    
    # 计算汇总
    summary_result = await db.execute(
        select(
            func.count(BusinessOrder.id),
            func.coalesce(func.sum(BusinessOrder.total_quantity), 0),
            func.coalesce(func.sum(BusinessOrder.final_amount), 0)
        ).where(and_(*conditions))
    )
    summary_row = summary_result.first()
    summary = {
        "total_orders": summary_row[0] if summary_row else 0,
        "total_quantity": int(summary_row[1]) if summary_row else 0,
        "total_amount": float(summary_row[2]) if summary_row else 0
    }
    
    return PurchaseStatResponse(
        items=items,
        summary=summary,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/stock-analysis", response_model=StockAnalysisResponse)
async def get_stock_analysis(
    *,
    db: AsyncSession = Depends(get_db),
    warehouse_id: Optional[int] = Query(None)) -> Any:
    """获取库存分析"""
    query = select(Stock).options(
        selectinload(Stock.warehouse),
        selectinload(Stock.product)
    )
    
    if warehouse_id:
        query = query.where(Stock.warehouse_id == warehouse_id)
    
    result = await db.execute(query)
    stocks = result.scalars().all()
    
    items = []
    total_stock_value = 0
    low_stock_count = 0
    out_of_stock_count = 0
    
    for stock in stocks:
        cost_price = float(stock.product.cost_price or 0) if stock.product else 0
        stock_value = stock.quantity * cost_price
        is_low = stock.quantity < stock.safety_stock and stock.quantity > 0
        is_out = stock.quantity <= 0
        
        if is_low:
            low_stock_count += 1
        if is_out:
            out_of_stock_count += 1
        
        total_stock_value += stock_value
        
        items.append(StockAnalysisItem(
            warehouse_id=stock.warehouse_id,
            warehouse_name=stock.warehouse.name if stock.warehouse else "",
            product_id=stock.product_id,
            product_name=stock.product.name if stock.product else "",
            product_code=stock.product.code if stock.product else "",
            quantity=stock.quantity,
            reserved_quantity=stock.reserved_quantity,
            available_quantity=stock.available_quantity,
            safety_stock=stock.safety_stock,
            cost_price=cost_price,
            stock_value=stock_value,
            is_low_stock=is_low
        ))
    
    return StockAnalysisResponse(
        items=items,
        total_stock_value=total_stock_value,
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count
    )

@router.get("/stock-warning", response_model=StockWarningResponse)
async def get_stock_warning(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取库存预警"""
    # 查询低库存和缺货的商品
    result = await db.execute(
        select(Stock).options(
            selectinload(Stock.warehouse),
            selectinload(Stock.product)
        ).where(
            Stock.quantity < Stock.safety_stock
        ).order_by(
            (Stock.safety_stock - Stock.quantity).desc()
        )
    )
    stocks = result.scalars().all()
    
    items = []
    low_stock_count = 0
    out_of_stock_count = 0
    
    for stock in stocks:
        if stock.quantity <= 0:
            warning_level = "out"
            out_of_stock_count += 1
        else:
            warning_level = "low"
            low_stock_count += 1
        
        items.append(StockWarningItem(
            warehouse_id=stock.warehouse_id,
            warehouse_name=stock.warehouse.name if stock.warehouse else "",
            product_id=stock.product_id,
            product_name=stock.product.name if stock.product else "",
            product_code=stock.product.code if stock.product else "",
            quantity=stock.quantity,
            safety_stock=stock.safety_stock,
            shortage=stock.safety_stock - stock.quantity,
            warning_level=warning_level
        ))
    
    return StockWarningResponse(
        items=items,
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count
    )

@router.get("/entity-rank", response_model=EntityRankResponse)
async def get_entity_rank(
    *,
    db: AsyncSession = Depends(get_db),
    rank_type: str = Query("sales", pattern="^(sales|purchase)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50)) -> Any:
    """获取实体排行"""
    if rank_type == "sales":
        order_type = "sale"
        entity_field = BusinessOrder.target_id
    else:
        order_type = "purchase"
        entity_field = BusinessOrder.source_id
    
    conditions = [
        BusinessOrder.order_type == order_type,
        BusinessOrder.status == "completed"
    ]
    
    # 使用业务日期（order_date）筛选，而非完成时间
    if start_date:
        conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(BusinessOrder.order_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    result = await db.execute(
        select(
            entity_field,
            Entity.name,
            Entity.code,
            func.count(BusinessOrder.id).label("order_count"),
            func.coalesce(func.sum(BusinessOrder.final_amount), 0).label("total_amount")
        ).join(
            Entity, entity_field == Entity.id
        ).where(
            and_(*conditions)
        ).group_by(
            entity_field, Entity.name, Entity.code
        ).order_by(
            func.sum(BusinessOrder.final_amount).desc()
        ).limit(limit)
    )
    
    items = [
        EntityRankItem(
            entity_id=row[0],
            entity_name=row[1],
            entity_code=row[2],
            order_count=row[3],
            total_amount=float(row[4])
        )
        for row in result
    ]
    
    return EntityRankResponse(items=items, rank_type=rank_type)

@router.get("/entity-trading/{entity_id}")
async def get_entity_trading(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
) -> Any:
    """
    获取客商交易明细
    - 销售给客户：查看供货量、金额、利润
    - 从供应商采购：查看采购量、金额
    """
    # 获取实体信息
    entity = await db.get(Entity, entity_id)
    if not entity:
        return {"error": "Entity not found"}
    
    # 构建日期条件（使用业务日期 order_date）
    date_conditions = []
    if start_date:
        date_conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        date_conditions.append(BusinessOrder.order_date < end_dt)
    
    # 销售统计（作为客户：target_id = entity_id）
    sales_conditions = [
        BusinessOrder.order_type == "sale",
        BusinessOrder.status == "completed",
        BusinessOrder.target_id == entity_id,
        *date_conditions
    ]
    
    sales_result = await db.execute(
        select(
            func.count(BusinessOrder.id),
            func.coalesce(func.sum(BusinessOrder.total_quantity), 0),
            func.coalesce(func.sum(BusinessOrder.total_amount), 0),  # 商品金额（不含费用）
            func.coalesce(func.sum(BusinessOrder.final_amount), 0),  # 最终金额（含费用）
            func.coalesce(func.sum(BusinessOrder.total_shipping), 0),  # 运费
            func.coalesce(func.sum(BusinessOrder.total_storage_fee), 0)  # 冷藏费
        ).where(and_(*sales_conditions))
    )
    sales_row = sales_result.first()
    sales_order_count = sales_row[0] if sales_row else 0
    sales_quantity = float(sales_row[1]) if sales_row else 0
    sales_product_amount = float(sales_row[2]) if sales_row else 0  # 商品金额
    sales_amount = float(sales_row[3]) if sales_row else 0  # 最终金额
    sales_shipping = float(sales_row[4]) if sales_row else 0
    sales_storage_fee = float(sales_row[5]) if sales_row else 0
    
    # 销售利润（从批次追溯计算）
    # 利润 = 商品销售金额 - 批次成本 - 销售运费 - 销售冷藏费
    sales_cost_result = await db.execute(
        select(func.coalesce(func.sum(OrderItemBatch.cost_amount), 0))
        .join(OrderItem, OrderItemBatch.order_item_id == OrderItem.id)
        .join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
        .where(and_(*sales_conditions))
    )
    sales_cost = float(sales_cost_result.scalar() or 0)
    sales_profit = sales_product_amount - sales_cost - sales_shipping - sales_storage_fee
    
    # 采购统计（作为供应商：source_id = entity_id）
    purchase_conditions = [
        BusinessOrder.order_type == "purchase",
        BusinessOrder.status == "completed",
        BusinessOrder.source_id == entity_id,
        *date_conditions
    ]
    
    purchase_result = await db.execute(
        select(
            func.count(BusinessOrder.id),
            func.coalesce(func.sum(BusinessOrder.total_quantity), 0),
            func.coalesce(func.sum(BusinessOrder.final_amount), 0)
        ).where(and_(*purchase_conditions))
    )
    purchase_row = purchase_result.first()
    purchase_order_count = purchase_row[0] if purchase_row else 0
    purchase_quantity = float(purchase_row[1]) if purchase_row else 0
    purchase_amount = float(purchase_row[2]) if purchase_row else 0
    
    # 销售商品明细（按商品+包装规格分组）
    # 先获取商品信息和销售金额
    sales_products_result = await db.execute(
        select(
            Product.id,
            Product.name,
            Product.code,
            Product.unit,
            Product.specification,  # 商品规格（如：中号、大号）
            OrderItem.spec_name,    # 包装规格（如：大件、小件）
            OrderItem.container_name,
            OrderItem.unit_quantity,
            OrderItem.base_unit_symbol,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(OrderItem.amount), 0).label("amount")
        ).join(
            OrderItem, Product.id == OrderItem.product_id
        ).join(
            BusinessOrder, OrderItem.order_id == BusinessOrder.id
        ).where(
            and_(*sales_conditions)
        ).group_by(
            Product.id, Product.name, Product.code, Product.unit, Product.specification,
            OrderItem.spec_name, OrderItem.container_name, 
            OrderItem.unit_quantity, OrderItem.base_unit_symbol
        ).order_by(
            func.sum(OrderItem.amount).desc()
        )
    )
    
    sales_products = []
    for row in sales_products_result:
        product_id = row[0]
        amount = float(row[10])
        
        # 获取该商品的批次成本（从 OrderItemBatch 追溯）
        product_cost_result = await db.execute(
            select(func.coalesce(func.sum(OrderItemBatch.cost_amount), 0))
            .join(OrderItem, OrderItemBatch.order_item_id == OrderItem.id)
            .join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
            .where(and_(
                OrderItem.product_id == product_id,
                *sales_conditions
            ))
        )
        cost = float(product_cost_result.scalar() or 0)
        
        # 商品利润 = 销售金额 - 批次成本（运费/冷藏费在整体利润中扣除）
        profit = amount - cost
        
        sales_products.append({
            "product_id": product_id,
            "product_name": row[1],
            "product_code": row[2],
            "unit": row[3],
            "specification": row[4],  # 商品规格
            "spec_name": row[5],      # 包装规格
            "container_name": row[6],
            "unit_quantity": float(row[7]) if row[7] else None,
            "base_unit_symbol": row[8],
            "quantity": float(row[9]),
            "amount": amount,
            "profit": profit
        })
    
    # 采购商品明细（按商品+包装规格分组）
    purchase_products_result = await db.execute(
        select(
            Product.id,
            Product.name,
            Product.code,
            Product.unit,
            Product.specification,  # 商品规格
            OrderItem.spec_name,    # 包装规格
            OrderItem.container_name,
            OrderItem.unit_quantity,
            OrderItem.base_unit_symbol,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(OrderItem.amount), 0).label("amount")
        ).join(
            OrderItem, Product.id == OrderItem.product_id
        ).join(
            BusinessOrder, OrderItem.order_id == BusinessOrder.id
        ).where(
            and_(*purchase_conditions)
        ).group_by(
            Product.id, Product.name, Product.code, Product.unit, Product.specification,
            OrderItem.spec_name, OrderItem.container_name,
            OrderItem.unit_quantity, OrderItem.base_unit_symbol
        ).order_by(
            func.sum(OrderItem.amount).desc()
        )
    )
    
    purchase_products = [
        {
            "product_id": row[0],
            "product_name": row[1],
            "product_code": row[2],
            "unit": row[3],
            "specification": row[4],  # 商品规格
            "spec_name": row[5],      # 包装规格
            "container_name": row[6],
            "unit_quantity": float(row[7]) if row[7] else None,
            "base_unit_symbol": row[8],
            "quantity": float(row[9]),
            "amount": float(row[10])
        }
        for row in purchase_products_result
    ]
    
    # 最近订单
    recent_orders_result = await db.execute(
        select(BusinessOrder).where(
            and_(
                BusinessOrder.status == "completed",
                (BusinessOrder.target_id == entity_id) | (BusinessOrder.source_id == entity_id),
                *date_conditions
            )
        ).order_by(BusinessOrder.order_date.desc()).limit(20)
    )
    
    recent_orders = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "order_type": o.order_type,
            "type_display": o.type_display,
            "quantity": float(o.total_quantity or 0),
            "amount": float(o.final_amount or 0),
            "date": o.order_date.strftime("%Y-%m-%d") if o.order_date else ""
        }
        for o in recent_orders_result.scalars().all()
    ]
    
    return {
        "entity": {
            "id": entity.id,
            "name": entity.name,
            "code": entity.code,
            "entity_type": entity.entity_type,
            "contact_name": entity.contact_name,
            "phone": entity.phone
        },
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        },
        "sales": {
            "order_count": sales_order_count,
            "quantity": sales_quantity,
            "amount": sales_amount,
            "profit": sales_profit,
            "profit_rate": round(sales_profit / sales_amount * 100, 2) if sales_amount > 0 else 0,
            "products": sales_products
        },
        "purchase": {
            "order_count": purchase_order_count,
            "quantity": purchase_quantity,
            "amount": purchase_amount,
            "products": purchase_products
        },
        "recent_orders": recent_orders
    }


@router.get("/product-rank", response_model=ProductRankResponse)
async def get_product_rank(
    *,
    db: AsyncSession = Depends(get_db),
    rank_type: str = Query("sales", pattern="^(sales|profit)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50)) -> Any:
    """获取商品排行"""
    conditions = [
        BusinessOrder.order_type == "sale",
        BusinessOrder.status == "completed"
    ]
    
    # 使用业务日期（order_date）筛选，而非完成时间
    if start_date:
        conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(BusinessOrder.order_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    order_field = func.sum(OrderItem.profit) if rank_type == "profit" else func.sum(OrderItem.quantity)
    
    result = await db.execute(
        select(
            OrderItem.product_id,
            Product.name,
            Product.code,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("total_quantity"),
            func.coalesce(func.sum(OrderItem.amount), 0).label("total_amount"),
            func.coalesce(func.sum(OrderItem.profit), 0).label("total_profit")
        ).join(
            BusinessOrder, OrderItem.order_id == BusinessOrder.id
        ).join(
            Product, OrderItem.product_id == Product.id
        ).where(
            and_(*conditions)
        ).group_by(
            OrderItem.product_id, Product.name, Product.code
        ).order_by(
            order_field.desc()
        ).limit(limit)
    )
    
    items = [
        ProductRankItem(
            product_id=row[0],
            product_name=row[1],
            product_code=row[2],
            total_quantity=row[3],
            total_amount=float(row[4]),
            total_profit=float(row[5])
        )
        for row in result
    ]
    
    return ProductRankResponse(items=items, rank_type=rank_type)


@router.get("/product-trading")
async def get_product_trading(
    *,
    db: AsyncSession = Depends(get_db),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None)
) -> Any:
    """
    获取商品进销统计
    包含：采购数量/金额、销售数量/金额、库存、毛利
    """
    # 基础条件
    date_conditions = []
    if start_date:
        date_conditions.append(BusinessOrder.order_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        date_conditions.append(BusinessOrder.order_date < end_dt)
    
    # 查询所有商品
    product_query = select(Product).where(Product.is_active == True)
    if category_id:
        product_query = product_query.where(Product.category_id == category_id)
    if search:
        product_query = product_query.where(
            (Product.name.contains(search)) | (Product.code.contains(search))
        )
    product_query = product_query.order_by(Product.code)
    
    products_result = await db.execute(product_query)
    products = products_result.scalars().all()
    
    items = []
    total_purchase_qty = 0
    total_purchase_amt = Decimal("0")
    total_sale_qty = 0
    total_sale_amt = Decimal("0")
    total_profit = Decimal("0")
    total_stock = Decimal("0")
    
    for product in products:
        # 采购统计
        purchase_conditions = [
            BusinessOrder.order_type == "purchase",
            BusinessOrder.status == "completed",
            OrderItem.product_id == product.id,
            *date_conditions
        ]
        purchase_result = await db.execute(
            select(
                func.coalesce(func.sum(OrderItem.quantity), 0),
                func.coalesce(func.sum(OrderItem.amount), 0)
            ).join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
            .where(and_(*purchase_conditions))
        )
        purchase_row = purchase_result.first()
        purchase_qty = int(purchase_row[0]) if purchase_row else 0
        purchase_amt = Decimal(str(purchase_row[1])) if purchase_row else Decimal("0")
        
        # 销售统计
        sale_conditions = [
            BusinessOrder.order_type == "sale",
            BusinessOrder.status == "completed",
            OrderItem.product_id == product.id,
            *date_conditions
        ]
        sale_result = await db.execute(
            select(
                func.coalesce(func.sum(OrderItem.quantity), 0),
                func.coalesce(func.sum(OrderItem.amount), 0)
            ).join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
            .where(and_(*sale_conditions))
        )
        sale_row = sale_result.first()
        sale_qty = int(sale_row[0]) if sale_row else 0
        sale_amt = Decimal(str(sale_row[1])) if sale_row else Decimal("0")
        
        # 从批次追溯计算成本
        cost_result = await db.execute(
            select(func.coalesce(func.sum(OrderItemBatch.cost_amount), 0))
            .join(OrderItem, OrderItemBatch.order_item_id == OrderItem.id)
            .join(BusinessOrder, OrderItem.order_id == BusinessOrder.id)
            .where(and_(
                BusinessOrder.order_type == "sale",
                BusinessOrder.status == "completed",
                OrderItem.product_id == product.id,
                *date_conditions
            ))
        )
        cost_amt = Decimal(str(cost_result.scalar() or 0))
        
        # 计算该商品对应的运费和冷藏费（按销售金额比例分摊）
        # 简化处理：商品级别的利润 = 销售金额 - 批次成本
        # 运费和冷藏费在整体利润中扣除
        profit = sale_amt - cost_amt
        
        # 库存
        stock_result = await db.execute(
            select(func.coalesce(func.sum(Stock.quantity), 0))
            .where(Stock.product_id == product.id)
        )
        stock_qty = Decimal(str(stock_result.scalar() or 0))
        
        # 只显示有进销记录的商品
        if purchase_qty > 0 or sale_qty > 0 or stock_qty > 0:
            items.append({
                "product_id": product.id,
                "product_code": product.code,
                "product_name": product.name,
                "category_name": product.category or "",
                "base_unit": product.unit or "个",
                "purchase_qty": purchase_qty,
                "purchase_amount": float(purchase_amt),
                "sale_qty": sale_qty,
                "sale_amount": float(sale_amt),
                "profit": float(profit),
                "profit_rate": round(float(profit / sale_amt * 100), 2) if sale_amt > 0 else 0,
                "stock_qty": float(stock_qty),
                "avg_purchase_price": round(float(purchase_amt / purchase_qty), 2) if purchase_qty > 0 else 0,
                "avg_sale_price": round(float(sale_amt / sale_qty), 2) if sale_qty > 0 else 0,
            })
            
            total_purchase_qty += purchase_qty
            total_purchase_amt += purchase_amt
            total_sale_qty += sale_qty
            total_sale_amt += sale_amt
            total_profit += profit
            total_stock += stock_qty
    
    return {
        "items": items,
        "summary": {
            "total_products": len(items),
            "total_purchase_qty": total_purchase_qty,
            "total_purchase_amount": float(total_purchase_amt),
            "total_sale_qty": total_sale_qty,
            "total_sale_amount": float(total_sale_amt),
            "total_profit": float(total_profit),
            "total_profit_rate": round(float(total_profit / total_sale_amt * 100), 2) if total_sale_amt > 0 else 0,
            "total_stock": float(total_stock)
        },
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        }
    }

