"""确保所有文件有正确的 get_db 导入"""
import re
from pathlib import Path

def ensure_import(filepath: Path):
    content = filepath.read_text(encoding='utf-8')
    
    # 如果文件使用了 get_db 但没有导入
    if 'Depends(get_db)' in content and 'from app.core.deps import get_db' not in content:
        # 在 from sqlalchemy 后面添加导入
        if 'from sqlalchemy' in content:
            content = re.sub(
                r'(from sqlalchemy[^\n]+\n)',
                r'\1\nfrom app.core.deps import get_db\n',
                content,
                count=1
            )
        elif 'from fastapi' in content:
            content = re.sub(
                r'(from fastapi[^\n]+\n)',
                r'\1from app.core.deps import get_db\n',
                content,
                count=1
            )
        
        filepath.write_text(content, encoding='utf-8')
        print(f"✓ 添加导入: {filepath}")
        return True
    return False

def main():
    endpoints = Path("app/api/api_v3/endpoints")
    
    for f in endpoints.rglob("*.py"):
        if f.name != "__init__.py":
            ensure_import(f)
    
    print("完成!")

if __name__ == "__main__":
    main()

