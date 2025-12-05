"""
安全的认证代码清理脚本
只移除特定的import和Depends参数，不破坏代码结构
"""
import re
import os
from pathlib import Path

# 需要处理的文件
ENDPOINTS_DIR = Path("app/api/api_v3/endpoints")
ORDERS_DIR = ENDPOINTS_DIR / "orders"

# 需要移除的import行（精确匹配）
REMOVE_IMPORTS = [
    r"from app\.core\.deps import get_current_user,?\s*",
    r"from app\.core\.deps import.*get_current_user.*\n",
    r"from app\.core\.permission_deps import.*\n",
    r"from app\.models\.user import User\n",
]

# 需要替换的模式
REPLACEMENTS = [
    # 移除 current_user 参数（各种形式）
    (r",?\s*current_user:\s*User\s*=\s*Depends\([^)]+\),?", ""),
    # 修复参数顺序问题（如果 current_user 在中间）
    (r"\(\s*\*,\s*,", "(*, "),
    # 修复结尾逗号问题
    (r",\s*\)", ")"),
    (r"\(\s*\*,\s*\)", "(*)"),
    # current_user.id 替换为固定值
    (r"current_user\.id", "1"),
    (r"operator_id=current_user\.id", "operator_id=1"),
    (r"created_by=current_user\.id", "created_by=1"),
]

def clean_file(filepath: Path):
    """清理单个文件"""
    try:
        content = filepath.read_text(encoding='utf-8')
        original = content
        
        # 移除不需要的 import
        for pattern in REMOVE_IMPORTS:
            content = re.sub(pattern, '', content)
        
        # 修复 deps import（只保留 get_db）
        content = re.sub(
            r"from app\.core\.deps import\s+get_db\s*,?\s*\n?",
            "from app.core.deps import get_db\n",
            content
        )
        content = re.sub(
            r"from app\.core\.deps import\s*\n",
            "",
            content
        )
        
        # 应用替换
        for pattern, replacement in REPLACEMENTS:
            content = re.sub(pattern, replacement, content)
        
        # 清理空行过多
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        if content != original:
            filepath.write_text(content, encoding='utf-8')
            print(f"✓ 已清理: {filepath}")
            return True
        else:
            print(f"- 无需修改: {filepath}")
            return False
    except Exception as e:
        print(f"✗ 错误 {filepath}: {e}")
        return False

def main():
    """主函数"""
    print("开始清理认证代码...")
    
    # 收集需要处理的文件
    files = []
    
    # endpoints 目录
    for f in ENDPOINTS_DIR.glob("*.py"):
        if f.name not in ["__init__.py", "entities.py", "products.py"]:  # 已处理的跳过
            files.append(f)
    
    # orders 子目录
    for f in ORDERS_DIR.glob("*.py"):
        if f.name != "__init__.py":
            files.append(f)
    
    print(f"找到 {len(files)} 个文件需要处理")
    
    modified = 0
    for f in files:
        if clean_file(f):
            modified += 1
    
    print(f"\n完成！修改了 {modified} 个文件")

if __name__ == "__main__":
    main()

