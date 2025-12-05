"""
业务单账款操作模块
- 自动生成应收/应付账款
- 货款、运费、冷藏费分别生成账单
"""

from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.v3.business_order import BusinessOrder
from app.models.v3.entity import Entity
from app.models.v3.account_balance import AccountBalance

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

async def create_account_balance(
    db: AsyncSession,
    order: BusinessOrder) -> None:
    """
    业务单完成时自动创建应收/应付账款
    
    **重要改进：货款、运费、冷藏费分别生成账单**
    
    规则：
    - 销售完成 → 应收账款（客户欠我们钱）
    - 采购完成 → 应付账款（我们欠供应商钱）
    - 客户退货完成 → 应付账款（我们要退钱给客户）
    - 退供应商完成 → 应收账款（供应商要退钱给我们）
    - 调拨不产生账款（内部转移）
    
    账单拆分：
    - 货款账单 → 关联供应商/客户
    - 运费账单 → 关联物流公司（我方支付，应付账款）
    - 冷藏费账单 → 关联仓库/冷库（我方支付，应付账款）
    
    **运费逻辑**：
    - 运费总是由我方支付给物流公司（应付）
    - 如果运费由对方自负，则不在账单中录入运费
    - 必须选择物流公司才会生成运费账单
    
    **冷藏费逻辑**：
    - 冷藏费是冷库开给我们的账单，我们应付给冷库
    - 采购时冷库是目标方（target_id）
    - 销售时冷库是来源方（source_id）
    
    注意：退货单独立创建账款记录，不自动抵扣原订单。
    抵扣/核销操作由用户在收付款时手动进行。
    """
    order_type = order.order_type
    
    # 计算货款、运费和冷藏费
    goods_amount = order.total_amount or Decimal("0")  # 商品金额
    shipping_amount = order.total_shipping or Decimal("0")  # 运费
    storage_fee = order.total_storage_fee or Decimal("0")  # 冷藏费
    
    if goods_amount <= Decimal("0") and shipping_amount <= Decimal("0") and storage_fee <= Decimal("0"):
        return
    
    # 获取物流公司ID（从第一个订单项）
    logistics_company_id = None
    if order.items:
        for item in order.items:
            if item.logistics_company_id:
                logistics_company_id = item.logistics_company_id
                break
    
    # 根据订单类型创建账款
    if order_type == "sale":
        # 销售 → 应收账款，实体是客户（目标方）
        # 货款：客户欠我们
        await _create_single_account(
            db, order.target_id, order.id, order.order_no,
            "receivable", goods_amount,
            f"销售货款 - 业务单 {order.order_no}"
        )
        # 运费：如果有物流公司，我们应付给物流公司
        if shipping_amount > Decimal("0") and logistics_company_id:
            await _create_single_account(
                db, logistics_company_id, order.id, order.order_no,
                "payable", shipping_amount,
                f"销售运费应付 - 业务单 {order.order_no}"
            )
        # 冷藏费：应付给仓库（来源方，即出货的冷库）
        if storage_fee > Decimal("0"):
            await _create_single_account(
                db, order.source_id, order.id, order.order_no,
                "payable", storage_fee,
                f"冷藏费应付 - 业务单 {order.order_no}"
            )
                
    elif order_type == "purchase":
        # 采购 → 应付账款，实体是供应商（来源方）
        # 货款：我们欠供应商
        await _create_single_account(
            db, order.source_id, order.id, order.order_no,
            "payable", goods_amount,
            f"采购货款 - 业务单 {order.order_no}"
        )
        # 运费：如果有物流公司，我们应付给物流公司
        if shipping_amount > Decimal("0") and logistics_company_id:
            await _create_single_account(
                db, logistics_company_id, order.id, order.order_no,
                "payable", shipping_amount,
                f"采购运费应付 - 业务单 {order.order_no}"
            )
        # 冷藏费：应付给仓库（目标方，即入库的冷库）
        if storage_fee > Decimal("0"):
            await _create_single_account(
                db, order.target_id, order.id, order.order_no,
                "payable", storage_fee,
                f"冷藏费应付 - 业务单 {order.order_no}"
            )
            
    elif order_type == "return_in":
        # 客户退货 → 应付账款（我们要退钱给客户）
        final_amount = order.final_amount or Decimal("0")
        await _create_single_account(
            db, order.source_id, order.id, order.order_no,
            "payable", final_amount,
            f"客户退货应退 - 业务单 {order.order_no}"
        )
        
    elif order_type == "return_out":
        # 退供应商 → 应收账款（供应商要退钱给我们）
        final_amount = order.final_amount or Decimal("0")
        await _create_single_account(
            db, order.target_id, order.id, order.order_no,
            "receivable", final_amount,
            f"退供应商应收 - 业务单 {order.order_no}"
        )
