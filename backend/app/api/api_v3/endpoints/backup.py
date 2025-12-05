"""数据备份API - 单机版（无权限检查）"""

import os
import shutil
from datetime import datetime
from typing import Any, List
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.scheduler import get_scheduler_status, trigger_backup_now
from app.db.session import reload_database_engine

router = APIRouter()

def get_backup_dir() -> str:
    """获取备份目录"""
    db_url = settings.SQLITE_DATABASE_URI
    if db_url.startswith("sqlite:///"):
        db_path = db_url.replace("sqlite:///", "")
    elif db_url.startswith("sqlite+aiosqlite:///"):
        db_path = db_url.replace("sqlite+aiosqlite:///", "")
    else:
        db_path = "./finance_system.db"
    backup_dir = os.path.join(os.path.dirname(os.path.abspath(db_path)), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir

def get_db_path() -> str:
    """获取数据库文件路径"""
    db_url = settings.SQLITE_DATABASE_URI
    if db_url.startswith("sqlite:///"):
        return db_url.replace("sqlite:///", "")
    elif db_url.startswith("sqlite+aiosqlite:///"):
        return db_url.replace("sqlite+aiosqlite:///", "")
    raise HTTPException(status_code=400, detail="仅支持 SQLite 数据库备份")

@router.get("/")
async def list_backups() -> Any:
    """获取备份列表"""
    backup_dir = get_backup_dir()
    backups = []
    
    if os.path.exists(backup_dir):
        for filename in os.listdir(backup_dir):
            if filename.endswith(".db"):
                filepath = os.path.join(backup_dir, filename)
                stat = os.stat(filepath)
                backups.append({
                    "filename": filename,
                    "size": stat.st_size,
                    "size_display": f"{stat.st_size / 1024 / 1024:.2f} MB",
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
    
    # 按创建时间倒序
    backups.sort(key=lambda x: x["created_at"], reverse=True)
    
    return {
        "backups": backups,
        "backup_dir": os.path.abspath(backup_dir)
    }

@router.post("/create")
async def create_backup() -> Any:
    """创建备份"""
    try:
        db_path = get_db_path()
        backup_dir = get_backup_dir()
        
        # 生成备份文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"backup_{timestamp}.db"
        backup_path = os.path.join(backup_dir, backup_filename)
        
        # 复制数据库文件
        shutil.copy2(db_path, backup_path)
        
        stat = os.stat(backup_path)
        
        return {
            "message": "备份创建成功",
            "backup": {
                "filename": backup_filename,
                "size": stat.st_size,
                "size_display": f"{stat.st_size / 1024 / 1024:.2f} MB",
                "created_at": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"备份失败: {str(e)}")

@router.get("/download/{filename}")
async def download_backup(filename: str) -> Any:
    """下载备份文件"""
    # URL解码文件名
    decoded_filename = unquote(filename)
    
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, decoded_filename)
    
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="备份文件不存在")
    
    # 安全检查：确保文件在备份目录内，防止路径遍历攻击
    backup_dir_abs = os.path.abspath(backup_dir)
    backup_path_abs = os.path.abspath(backup_path)
    if not backup_path_abs.startswith(backup_dir_abs):
        raise HTTPException(status_code=403, detail="非法访问")
    
    return FileResponse(
        path=backup_path,
        filename=decoded_filename,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{decoded_filename}"'
        }
    )

@router.delete("/{filename}")
async def delete_backup(filename: str) -> Any:
    """删除备份文件"""
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, filename)
    
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="备份文件不存在")
    
    # 安全检查
    if not os.path.abspath(backup_path).startswith(os.path.abspath(backup_dir)):
        raise HTTPException(status_code=403, detail="非法访问")
    
    os.remove(backup_path)
    
    return {"message": "删除成功"}

@router.post("/restore/{filename}")
async def restore_backup(filename: str) -> Any:
    """恢复备份（危险操作）"""
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, filename)
    
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="备份文件不存在")
    
    # 安全检查
    if not os.path.abspath(backup_path).startswith(os.path.abspath(backup_dir)):
        raise HTTPException(status_code=403, detail="非法访问")
    
    try:
        db_path = get_db_path()
        
        # 先备份当前数据库
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pre_restore_backup = os.path.join(backup_dir, f"pre_restore_{timestamp}.db")
        shutil.copy2(db_path, pre_restore_backup)
        
        # 重新加载数据库引擎（关闭所有连接）
        await reload_database_engine()
        
        # 恢复备份
        shutil.copy2(backup_path, db_path)
        
        # 再次重新加载，确保使用新的数据库文件
        await reload_database_engine()
        
        return {
            "message": "恢复成功",
            "pre_restore_backup": f"pre_restore_{timestamp}.db"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复失败: {str(e)}")

@router.get("/scheduler/status")
async def get_backup_scheduler_status() -> Any:
    """获取自动备份调度器状态"""
    status = get_scheduler_status()
    return {
        "auto_backup": {
            "enabled": settings.AUTO_BACKUP_ENABLED,
            "schedule": f"每天 {settings.AUTO_BACKUP_HOUR:02d}:{settings.AUTO_BACKUP_MINUTE:02d}",
            "keep_count": settings.AUTO_BACKUP_KEEP_COUNT,
        },
        "scheduler": status
    }

@router.post("/trigger")
async def trigger_auto_backup() -> Any:
    """立即触发一次自动备份"""
    try:
        trigger_backup_now()
        return {"message": "备份任务已触发，请稍后查看备份列表"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"触发备份失败: {str(e)}")
