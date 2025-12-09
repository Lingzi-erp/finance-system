"""
业务单账款操作模块 - 在途仓架构

新架构财务规则：
1. 装货单(X→D)：
   - X=A(供应商)：应付供应商+（货款）
   - X=B(仓库)：应付仓库+（冷藏费=开库费+仓储费）
   - X=C(客户)：应付客户+（货款，即退货退款）
   - 其他费用：应付其他+

2. 卸货单(D→Y)：
   - Y=A(供应商)：应收供应商+（货款，即退货退款）
   - Y=B(仓库)：应付仓库+（冷藏费=仅开库费）
   - Y=C(客户)：应收客户+（货款）
   - 运费：应付物流+
   - 其他费用：应付其他+

兼容旧类型：purchase, sale, return_in, return_out, transfer
"""

from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.v3.business_order import BusinessOrder
from app.models.v3.entity import Entity
from app.models.v3.account_balance import AccountBalance

# 系统实体编码
MISC_EXPENSE_ENTITY_CODE = "SYS_MISC_EXPENSE"  # 杂费支出


async def _create_single_account(
    db: AsyncSession,
    entity_id: int,
    order_id: int,
    order_no: str,
    balance_type: str,
    amount: Decimal,
    notes: str) -> None:
    """创建单条账款记录并更新实体余额"""
    if amount <= Decimal("0"):
        return
    
    account = AccountBalance(
        entity_id=entity_id,
        order_id=order_id,
        balance_type=balance_type,
        amount=amount,
        paid_amount=Decimal("0"),
        balance=amount,
        status="pending",
        notes=notes,
        created_by=1
    )
    db.add(account)
    
    # 更新实体的当前余额
    entity = await db.get(Entity, entity_id)
    if entity:
        if balance_type == "receivable":
            entity.current_balance = (entity.current_balance or Decimal("0")) + amount
        else:
            entity.current_balance = (entity.current_balance or Decimal("0")) - amount


async def _get_misc_expense_entity_id(db: AsyncSession) -> int | None:
    """获取杂费支出实体ID"""
    result = await db.execute(
        select(Entity.id).where(Entity.code == MISC_EXPENSE_ENTITY_CODE)
    )
    return result.scalar_one_or_none()


async def create_account_for_loading(db: AsyncSession, order: BusinessOrder) -> None:
    """
    装货单(X→D)财务处理
    
    规则：
    - X=A(供应商)：应付供应商+（货款）
    - X=B(仓库)：应付仓库+（冷藏费）
    - X=C(客户)：应付客户+（货款，即退货退款）
    - 其他费用：应付其他+
    - 装货单不产生运费（运费在卸货时结算）
    """
    goods_amount = order.total_amount or Decimal("0")
    storage_fee = order.total_storage_fee or Decimal("0")
    other_fee = order.other_fee or Decimal("0")
    
    source_entity = order.source_entity
    if not source_entity:
        return
    
    source_category = source_entity.entity_category
    
    # 货款
    if goods_amount > Decimal("0"):
        if source_category == 'A':  # 供应商
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", goods_amount,
                f"采购货款 - 装货单 {order.order_no}"
            )
        elif source_category == 'C':  # 客户
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", goods_amount,
                f"客户退货应退 - 装货单 {order.order_no}"
            )
        # B(仓库)不产生货款
    
    # 冷藏费（只有来源是仓库时才产生）
    if storage_fee > Decimal("0") and source_category == 'B':
        await _create_single_account(
            db, order.source_id, order.id, order.order_no,
            "payable", storage_fee,
            f"冷藏费应付（出库）- 装货单 {order.order_no}"
        )
    
    # 其他费用
    if other_fee > Decimal("0"):
        misc_entity_id = await _get_misc_expense_entity_id(db)
        if misc_entity_id:
            await _create_single_account(
                db, misc_entity_id, order.id, order.order_no,
                "payable", other_fee,
                f"其他费用 - 装货单 {order.order_no}"
            )


async def create_account_for_unloading(db: AsyncSession, order: BusinessOrder) -> None:
    """
    卸货单(D→Y)财务处理
    
    规则：
    - Y=A(供应商)：应收供应商+（货款，即退货退款）
    - Y=B(仓库)：应付仓库+（冷藏费，仅开库费）
    - Y=C(客户)：应收客户+（货款）
    - 运费：应付物流+
    - 其他费用：应付其他+
    """
    goods_amount = order.total_amount or Decimal("0")
    shipping_amount = order.total_shipping or Decimal("0")
    storage_fee = order.total_storage_fee or Decimal("0")
    other_fee = order.other_fee or Decimal("0")
    
    target_entity = order.target_entity
    if not target_entity:
        return
    
    target_category = target_entity.entity_category
    
    # 货款
    if goods_amount > Decimal("0"):
        if target_category == 'A':  # 供应商
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "receivable", goods_amount,
                f"退供应商应收 - 卸货单 {order.order_no}"
            )
        elif target_category == 'C':  # 客户
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "receivable", goods_amount,
                f"销售货款 - 卸货单 {order.order_no}"
            )
        # B(仓库)不产生货款
    
    # 运费（应付物流公司）
    if shipping_amount > Decimal("0") and order.logistics_company_id:
        await _create_single_account(
            db, order.logistics_company_id, order.id, order.order_no,
            "payable", shipping_amount,
            f"运费应付 - 卸货单 {order.order_no}"
        )
    
    # 冷藏费（只有目标是仓库时才产生）
    if storage_fee > Decimal("0") and target_category == 'B':
        await _create_single_account(
            db, order.target_id, order.id, order.order_no,
            "payable", storage_fee,
            f"冷藏费应付（入库）- 卸货单 {order.order_no}"
        )
    
    # 其他费用
    if other_fee > Decimal("0"):
        misc_entity_id = await _get_misc_expense_entity_id(db)
        if misc_entity_id:
            await _create_single_account(
                db, misc_entity_id, order.id, order.order_no,
                "payable", other_fee,
                f"其他费用 - 卸货单 {order.order_no}"
            )


async def create_account_for_legacy(db: AsyncSession, order: BusinessOrder) -> None:
    """
    旧类型订单的财务处理（兼容）
    
    支持：purchase, sale, return_in, return_out, transfer
    """
    order_type = order.order_type
    
    goods_amount = order.total_amount or Decimal("0")
    shipping_amount = order.total_shipping or Decimal("0")
    storage_fee = order.total_storage_fee or Decimal("0")
    other_fee = order.other_fee or Decimal("0")
    
    if all(a <= Decimal("0") for a in [goods_amount, shipping_amount, storage_fee, other_fee]):
        return
    
    # 获取物流公司ID
    logistics_company_id = order.logistics_company_id
    if not logistics_company_id and order.items:
        for item in order.items:
            if item.logistics_company_id:
                logistics_company_id = item.logistics_company_id
                break
    
    # 获取杂费支出实体ID
    misc_expense_entity_id = None
    if other_fee > Decimal("0"):
        misc_expense_entity_id = await _get_misc_expense_entity_id(db)
    
    if order_type == "sale":
        # 销售：货款应收客户，运费应付物流，冷藏费应付仓库（来源）
        if goods_amount > Decimal("0"):
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "receivable", goods_amount,
                f"销售货款 - {order.order_no}"
            )
        if shipping_amount > Decimal("0") and logistics_company_id:
            await _create_single_account(
                db, logistics_company_id, order.id, order.order_no,
                "payable", shipping_amount,
                f"运费应付 - {order.order_no}"
            )
        if storage_fee > Decimal("0"):
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", storage_fee,
                f"冷藏费应付 - {order.order_no}"
            )
        if other_fee > Decimal("0") and misc_expense_entity_id:
            await _create_single_account(
                db, misc_expense_entity_id, order.id, order.order_no,
                "payable", other_fee,
                f"其他费用 - {order.order_no}"
            )
                
    elif order_type == "purchase":
        # 采购：货款应付供应商，运费应付物流，冷藏费应付仓库（目标）
        if goods_amount > Decimal("0"):
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", goods_amount,
                f"采购货款 - {order.order_no}"
            )
        if shipping_amount > Decimal("0") and logistics_company_id:
            await _create_single_account(
                db, logistics_company_id, order.id, order.order_no,
                "payable", shipping_amount,
                f"运费应付 - {order.order_no}"
            )
        if storage_fee > Decimal("0"):
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "payable", storage_fee,
                f"冷藏费应付 - {order.order_no}"
            )
        if other_fee > Decimal("0") and misc_expense_entity_id:
            await _create_single_account(
                db, misc_expense_entity_id, order.id, order.order_no,
                "payable", other_fee,
                f"其他费用 - {order.order_no}"
            )
            
    elif order_type == "return_in":
        # 客户退货：应付客户
        final_amount = order.final_amount or Decimal("0")
        if final_amount > Decimal("0"):
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", final_amount,
                f"客户退货应退 - {order.order_no}"
            )
        
    elif order_type == "return_out":
        # 退供应商：应收供应商
        final_amount = order.final_amount or Decimal("0")
        if final_amount > Decimal("0"):
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "receivable", final_amount,
                f"退供应商应收 - {order.order_no}"
            )
    
    # transfer(调拨)不产生账款


async def create_account_balance(db: AsyncSession, order: BusinessOrder) -> None:
    """
    业务单完成时自动创建应收/应付账款
    
    根据订单类型分发到不同的处理函数：
    - loading: 装货单财务处理
    - unloading: 卸货单财务处理
    - 其他: 旧类型兼容处理
    """
    order_type = order.order_type
    
    if order_type == "loading":
        await create_account_for_loading(db, order)
    elif order_type == "unloading":
        await create_account_for_unloading(db, order)
    else:
        # 兼容旧类型
        await create_account_for_legacy(db, order)
