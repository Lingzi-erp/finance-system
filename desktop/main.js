const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn, fork } = require('child_process');
const http = require('http');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// 禁用硬件加速（解决某些显卡兼容性问题）
app.disableHardwareAcceleration();

// ==================== 自动更新配置 ====================
// 配置日志
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// 禁用自动下载，让用户确认
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// 更新事件处理
function setupAutoUpdater() {
  // 检查到有可用更新
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否立即下载更新？`,
      detail: `当前版本: ${app.getVersion()}\n新版本: ${info.version}`,
      buttons: ['立即下载', '稍后提醒'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  // 没有可用更新
  autoUpdater.on('update-not-available', (info) => {
    console.log('当前已是最新版本');
  });

  // 更新下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    let message = `下载速度: ${formatBytes(progressObj.bytesPerSecond)}/s`;
    message += ` - 已下载 ${progressObj.percent.toFixed(1)}%`;
    message += ` (${formatBytes(progressObj.transferred)} / ${formatBytes(progressObj.total)})`;
    console.log(message);
    
    // 可以通过 IPC 发送给渲染进程显示进度
    if (mainWindow) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  // 更新下载完成
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.setProgressBar(-1); // 清除进度条
    }
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已就绪',
      message: '新版本已下载完成，是否立即安装？',
      detail: '安装更新需要重启应用程序。',
      buttons: ['立即安装', '下次启动时安装'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // 更新错误
  autoUpdater.on('error', (err) => {
    console.error('更新检查失败:', err);
    // 不显示错误对话框，避免打扰用户
  });
}

// 格式化字节数
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 检查更新
function checkForUpdates() {
  if (!isDev) {
    console.log('检查更新...');
    autoUpdater.checkForUpdates().catch(err => {
      console.log('检查更新失败:', err.message);
    });
  }
}
// ==================== 自动更新配置结束 ====================

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
let frontendProcess = null;

// 判断是否是打包后的环境
const isDev = !app.isPackaged;

// 获取资源路径
function getResourcePath(relativePath) {
  if (isDev) {
    return path.join(__dirname, '..', relativePath);
  }
  return path.join(process.resourcesPath, relativePath);
}

// 获取用户数据目录（用于存放数据库等）
function getUserDataPath() {
  return app.getPath('userData');
}

// 确保数据库目录存在，并复制初始数据库（如果需要）
function ensureDataDir() {
  const dataDir = getUserDataPath();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // 检查数据库文件是否存在
  const dbPath = path.join(dataDir, 'finance_system.db');
  if (!fs.existsSync(dbPath)) {
    // 如果资源目录有初始数据库，复制过来
    const initDbPath = getResourcePath('backend/finance_system.db');
    if (fs.existsSync(initDbPath)) {
      fs.copyFileSync(initDbPath, dbPath);
      console.log('Copied initial database to user data directory');
    }
  }
  
  return dataDir;
}

// 创建启动画面
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    title: '财务管理系统',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 隐藏菜单栏
  Menu.setApplicationMenu(null);

  // 监听窗口关闭
  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanup();
  });

  return mainWindow;
}

// 检查服务是否就绪
function checkService(port, callback, maxRetries = 60) {
  let retries = 0;
  
  const check = () => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      callback(true);
    });

    req.on('error', () => {
      retries++;
      if (retries < maxRetries) {
        setTimeout(check, 500);
      } else {
        callback(false);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      retries++;
      if (retries < maxRetries) {
        setTimeout(check, 500);
      } else {
        callback(false);
      }
    });

    req.end();
  };

  check();
}

// 启动后端服务
function startBackend() {
  return new Promise((resolve, reject) => {
    const dataDir = ensureDataDir();
    const dbPath = path.join(dataDir, 'finance_system.db');
    
    console.log('Data directory:', dataDir);
    console.log('Database path:', dbPath);
    
    if (isDev) {
      // 开发模式：使用 Python 直接运行
      const backendPath = path.join(__dirname, '..', 'backend');
      console.log('Starting backend in dev mode from:', backendPath);
      
      backendProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
        cwd: backendPath,
        env: {
          ...process.env,
          SQLITE_DATABASE_URI: `sqlite:///${dbPath.replace(/\\/g, '/')}`
        },
        shell: true
      });
    } else {
      // 生产模式：运行打包后的后端
      const backendDir = getResourcePath('backend');
      const backendExe = path.join(backendDir, 'backend.exe');
      
      console.log('Starting backend from:', backendExe);
      
      if (!fs.existsSync(backendExe)) {
        reject(new Error(`Backend executable not found: ${backendExe}`));
        return;
      }
      
      backendProcess = spawn(backendExe, [], {
        cwd: backendDir,
        env: {
          ...process.env,
          SQLITE_DATABASE_URI: `sqlite:///${dbPath.replace(/\\/g, '/')}`
        },
        shell: true
      });
    }

    backendProcess.stdout?.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr?.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      reject(err);
    });

    // 检查后端是否启动成功
    console.log('Waiting for backend to start on port 8000...');
    checkService(8000, (success) => {
      if (success) {
        console.log('Backend started successfully');
        resolve();
      } else {
        reject(new Error('Backend failed to start within timeout'));
      }
    });
  });
}

// 启动前端服务
function startFrontend() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // 开发模式：检查前端是否已经在运行
      console.log('Checking if frontend is running in dev mode...');
      checkService(3000, (success) => {
        if (success) {
          console.log('Frontend already running');
          resolve();
        } else {
          reject(new Error('Frontend not running. Please start it manually with: npm run dev'));
        }
      }, 5);
    } else {
      // 生产模式：运行 Next.js standalone 服务器
      const frontendDir = getResourcePath('frontend');
      const serverJs = path.join(frontendDir, 'server.js');
      
      console.log('Starting frontend from:', serverJs);
      
      if (!fs.existsSync(serverJs)) {
        reject(new Error(`Frontend server not found: ${serverJs}`));
        return;
      }
      
      // 使用打包的 Node.js 运行 Next.js 服务器
      const nodeExePath = path.join(process.resourcesPath, 'node', 'node.exe');
      
      console.log('Using Node.js from:', nodeExePath);
      
      if (!fs.existsSync(nodeExePath)) {
        reject(new Error(`Node.js executable not found: ${nodeExePath}`));
        return;
      }
      
      frontendProcess = spawn(nodeExePath, [serverJs], {
        cwd: frontendDir,
        env: {
          ...process.env,
          PORT: '3000',
          HOSTNAME: '127.0.0.1'
        }
      });

      frontendProcess.stdout?.on('data', (data) => {
        console.log(`Frontend: ${data}`);
      });

      frontendProcess.stderr?.on('data', (data) => {
        console.log(`Frontend: ${data}`);
      });

      frontendProcess.on('error', (err) => {
        console.error('Failed to start frontend:', err);
        reject(err);
      });

      console.log('Waiting for frontend to start on port 3000...');
      checkService(3000, (success) => {
        if (success) {
          console.log('Frontend started successfully');
          resolve();
        } else {
          reject(new Error('Frontend failed to start within timeout'));
        }
      });
    }
  });
}

// 清理进程
function cleanup() {
  console.log('Cleaning up processes...');
  
  if (backendProcess) {
    try {
      // Windows 下需要杀死整个进程树
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t'], { shell: true });
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('Error killing backend:', e);
    }
    backendProcess = null;
  }
  
  if (frontendProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', frontendProcess.pid, '/f', '/t'], { shell: true });
      } else {
        frontendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.error('Error killing frontend:', e);
    }
    frontendProcess = null;
  }
}

// 应用启动
app.whenReady().then(async () => {
  console.log('App is ready, starting...');
  console.log('Is development:', isDev);
  console.log('Resources path:', isDev ? 'N/A' : process.resourcesPath);
  
  createSplashWindow();
  createMainWindow();

  try {
    // 启动后端
    await startBackend();
    
    // 启动前端
    await startFrontend();

    // 加载应用
    const frontendUrl = 'http://127.0.0.1:3000';
    console.log('Loading frontend URL:', frontendUrl);
    await mainWindow.loadURL(frontendUrl);

    // 关闭启动画面，显示主窗口
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    console.log('Application started successfully');

    // 设置自动更新并检查更新
    setupAutoUpdater();
    setTimeout(() => {
      checkForUpdates();
    }, 3000); // 延迟3秒检查，避免启动时卡顿

  } catch (error) {
    console.error('Startup error:', error);
    if (splashWindow) {
      splashWindow.close();
    }
    
    dialog.showErrorBox('启动失败', 
      `系统启动失败: ${error.message}\n\n` +
      `请检查：\n` +
      `1. 是否有其他程序占用了 8000 或 3000 端口\n` +
      `2. 系统是否已安装 Node.js\n\n` +
      `如需帮助，请联系技术支持。`
    );
    cleanup();
    app.quit();
  }
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

// 应用退出前清理
app.on('before-quit', () => {
  cleanup();
});

// macOS 激活应用
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
