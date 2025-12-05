"""
一键清除演示数据脚本
保留管理员账户，清除所有业务数据
用户可以在熟悉系统后执行此脚本，开始正式使用
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.session import SessionLocal


async def clear_business_data():
    """清除所有业务数据，保留管理员账户"""
    print("=" * 60)
    print("🧹 财务系统 - 清除演示数据")
    print("=" * 60 + "\n")
    
    print("⚠️  警告：此操作将删除所有业务数据！")
    print("   包括：实体、商品、业务单、库存、账款等")
    print("   保留：管理员账户\n")
    
    confirm = input("确认清除所有演示数据？输入 'YES' 确认: ")
    if confirm != "YES":
        print("\n❌ 操作已取消")
        return
    
    print("\n🗑️  开始清除数据...\n")
    
    async with SessionLocal() as db:
        try:
            # 按照外键依赖顺序删除
            tables_to_clear = [
                ("v3_audit_logs", "审计日志"),
                ("v3_payment_records", "收付款记录"),
                ("v3_account_balances", "往来账款"),
                ("v3_stock_flows", "库存流水"),
                ("v3_stocks", "库存"),
                ("v3_order_flows", "订单流程"),
                ("v3_order_items", "订单明细"),
                ("v3_business_orders", "业务单"),
                ("v3_products", "商品"),
                ("v3_categories", "分类"),
                ("v3_units", "单位"),
                ("v3_composite_units", "复合单位"),
                ("v3_unit_groups", "单位组"),
                ("v3_specifications", "规格"),
                ("v3_entities", "实体"),
            ]
            
            for table, name in tables_to_clear:
                try:
                    result = await db.execute(text(f"DELETE FROM {table}"))
                    print(f"   ✓ 清除 {name}")
                except Exception as e:
                    print(f"   ⚠ 跳过 {name}: {e}")
            
            await db.commit()
            
            print("\n" + "=" * 60)
            print("✅ 演示数据已清除！")
            print("=" * 60)
            print("\n📝 系统已重置为空白状态")
            print("   管理员账户保留，可直接登录使用")
            print("\n💡 提示：")
            print("   1. 先创建供应商、客户、仓库（实体管理）")
            print("   2. 再创建商品分类和商品（商品管理）")
            print("   3. 然后可以开始创建业务单了")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ 清除失败: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(clear_business_data())

