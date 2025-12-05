"""检查数据库状态"""
import asyncio
from sqlalchemy import select, text

# 确保先导入所有模型
from app.models import (
    User, Entity, Category, Specification, UnitGroup, Unit, CompositeUnit,
    Product, BusinessOrder, OrderItem, OrderFlow, Role, Stock, StockFlow
)
from app.db.session import SessionLocal

async def check():
    async with SessionLocal() as db:
        print("=== 检查数据库 ===")
        
        # 检查用户表
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"\n用户总数: {len(users)}")
        for u in users:
            print(f"  - {u.username} (ID:{u.id}, role:{u.role}, status:{u.status})")
        
        # 检查admin
        admin = await db.execute(select(User).where(User.username == "admin"))
        admin = admin.scalar_one_or_none()
        if admin:
            print(f"\nadmin用户存在，密码hash: {admin.password[:50]}...")
        else:
            print("\n警告: admin用户不存在！")

if __name__ == "__main__":
    asyncio.run(check())
