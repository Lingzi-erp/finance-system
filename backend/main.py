import uvicorn
import sys
import os

# 确保打包后能正确找到模块
if getattr(sys, 'frozen', False):
    # 运行在 PyInstaller 打包后的环境
    application_path = os.path.dirname(sys.executable)
    os.chdir(application_path)
else:
    # 运行在开发环境
    application_path = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    # 生产模式不使用 reload
    is_dev = not getattr(sys, 'frozen', False)
    
    uvicorn.run(
        "app.main:app", 
        host="127.0.0.1",  # 只监听本地
        port=8000, 
        reload=is_dev,
        log_level="info"
    ) 