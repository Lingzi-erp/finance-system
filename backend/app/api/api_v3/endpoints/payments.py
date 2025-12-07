"""收付款记录管理API"""

from typing import Any, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.v3.payment_record import PaymentRecord
from app.models.v3.payment_method import PaymentMethod
from app.models.v3.account_balance import AccountBalance
from app.models.v3.entity import Entity
from app.schemas.v3.payment_record import (
    PaymentRecordCreate, PaymentRecordUpdate, PaymentRecordResponse,
    PaymentRecordListResponse, PaymentSummary
)

router = APIRouter()

async def generate_payment_no(db: AsyncSession, payment_type: str) -> str:
    """生成收付款单号"""
    prefix = "REC" if payment_type == "receive" else "PAY"
    date_str = datetime.now().strftime("%Y%m%d")
    
    pattern = f"{prefix}{date_str}%"
    result = await db.execute(
        select(func.max(PaymentRecord.payment_no)).where(PaymentRecord.payment_no.like(pattern))
    )
    max_no = result.scalar()
    
    if max_no:
        try:
            seq = int(max_no[-3:]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    
    return f"{prefix}{date_str}{seq:03d}"

def build_payment_response(payment: PaymentRecord) -> PaymentRecordResponse:
    """构建收付款响应"""
    order_id = None
    order_no = ""
    if payment.account_balance and payment.account_balance.order:
        order_id = payment.account_balance.order.id
        order_no = payment.account_balance.order.order_no
    
    # 获取收付款方式图标
    method_icon = ""
    if payment.method:
        method_icon = payment.method.icon
    
    return PaymentRecordResponse(
        id=payment.id,
        payment_no=payment.payment_no,
        entity_id=payment.entity_id,
        account_balance_id=payment.account_balance_id,
        payment_type=payment.payment_type,
        amount=float(payment.amount or 0),
        payment_method_id=payment.payment_method_id,
        payment_method=payment.payment_method,
        payment_date=payment.payment_date,
        notes=payment.notes,
        type_display=payment.type_display,
        method_display=payment.method_display,
        method_icon=method_icon,
        entity_name=payment.entity.name if payment.entity else "",
        entity_code=payment.entity.code if payment.entity else "",
        order_id=order_id,
        order_no=order_no,
        created_by=payment.created_by,
        creator_name=payment.creator.username if payment.creator else "",
        created_at=payment.created_at,
        updated_at=payment.updated_at
    )

@router.get("/", response_model=PaymentRecordListResponse)
async def list_payments(
    *,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    payment_type: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)) -> Any:
    """获取收付款列表"""
    query = select(PaymentRecord).options(
        selectinload(PaymentRecord.entity),
        selectinload(PaymentRecord.method),
        selectinload(PaymentRecord.account_balance).selectinload(AccountBalance.order),
        selectinload(PaymentRecord.creator)
    )
    
    conditions = []
    if payment_type:
        conditions.append(PaymentRecord.payment_type == payment_type)
    if payment_method:
        conditions.append(PaymentRecord.payment_method == payment_method)
    if entity_id:
        conditions.append(PaymentRecord.entity_id == entity_id)
    if start_date:
        conditions.append(PaymentRecord.payment_date >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        conditions.append(PaymentRecord.payment_date <= datetime.strptime(end_date, "%Y-%m-%d"))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 计算总数
    count_query = select(func.count(PaymentRecord.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页查询
    query = query.order_by(PaymentRecord.payment_date.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    payments = result.scalars().unique().all()
    
    return PaymentRecordListResponse(
        data=[build_payment_response(p) for p in payments],
        total=total,
        page=page,
        limit=limit
    )

@router.get("/summary", response_model=PaymentSummary)
async def get_payments_summary(
    *,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """获取收付款汇总"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # 总收款
    total_received_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "receive"
        )
    )
    total_received = float(total_received_result.scalar() or 0)
    
    # 总付款
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "pay"
        )
    )
    total_paid = float(total_paid_result.scalar() or 0)
    
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
    
    # 本月收款
    month_received_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "receive",
            PaymentRecord.payment_date >= month_start
        )
    )
    month_received = float(month_received_result.scalar() or 0)
    
    # 本月付款
    month_paid_result = await db.execute(
        select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
            PaymentRecord.payment_type == "pay",
            PaymentRecord.payment_date >= month_start
        )
    )
    month_paid = float(month_paid_result.scalar() or 0)
    
    return PaymentSummary(
        total_received=total_received,
        total_paid=total_paid,
        today_received=today_received,
        today_paid=today_paid,
        month_received=month_received,
        month_paid=month_paid
    )

@router.post("/", response_model=PaymentRecordResponse)
async def create_payment(
    *,
    db: AsyncSession = Depends(get_db),
    payment_in: PaymentRecordCreate) -> Any:
    """创建收付款记录"""
    # 验证实体
    entity = await db.get(Entity, payment_in.entity_id)
    if not entity:
        raise HTTPException(status_code=400, detail="实体不存在")
    
    # 如果关联账款，验证并更新
    account = None
    if payment_in.account_balance_id:
        account = await db.get(AccountBalance, payment_in.account_balance_id)
        if not account:
            raise HTTPException(status_code=400, detail="账款不存在")
        
        if account.status == "paid":
            raise HTTPException(status_code=400, detail="该账款已结清")
        
        if account.status == "cancelled":
            raise HTTPException(status_code=400, detail="该账款已取消")
        
        # 验证收付款类型与账款类型匹配
        if payment_in.payment_type == "receive" and account.balance_type != "receivable":
            raise HTTPException(status_code=400, detail="收款只能关联应收账款")
        if payment_in.payment_type == "pay" and account.balance_type != "payable":
            raise HTTPException(status_code=400, detail="付款只能关联应付账款")
        
        # 验证金额不超过余额
        if Decimal(str(payment_in.amount)) > account.balance:
            raise HTTPException(
                status_code=400, 
                detail=f"付款金额不能超过账款余额 ¥{account.balance}"
            )
    
    # 生成单号
    payment_no = await generate_payment_no(db, payment_in.payment_type)
    
    # 验证收付款方式
    payment_method = None
    if payment_in.payment_method_id:
        payment_method = await db.get(PaymentMethod, payment_in.payment_method_id)
        if not payment_method:
            raise HTTPException(status_code=400, detail="收付款方式不存在")
    
    # 创建收付款记录
    payment = PaymentRecord(
        payment_no=payment_no,
        entity_id=payment_in.entity_id,
        account_balance_id=payment_in.account_balance_id,
        payment_type=payment_in.payment_type,
        amount=Decimal(str(payment_in.amount)),
        payment_method_id=payment_in.payment_method_id,
        payment_method=payment_in.payment_method,
        payment_date=payment_in.payment_date or datetime.utcnow(),
        notes=payment_in.notes,
        created_by=1
    )
    db.add(payment)
    
    # 更新代收账户余额
    if payment_method and payment_method.is_proxy:
        if payment_in.payment_type == "receive":
            # 收款增加代收余额
            payment_method.proxy_balance = (payment_method.proxy_balance or Decimal("0")) + Decimal(str(payment_in.amount))
        else:
            # 付款减少代收余额
            payment_method.proxy_balance = (payment_method.proxy_balance or Decimal("0")) - Decimal(str(payment_in.amount))
    
    # 更新账款状态
    if account:
        account.paid_amount = account.paid_amount + Decimal(str(payment_in.amount))
        account.recalculate()
    
    # 更新实体余额
    if payment_in.payment_type == "receive":
        # 收款减少应收（客户欠款减少）
        entity.current_balance = (entity.current_balance or Decimal("0")) - Decimal(str(payment_in.amount))
    else:
        # 付款减少应付（我们欠款减少）
        entity.current_balance = (entity.current_balance or Decimal("0")) + Decimal(str(payment_in.amount))
    
    await db.commit()
    
    # 重新加载
    result = await db.execute(
        select(PaymentRecord).options(
            selectinload(PaymentRecord.entity),
            selectinload(PaymentRecord.method),
            selectinload(PaymentRecord.account_balance).selectinload(AccountBalance.order),
            selectinload(PaymentRecord.creator)
        ).where(PaymentRecord.id == payment.id)
    )
    payment = result.scalar_one()
    
    return build_payment_response(payment)

@router.get("/{payment_id}", response_model=PaymentRecordResponse)
async def get_payment(
    *,
    db: AsyncSession = Depends(get_db),
    payment_id: int) -> Any:
    """获取收付款详情"""
    result = await db.execute(
        select(PaymentRecord).options(
            selectinload(PaymentRecord.entity),
            selectinload(PaymentRecord.method),
            selectinload(PaymentRecord.account_balance).selectinload(AccountBalance.order),
            selectinload(PaymentRecord.creator)
        ).where(PaymentRecord.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    
    if not payment:
        raise HTTPException(status_code=404, detail="收付款记录不存在")
    
    return build_payment_response(payment)

@router.delete("/{payment_id}")
async def delete_payment(
    *,
    db: AsyncSession = Depends(get_db),
    payment_id: int) -> Any:
    """删除收付款记录（会回滚账款状态和代收余额）"""
    result = await db.execute(
        select(PaymentRecord).options(
            selectinload(PaymentRecord.entity),
            selectinload(PaymentRecord.method),
            selectinload(PaymentRecord.account_balance)
        ).where(PaymentRecord.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    
    if not payment:
        raise HTTPException(status_code=404, detail="收付款记录不存在")
    
    # 回滚账款状态
    if payment.account_balance:
        account = payment.account_balance
        account.paid_amount = account.paid_amount - payment.amount
        account.recalculate()
    
    # 回滚实体余额
    entity = payment.entity
    if entity:
        if payment.payment_type == "receive":
            entity.current_balance = (entity.current_balance or Decimal("0")) + payment.amount
        else:
            entity.current_balance = (entity.current_balance or Decimal("0")) - payment.amount
    
    # 回滚代收账户余额
    if payment.method and payment.method.is_proxy:
        if payment.payment_type == "receive":
            payment.method.proxy_balance = (payment.method.proxy_balance or Decimal("0")) - payment.amount
        else:
            payment.method.proxy_balance = (payment.method.proxy_balance or Decimal("0")) + payment.amount
    
    await db.delete(payment)
    await db.commit()
    
    return {"message": "删除成功"}

