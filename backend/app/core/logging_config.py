"""
日志配置
统一的日志格式和输出
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

# 日志目录
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# 日志格式
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class ColoredFormatter(logging.Formatter):
    """彩色日志格式（控制台用）"""
    
    COLORS = {
        'DEBUG': '\033[36m',     # 青色
        'INFO': '\033[32m',      # 绿色
        'WARNING': '\033[33m',   # 黄色
        'ERROR': '\033[31m',     # 红色
        'CRITICAL': '\033[35m',  # 紫色
    }
    RESET = '\033[0m'

    def format(self, record):
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(log_level: str = "INFO"):
    """
    配置日志系统
    
    Args:
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # 获取根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    
    # 清除已有的处理器
    root_logger.handlers.clear()
    
    # 控制台处理器（彩色输出）
    # Windows 下强制使用 UTF-8 编码避免 emoji 输出错误
    import io
    console_stream = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    console_handler = logging.StreamHandler(console_stream)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(ColoredFormatter(LOG_FORMAT, DATE_FORMAT))
    root_logger.addHandler(console_handler)
    
    # 文件处理器（按日期分割）
    today = datetime.now().strftime("%Y-%m-%d")
    file_handler = logging.FileHandler(
        LOG_DIR / f"app_{today}.log",
        encoding="utf-8"
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    root_logger.addHandler(file_handler)
    
    # 错误日志单独记录
    error_handler = logging.FileHandler(
        LOG_DIR / f"error_{today}.log",
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    root_logger.addHandler(error_handler)
    
    # 降低第三方库日志级别
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    
    logging.info("[OK] 日志系统初始化完成")


def get_logger(name: str) -> logging.Logger:
    """
    获取命名日志器
    
    Usage:
        logger = get_logger(__name__)
        logger.info("Hello")
    """
    return logging.getLogger(name)

