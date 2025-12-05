"""修复损坏的文件"""
import re
from pathlib import Path

def repair_file(filepath: Path):
    content = filepath.read_text(encoding='utf-8')
    original = content
    
    # 修复 get_db 独立成行的问题
    content = re.sub(r'\nget_db\n', '\nfrom app.core.deps import get_db\n', content)
    
    # 移除 require_permission 相关行
    content = re.sub(r'require_stock_view = require_permission\("stock\.view"\)\n', '', content)
    content = re.sub(r'require_stock_adjust = require_permission\("stock\.adjust"\)\n', '', content)
    content = re.sub(r'require_\w+ = require_permission\([^)]+\)\n', '', content)
    
    # 移除空的权限检查器注释块
    content = re.sub(r'# 权限检查器\n\n', '', content)
    
    if content != original:
        filepath.write_text(content, encoding='utf-8')
        print(f"✓ 修复: {filepath}")
        return True
    return False

def main():
    endpoints = Path("app/api/api_v3/endpoints")
    
    for f in endpoints.rglob("*.py"):
        if f.name != "__init__.py":
            repair_file(f)
    
    print("完成!")

if __name__ == "__main__":
    main()

