"""应收/应付账款管理API"""

from typing import Any, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.account_balance import AccountBalance
from app.models.v3.payment_record import PaymentRecord
from app.models.v3.entity import Entity
from app.models.v3.business_order import BusinessOrder
from app.schemas.v3.account_balance import (
    AccountBalanceCreate, AccountBalanceUpdate, AccountBalanceResponse,
    AccountBalanceListResponse, AccountBalanceSummary
)

router = APIRouter()

def build_account_response(account: AccountBalance) -> AccountBalanceResponse:
    """构建账款响应"""
    # 业务日期：优先使用关联订单的业务日期，期初数据使用创建时间
    business_date = account.created_at
    if account.order:
        business_date = account.order.order_date or account.created_at
    
    return AccountBalanceResponse(
        id=account.id,
        entity_id=account.entity_id,
        order_id=account.order_id,  # 可能为 None（期初数据）
        balance_type=account.balance_type,
        amount=float(account.amount or 0),
        paid_amount=float(account.paid_amount or 0),
        balance=float(account.balance or 0),
        due_date=account.due_date,
        status=account.status,
        notes=account.notes,
        is_initial=account.is_initial or False,  # 是否为期初数据
        type_display=account.type_display,
        status_display=account.status_display,
        entity_name=account.entity.name if account.entity else "",
        entity_code=account.entity.code if account.entity else "",
        order_no=account.order.order_no if account.order else "",
        business_date=business_date,  # 业务日期
        created_by=account.created_by,
        creator_name=account.creator.username if account.creator else "",
        created_at=account.created_at,
        updated_at=account.updated_at
    )

@router.get("/", response_model=AccountBalanceListResponse)
async def list_accounts(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    balance_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD")) -> Any:
    """获取账款列表"""
    # 使用 join 来支持按订单业务日期筛选
    query = (
        select(AccountBalance)
        .join(BusinessOrder, AccountBalance.order_id == BusinessOrder.id, isouter=True)
        .options(
            selectinload(AccountBalance.entity),
            selectinload(AccountBalance.order),
            selectinload(AccountBalance.creator)
        )
    )
    
    conditions = []
    if balance_type:
        conditions.append(AccountBalance.balance_type == balance_type)
    if status:
        conditions.append(AccountBalance.status == status)
    if entity_id:
        conditions.append(AccountBalance.entity_id == entity_id)
    
    # 日期筛选：使用订单业务日期，期初数据使用创建时间
    if start_date:
        conditions.append(
            func.coalesce(BusinessOrder.order_date, AccountBalance.created_at) >= datetime.strptime(start_date, "%Y-%m-%d")
        )
    if end_date:
        conditions.append(
            func.coalesce(BusinessOrder.order_date, AccountBalance.created_at) <= datetime.strptime(end_date, "%Y-%m-%d")
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 计算总数
    count_query = (
        select(func.count(AccountBalance.id))
        .join(BusinessOrder, AccountBalance.order_id == BusinessOrder.id, isouter=True)
    )
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页查询，按业务日期排序
    query = query.order_by(func.coalesce(BusinessOrder.order_date, AccountBalance.created_at).desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    accounts = result.scalars().unique().all()
    
    return AccountBalanceListResponse(
        data=[build_account_response(a) for a in accounts],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/summary", response_model=AccountBalanceSummary)
async def get_accounts_summary(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取账款汇总"""
    now = datetime.utcnow()
    
    # 应收账款统计
    receivable_result = await db.execute(
        select(
            func.coalesce(func.sum(AccountBalance.amount), 0),
            func.coalesce(func.sum(AccountBalance.balance), 0)
        ).where(
            AccountBalance.balance_type == "receivable",
            AccountBalance.status != "cancelled"
        )
    )
    receivable_row = receivable_result.first()
    total_receivable = float(receivable_row[0]) if receivable_row else 0
    receivable_balance = float(receivable_row[1]) if receivable_row else 0
    
    # 应付账款统计
    payable_result = await db.execute(
        select(
            func.coalesce(func.sum(AccountBalance.amount), 0),
            func.coalesce(func.sum(AccountBalance.balance), 0)
        ).where(
            AccountBalance.balance_type == "payable",
            AccountBalance.status != "cancelled"
        )
    )
    payable_row = payable_result.first()
    total_payable = float(payable_row[0]) if payable_row else 0
    payable_balance = float(payable_row[1]) if payable_row else 0
    
    # 逾期应收
    overdue_receivable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.balance_type == "receivable",
            AccountBalance.status.in_(["pending", "partial"]),
            AccountBalance.due_date < now
        )
    )
    overdue_receivable = float(overdue_receivable_result.scalar() or 0)
    
    # 逾期应付
    overdue_payable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.balance_type == "payable",
            AccountBalance.status.in_(["pending", "partial"]),
            AccountBalance.due_date < now
        )
    )
    overdue_payable = float(overdue_payable_result.scalar() or 0)
    
    return AccountBalanceSummary(
        total_receivable=total_receivable,
        total_payable=total_payable,
        receivable_balance=receivable_balance,
        payable_balance=payable_balance,
        overdue_receivable=overdue_receivable,
        overdue_payable=overdue_payable
    )

@router.get("/{account_id}", response_model=AccountBalanceResponse)
async def get_account(
    *,
    db: AsyncSession = Depends(get_db),
    account_id: int) -> Any:
    """获取账款详情"""
    result = await db.execute(
        select(AccountBalance).options(
            selectinload(AccountBalance.entity),
            selectinload(AccountBalance.order),
            selectinload(AccountBalance.creator),
            selectinload(AccountBalance.payments)
        ).where(AccountBalance.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="账款不存在")
    
    return build_account_response(account)

@router.put("/{account_id}", response_model=AccountBalanceResponse)
async def update_account(
    *,
    db: AsyncSession = Depends(get_db),
    account_id: int,
    account_in: AccountBalanceUpdate) -> Any:
    """更新账款信息"""
    account = await db.get(AccountBalance, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账款不存在")
    
    if account_in.due_date is not None:
        account.due_date = account_in.due_date
    if account_in.notes is not None:
        account.notes = account_in.notes
    
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(AccountBalance).options(
            selectinload(AccountBalance.entity),
            selectinload(AccountBalance.order),
            selectinload(AccountBalance.creator)
        ).where(AccountBalance.id == account_id)
    )
    account = result.scalar_one()
    
    return build_account_response(account)

@router.post("/{account_id}/cancel")
async def cancel_account(
    *,
    db: AsyncSession = Depends(get_db),
    account_id: int) -> Any:
    """取消账款"""
    account = await db.get(AccountBalance, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="账款不存在")
    
    if account.status == "paid":
        raise HTTPException(status_code=400, detail="已结清的账款无法取消")
    
    if account.paid_amount > Decimal("0"):
        raise HTTPException(status_code=400, detail="已有收付款记录，无法取消")
    
    account.status = "cancelled"
    await db.commit()
    
    return {"message": "取消成功"}

@router.get("/entity/{entity_id}/summary")
async def get_entity_account_summary(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int) -> Any:
    """获取实体的账款汇总"""
    # 应收余额
    receivable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.entity_id == entity_id,
            AccountBalance.balance_type == "receivable",
            AccountBalance.status.in_(["pending", "partial"])
        )
    )
    receivable_balance = float(receivable_result.scalar() or 0)
    
    # 应付余额
    payable_result = await db.execute(
        select(func.coalesce(func.sum(AccountBalance.balance), 0)).where(
            AccountBalance.entity_id == entity_id,
            AccountBalance.balance_type == "payable",
            AccountBalance.status.in_(["pending", "partial"])
        )
    )
    payable_balance = float(payable_result.scalar() or 0)
    
    return {
        "entity_id": entity_id,
        "receivable_balance": receivable_balance,
        "payable_balance": payable_balance,
        "net_balance": receivable_balance - payable_balance
    }

@router.get("/overview/by-entity")
async def get_accounts_overview_by_entity(
    *,
    db: AsyncSession = Depends(get_db),
    balance_type: Optional[str] = Query(None, description="receivable(应收)/payable(应付)"),
    min_balance: Optional[float] = Query(None, description="最小余额筛选"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)) -> Any:
    """
    往来汇总 - 按客户/供应商分组统计
    返回每个往来单位的：总金额、已付/收金额、余额、逾期金额
    """
    now = datetime.utcnow()
    
    # 基础查询：按实体分组统计
    base_query = select(
        Entity.id.label("entity_id"),
        Entity.name.label("entity_name"),
        Entity.code.label("entity_code"),
        Entity.entity_type.label("entity_type"),
        AccountBalance.balance_type,
        func.coalesce(func.sum(AccountBalance.amount), 0).label("total_amount"),
        func.coalesce(func.sum(AccountBalance.paid_amount), 0).label("paid_amount"),
        func.coalesce(func.sum(AccountBalance.balance), 0).label("balance"),
        func.count(AccountBalance.id).label("order_count")).join(
        Entity, AccountBalance.entity_id == Entity.id
    ).where(
        AccountBalance.status.in_(["pending", "partial"])
    ).group_by(
        Entity.id, Entity.name, Entity.code, Entity.entity_type,
        AccountBalance.balance_type
    )
    
    if balance_type:
        base_query = base_query.where(AccountBalance.balance_type == balance_type)
    
    # 执行查询
    result = await db.execute(base_query)
    rows = result.fetchall()
    
    # 查询逾期金额（单独查询以便计算）
    overdue_query = select(
        AccountBalance.entity_id,
        AccountBalance.balance_type,
        func.coalesce(func.sum(AccountBalance.balance), 0).label("overdue_amount")
    ).where(
        AccountBalance.status.in_(["pending", "partial"]),
        AccountBalance.due_date < now
    ).group_by(
        AccountBalance.entity_id, AccountBalance.balance_type
    )
    
    overdue_result = await db.execute(overdue_query)
    overdue_map = {}
    for row in overdue_result.fetchall():
        key = (row.entity_id, row.balance_type)
        overdue_map[key] = float(row.overdue_amount)
    
    # 组装结果
    data = []
    for row in rows:
        balance = float(row.balance)
        if min_balance is not None and balance < min_balance:
            continue
        
        overdue_key = (row.entity_id, row.balance_type)
        overdue_amount = overdue_map.get(overdue_key, 0)
        
        data.append({
            "entity_id": row.entity_id,
            "entity_name": row.entity_name,
            "entity_code": row.entity_code,
            "entity_type": row.entity_type,
            "balance_type": row.balance_type,
            "balance_type_display": "应收" if row.balance_type == "receivable" else "应付",
            "total_amount": float(row.total_amount),
            "paid_amount": float(row.paid_amount),
            "balance": balance,
            "overdue_amount": overdue_amount,
            "order_count": row.order_count,
        })
    
    # 按余额降序排序
    data.sort(key=lambda x: x["balance"], reverse=True)
    
    # 分页
    total = len(data)
    start = (page - 1) * limit
    end = start + limit
    data = data[start:end]
    
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/aging/receivable")
async def get_receivable_aging(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: Optional[int] = Query(None, description="按实体筛选")) -> Any:
    """
    应收账龄分析
    按账期分组：当期（未到期）、1-30天、31-60天、61-90天、90天以上
    """
    now = datetime.utcnow()
    
    # 查询所有未结清的应收账款
    query = select(AccountBalance).options(
        selectinload(AccountBalance.entity),
        selectinload(AccountBalance.order)
    ).where(
        AccountBalance.balance_type == "receivable",
        AccountBalance.status.in_(["pending", "partial"])
    )
    
    if entity_id:
        query = query.where(AccountBalance.entity_id == entity_id)
    
    result = await db.execute(query)
    accounts = result.scalars().unique().all()
    
    # 分组统计
    aging_buckets = {
        "current": {"label": "未到期", "count": 0, "amount": Decimal("0")},
        "1_30": {"label": "1-30天", "count": 0, "amount": Decimal("0")},
        "31_60": {"label": "31-60天", "count": 0, "amount": Decimal("0")},
        "61_90": {"label": "61-90天", "count": 0, "amount": Decimal("0")},
        "over_90": {"label": "90天以上", "count": 0, "amount": Decimal("0")},
    }
    
    details_by_entity = {}  # 按实体汇总明细
    
    for account in accounts:
        balance = account.balance or Decimal("0")
        if balance <= 0:
            continue
        
        # 计算账龄
        if not account.due_date:
            bucket = "current"
            days_overdue = 0
        else:
            days_overdue = (now - account.due_date).days
            if days_overdue <= 0:
                bucket = "current"
                days_overdue = 0
            elif days_overdue <= 30:
                bucket = "1_30"
            elif days_overdue <= 60:
                bucket = "31_60"
            elif days_overdue <= 90:
                bucket = "61_90"
            else:
                bucket = "over_90"
        
        aging_buckets[bucket]["count"] += 1
        aging_buckets[bucket]["amount"] += balance
        
        # 汇总到实体
        entity_id_key = account.entity_id
        if entity_id_key not in details_by_entity:
            details_by_entity[entity_id_key] = {
                "entity_id": entity_id_key,
                "entity_name": account.entity.name if account.entity else "",
                "entity_code": account.entity.code if account.entity else "",
                "current": Decimal("0"),
                "1_30": Decimal("0"),
                "31_60": Decimal("0"),
                "61_90": Decimal("0"),
                "over_90": Decimal("0"),
                "total": Decimal("0"),
            }
        details_by_entity[entity_id_key][bucket] += balance
        details_by_entity[entity_id_key]["total"] += balance
    
    # 转换为列表并格式化
    summary = {k: {"label": v["label"], "count": v["count"], "amount": float(v["amount"])} 
               for k, v in aging_buckets.items()}
    
    details = list(details_by_entity.values())
    for d in details:
        d["current"] = float(d["current"])
        d["1_30"] = float(d["1_30"])
        d["31_60"] = float(d["31_60"])
        d["61_90"] = float(d["61_90"])
        d["over_90"] = float(d["over_90"])
        d["total"] = float(d["total"])
    
    # 按总额降序排序
    details.sort(key=lambda x: x["total"], reverse=True)
    
    total_receivable = sum(float(b["amount"]) for b in aging_buckets.values())
    total_overdue = total_receivable - float(aging_buckets["current"]["amount"])
    
    return {
        "summary": summary,
        "total_receivable": total_receivable,
        "total_overdue": total_overdue,
        "overdue_rate": round(total_overdue / total_receivable * 100, 2) if total_receivable > 0 else 0,
        "details": details
    }

@router.get("/aging/payable")
async def get_payable_aging(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: Optional[int] = Query(None, description="按实体筛选")) -> Any:
    """
    应付账龄分析
    按账期分组：当期（未到期）、1-30天、31-60天、61-90天、90天以上
    """
    now = datetime.utcnow()
    
    # 查询所有未结清的应付账款
    query = select(AccountBalance).options(
        selectinload(AccountBalance.entity),
        selectinload(AccountBalance.order)
    ).where(
        AccountBalance.balance_type == "payable",
        AccountBalance.status.in_(["pending", "partial"])
    )
    
    if entity_id:
        query = query.where(AccountBalance.entity_id == entity_id)
    
    result = await db.execute(query)
    accounts = result.scalars().unique().all()
    
    # 分组统计
    aging_buckets = {
        "current": {"label": "未到期", "count": 0, "amount": Decimal("0")},
        "1_30": {"label": "1-30天", "count": 0, "amount": Decimal("0")},
        "31_60": {"label": "31-60天", "count": 0, "amount": Decimal("0")},
        "61_90": {"label": "61-90天", "count": 0, "amount": Decimal("0")},
        "over_90": {"label": "90天以上", "count": 0, "amount": Decimal("0")},
    }
    
    details_by_entity = {}  # 按实体汇总明细
    
    for account in accounts:
        balance = account.balance or Decimal("0")
        if balance <= 0:
            continue
        
        # 计算账龄
        if not account.due_date:
            bucket = "current"
            days_overdue = 0
        else:
            days_overdue = (now - account.due_date).days
            if days_overdue <= 0:
                bucket = "current"
                days_overdue = 0
            elif days_overdue <= 30:
                bucket = "1_30"
            elif days_overdue <= 60:
                bucket = "31_60"
            elif days_overdue <= 90:
                bucket = "61_90"
            else:
                bucket = "over_90"
        
        aging_buckets[bucket]["count"] += 1
        aging_buckets[bucket]["amount"] += balance
        
        # 汇总到实体
        entity_id_key = account.entity_id
        if entity_id_key not in details_by_entity:
            details_by_entity[entity_id_key] = {
                "entity_id": entity_id_key,
                "entity_name": account.entity.name if account.entity else "",
                "entity_code": account.entity.code if account.entity else "",
                "current": Decimal("0"),
                "1_30": Decimal("0"),
                "31_60": Decimal("0"),
                "61_90": Decimal("0"),
                "over_90": Decimal("0"),
                "total": Decimal("0"),
            }
        details_by_entity[entity_id_key][bucket] += balance
        details_by_entity[entity_id_key]["total"] += balance
    
    # 转换为列表并格式化
    summary = {k: {"label": v["label"], "count": v["count"], "amount": float(v["amount"])} 
               for k, v in aging_buckets.items()}
    
    details = list(details_by_entity.values())
    for d in details:
        d["current"] = float(d["current"])
        d["1_30"] = float(d["1_30"])
        d["31_60"] = float(d["31_60"])
        d["61_90"] = float(d["61_90"])
        d["over_90"] = float(d["over_90"])
        d["total"] = float(d["total"])
    
    # 按总额降序排序
    details.sort(key=lambda x: x["total"], reverse=True)
    
    total_payable = sum(float(b["amount"]) for b in aging_buckets.values())
    total_overdue = total_payable - float(aging_buckets["current"]["amount"])
    
    return {
        "summary": summary,
        "total_payable": total_payable,
        "total_overdue": total_overdue,
        "overdue_rate": round(total_overdue / total_payable * 100, 2) if total_payable > 0 else 0,
        "details": details
    }

@router.get("/entity/{entity_id}/statement")
async def get_entity_statement(
    *,
    db: AsyncSession = Depends(get_db),
    entity_id: int,
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期")) -> Any:
    """
    获取往来对账单
    列出该客户/供应商的所有往来记录：业务单、收付款
    """
    entity = await db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")
    
    # 查询该实体相关的所有账款记录
    # 日期筛选使用关联订单的业务日期（order_date），而非账款创建时间
    account_query = (
        select(AccountBalance)
        .join(BusinessOrder, AccountBalance.order_id == BusinessOrder.id, isouter=True)
        .options(
            selectinload(AccountBalance.order),
            selectinload(AccountBalance.payments)
        )
        .where(
            AccountBalance.entity_id == entity_id,
            AccountBalance.status != "cancelled"
        )
    )
    
    if start_date:
        # 使用订单业务日期筛选，期初数据使用账款创建时间
        account_query = account_query.where(
            func.coalesce(BusinessOrder.order_date, AccountBalance.created_at) >= start_date
        )
    if end_date:
        account_query = account_query.where(
            func.coalesce(BusinessOrder.order_date, AccountBalance.created_at) <= end_date
        )
    
    # 按业务日期排序
    account_query = account_query.order_by(
        func.coalesce(BusinessOrder.order_date, AccountBalance.created_at)
    )
    
    result = await db.execute(account_query)
    accounts = result.scalars().unique().all()
    
    # 组装对账单明细
    statement_items = []
    running_receivable = Decimal("0")
    running_payable = Decimal("0")
    
    for account in accounts:
        # 业务日期：优先使用订单业务日期，期初数据使用创建时间
        business_date = account.order.order_date if account.order else account.created_at
        
        # 业务单发生
        item = {
            "date": business_date.strftime("%Y-%m-%d"),
            "type": "order",
            "ref_no": account.order.order_no if account.order else "期初",
            "description": f"{'销售' if account.balance_type == 'receivable' else '采购'}单" if account.order else "期初余额",
            "debit": float(account.amount) if account.balance_type == "receivable" else 0,  # 应收增加
            "credit": float(account.amount) if account.balance_type == "payable" else 0,  # 应付增加
            "receivable_balance": 0,
            "payable_balance": 0,
        }
        
        if account.balance_type == "receivable":
            running_receivable += account.amount
        else:
            running_payable += account.amount
        
        item["receivable_balance"] = float(running_receivable)
        item["payable_balance"] = float(running_payable)
        statement_items.append(item)
        
        # 收付款记录 - 使用实际付款日期
        for payment in account.payments:
            pay_item = {
                "date": (payment.payment_date or payment.created_at).strftime("%Y-%m-%d"),
                "type": "payment",
                "ref_no": f"PAY-{payment.id}",
                "description": f"{'收款' if account.balance_type == 'receivable' else '付款'} ({payment.payment_method_display})",
                "debit": 0 if account.balance_type == "receivable" else float(payment.amount),  # 应付减少
                "credit": float(payment.amount) if account.balance_type == "receivable" else 0,  # 应收减少
                "receivable_balance": 0,
                "payable_balance": 0,
            }
            
            if account.balance_type == "receivable":
                running_receivable -= payment.amount
            else:
                running_payable -= payment.amount
            
            pay_item["receivable_balance"] = float(running_receivable)
            pay_item["payable_balance"] = float(running_payable)
            statement_items.append(pay_item)
    
    return {
        "entity_id": entity_id,
        "entity_name": entity.name,
        "entity_code": entity.code,
        "start_date": start_date.strftime("%Y-%m-%d") if start_date else None,
        "end_date": end_date.strftime("%Y-%m-%d") if end_date else None,
        "items": statement_items,
        "ending_receivable": float(running_receivable),
        "ending_payable": float(running_payable),
        "net_balance": float(running_receivable - running_payable),  # 正数=对方欠我，负数=我欠对方
    }
