"""
定时任务调度器服务
使用 APScheduler 实现自动备份等定时任务
"""

import os
import shutil
import logging
from datetime import datetime
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings

logger = logging.getLogger(__name__)

# 全局调度器实例
scheduler: Optional[AsyncIOScheduler] = None


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
    return "./finance_system.db"


def auto_backup():
    """执行自动备份任务"""
    try:
        db_path = get_db_path()
        backup_dir = get_backup_dir()
        
        # 检查数据库文件是否存在
        if not os.path.exists(db_path):
            logger.warning(f"数据库文件不存在: {db_path}")
            return
        
        # 生成备份文件名（带 auto_ 前缀标识自动备份）
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"auto_backup_{timestamp}.db"
        backup_path = os.path.join(backup_dir, backup_filename)
        
        # 复制数据库文件
        shutil.copy2(db_path, backup_path)
        
        stat = os.stat(backup_path)
        size_mb = stat.st_size / 1024 / 1024
        
        logger.info(f"✅ 自动备份完成: {backup_filename} ({size_mb:.2f} MB)")
        
        # 清理旧的自动备份（保留最近 N 个）
        cleanup_old_backups(backup_dir, keep_count=settings.AUTO_BACKUP_KEEP_COUNT)
        
    except Exception as e:
        logger.error(f"❌ 自动备份失败: {str(e)}")


def cleanup_old_backups(backup_dir: str, keep_count: int = 7):
    """清理旧的自动备份，只保留最近的 N 个"""
    try:
        # 获取所有自动备份文件
        auto_backups = []
        for filename in os.listdir(backup_dir):
            if filename.startswith("auto_backup_") and filename.endswith(".db"):
                filepath = os.path.join(backup_dir, filename)
                stat = os.stat(filepath)
                auto_backups.append({
                    "filename": filename,
                    "filepath": filepath,
                    "mtime": stat.st_mtime
                })
        
        # 按修改时间排序（最新的在前）
        auto_backups.sort(key=lambda x: x["mtime"], reverse=True)
        
        # 删除超出保留数量的备份
        if len(auto_backups) > keep_count:
            for backup in auto_backups[keep_count:]:
                os.remove(backup["filepath"])
                logger.info(f"🗑️ 清理旧备份: {backup['filename']}")
                
    except Exception as e:
        logger.warning(f"清理旧备份时出错: {str(e)}")


def init_scheduler():
    """初始化并启动调度器"""
    global scheduler
    
    if not settings.AUTO_BACKUP_ENABLED:
        logger.info("📦 自动备份已禁用")
        return
    
    scheduler = AsyncIOScheduler()
    
    # 添加自动备份任务
    # 默认每天凌晨 3 点执行
    scheduler.add_job(
        auto_backup,
        trigger=CronTrigger(
            hour=settings.AUTO_BACKUP_HOUR,
            minute=settings.AUTO_BACKUP_MINUTE
        ),
        id="auto_backup",
        name="自动数据库备份",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info(f"⏰ 定时任务调度器已启动 - 自动备份时间: 每天 {settings.AUTO_BACKUP_HOUR:02d}:{settings.AUTO_BACKUP_MINUTE:02d}")


def shutdown_scheduler():
    """关闭调度器"""
    global scheduler
    if scheduler:
        scheduler.shutdown()
        logger.info("⏰ 定时任务调度器已关闭")


def get_scheduler_status() -> dict:
    """获取调度器状态"""
    global scheduler
    if not scheduler:
        return {
            "enabled": False,
            "running": False,
            "jobs": []
        }
    
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None
        })
    
    return {
        "enabled": settings.AUTO_BACKUP_ENABLED,
        "running": scheduler.running,
        "jobs": jobs
    }


def trigger_backup_now():
    """立即触发一次备份（手动触发）"""
    auto_backup()

