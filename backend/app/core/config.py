from typing import Any, Dict, List, Optional, Union
import logging

from pydantic import AnyHttpUrl, Field, validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    PROJECT_NAME: str = "财务报表系统"
    API_V1_STR: str = "/api"
    # 重要：生产环境必须通过 .env 文件或环境变量设置此值
    SECRET_KEY: str = Field(
        default="dev-only-secret-key-please-change-in-production",
        description="JWT密钥，生产环境必须修改"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天
    
    # CORS配置
    BACKEND_CORS_ORIGINS: List[Union[str, AnyHttpUrl]] = [
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ]

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # 数据库配置
    SQLITE_DATABASE_URI: str = "sqlite:///./finance_system.db"
    
    # 插件配置
    PLUGINS_DIR: str = "plugins"
    ENABLED_PLUGINS: List[str] = []
    
    # 自动备份配置
    AUTO_BACKUP_ENABLED: bool = True  # 是否启用自动备份
    AUTO_BACKUP_HOUR: int = 3  # 每天备份时间（小时，0-23）
    AUTO_BACKUP_MINUTE: int = 0  # 每天备份时间（分钟，0-59）
    AUTO_BACKUP_KEEP_COUNT: int = 7  # 保留最近多少个自动备份

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()
logger.info(f"加载配置: API_V1_STR={settings.API_V1_STR}, CORS={settings.BACKEND_CORS_ORIGINS}") 