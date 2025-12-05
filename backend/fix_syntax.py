"""修复缺失的逗号"""
import re
from pathlib import Path

def fix_file(filepath: Path):
    content = filepath.read_text(encoding='utf-8')
    original = content
    
    # 修复 Depends(get_db) 后面缺少逗号的问题
    # 模式: Depends(get_db)\n    xxx: 应该变成 Depends(get_db),\n    xxx:
    content = re.sub(
        r'Depends\(get_db\)\n(\s+)(\w+):',
        r'Depends(get_db),\n\1\2:',
        content
    )
    
    # 修复其他可能的问题：参数后面缺少逗号
    # Query(...)\n    xxx:
    content = re.sub(
        r'(Query\([^)]+\))\n(\s+)(\w+):',
        r'\1,\n\2\3:',
        content
    )
    
    if content != original:
        filepath.write_text(content, encoding='utf-8')
        print(f"✓ 修复: {filepath}")
        return True
    return False

def main():
    endpoints = Path("app/api/api_v3/endpoints")
    
    for f in endpoints.rglob("*.py"):
        if f.name != "__init__.py":
            fix_file(f)
    
    print("完成!")

if __name__ == "__main__":
    main()

