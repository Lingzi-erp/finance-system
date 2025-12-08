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

// 增加网络超时时间（GitHub 在国内访问可能较慢）
process.env.ELECTRON_BUILDER_HTTP_TIMEOUT = '60000'; // 60秒超时

// 下载进度窗口
let progressWindow = null;

// 创建下载进度窗口
function createProgressWindow() {
  if (progressWindow) {
    progressWindow.focus();
    return;
  }
  
  progressWindow = new BrowserWindow({
    width: 400,
    height: 150,
    parent: mainWindow,
    modal: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  progressWindow.loadFile(path.join(__dirname, 'progress.html'));
  
  progressWindow.on('closed', () => {
    progressWindow = null;
  });
}

// 更新进度窗口
function updateProgress(percent, transferred, total, speed) {
  if (progressWindow && !progressWindow.isDestroyed()) {
    progressWindow.webContents.executeJavaScript(`
      document.getElementById('progress').style.width = '${percent.toFixed(1)}%';
      document.getElementById('status').textContent = '已下载 ${percent.toFixed(1)}%';
      document.getElementById('speed').textContent = '${speed} - ${transferred} / ${total}';
    `);
  }
}

// 关闭进度窗口
function closeProgressWindow() {
  if (progressWindow && !progressWindow.isDestroyed()) {
    progressWindow.close();
    progressWindow = null;
  }
}

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
        createProgressWindow();
        autoUpdater.downloadUpdate();
      }
    });
  });

  // 没有可用更新
  autoUpdater.on('update-not-available', (info) => {
    console.log('当前已是最新版本');
    // 发送给渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available');
    }
  });

  // 更新下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    const speed = formatBytes(progressObj.bytesPerSecond) + '/s';
    const transferred = formatBytes(progressObj.transferred);
    const total = formatBytes(progressObj.total);
    
    console.log(`下载进度: ${progressObj.percent.toFixed(1)}% - ${speed}`);
    
    // 更新进度窗口
    updateProgress(progressObj.percent, transferred, total, speed);
    
    // 任务栏进度条
    if (mainWindow) {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  // 更新下载完成
  autoUpdater.on('update-downloaded', (info) => {
    closeProgressWindow();
    
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
        // 先清理子进程，再安装更新
        console.log('准备安装更新，先清理子进程...');
        cleanup();
        // 等待进程清理完成
        setTimeout(() => {
          autoUpdater.quitAndInstall();
        }, 1000);
      }
    });
  });

  // 更新错误
  autoUpdater.on('error', (err) => {
    console.error('更新失败:', err);
    closeProgressWindow();
    
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
    }
    
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '更新失败',
      message: '下载更新时发生错误',
      detail: err.message || '请检查网络连接后重试',
      buttons: ['确定']
    });
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

// 检查更新（带重试机制）
function checkForUpdates(isManual = false, retryCount = 0) {
  const MAX_RETRIES = 2;
  
  if (!isDev) {
    console.log(`检查更新... ${retryCount > 0 ? `(重试 ${retryCount}/${MAX_RETRIES})` : ''}`);
    autoUpdater.checkForUpdates().then(result => {
      // 如果是手动检查且没有更新，显示提示
      if (isManual && !result.updateInfo) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '检查更新',
          message: '当前已是最新版本',
          detail: `当前版本: v${app.getVersion()}`,
          buttons: ['确定']
        });
      }
    }).catch(err => {
      console.error('检查更新失败:', err.message);
      // 如果是超时错误且还有重试次数，自动重试
      if (retryCount < MAX_RETRIES && (err.message.includes('TIMED_OUT') || err.message.includes('ETIMEDOUT') || err.message.includes('network'))) {
        console.log(`网络超时，${3}秒后重试...`);
        setTimeout(() => {
          checkForUpdates(isManual, retryCount + 1);
        }, 3000);
      } else if (isManual) {
        // 手动检查时显示错误
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: '检查更新失败',
          message: '无法连接到更新服务器',
          detail: '请检查网络连接后重试。\n\n提示：GitHub 服务器在国内访问可能不稳定，建议稍后再试。',
          buttons: ['确定']
        });
      }
    }).catch(err => {
      console.log('检查更新失败:', err.message);
      if (isManual) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '检查更新失败',
          message: '无法连接到更新服务器',
          detail: err.message,
          buttons: ['确定']
        });
      }
    });
  }
}

// IPC 事件处理 - 手动检查更新
ipcMain.on('check-for-updates', () => {
  checkForUpdates(true);
});

// IPC 事件处理 - 安装更新
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
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
  return new Promise(async (resolve, reject) => {
    const dataDir = ensureDataDir();
    const dbPath = path.join(dataDir, 'finance_system.db');
    
    console.log('Data directory:', dataDir);
    console.log('Database path:', dbPath);
    
    // 【关键】启动前再次确认端口是空闲的
    const portInUse = await checkPort(8000);
    if (portInUse) {
      console.log('端口 8000 仍被占用，尝试强制清理...');
      killPortProcess(8000);
      await new Promise(r => setTimeout(r, 1500));
      
      const stillInUse = await checkPort(8000);
      if (stillInUse) {
        reject(new Error('端口 8000 被占用且无法释放，请手动关闭占用程序'));
        return;
      }
    }
    
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
    
    // 监听进程退出（可能是启动失败）
    let processExited = false;
    backendProcess.on('exit', (code) => {
      if (!processExited) {
        processExited = true;
        if (code !== 0 && code !== null) {
          console.error(`Backend process exited with code ${code}`);
        }
      }
    });

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
      // 【关键】确认是我们启动的进程在响应，而不是残留进程
      if (success && backendProcess && !processExited) {
        console.log('Backend started successfully, PID:', backendProcess.pid);
        resolve();
      } else if (processExited) {
        reject(new Error('Backend process exited unexpectedly'));
      } else {
        reject(new Error('Backend failed to start within timeout'));
      }
    });
  });
}

// 启动前端服务
function startFrontend() {
  return new Promise(async (resolve, reject) => {
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
      // 【关键】启动前再次确认端口是空闲的
      const portInUse = await checkPort(3000);
      if (portInUse) {
        console.log('端口 3000 仍被占用，尝试强制清理...');
        killPortProcess(3000);
        await new Promise(r => setTimeout(r, 1500));
        
        const stillInUse = await checkPort(3000);
        if (stillInUse) {
          reject(new Error('端口 3000 被占用且无法释放，请手动关闭占用程序'));
          return;
        }
      }
      
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
      
      // 监听进程退出（可能是启动失败）
      let processExited = false;
      frontendProcess.on('exit', (code) => {
        if (!processExited) {
          processExited = true;
          if (code !== 0 && code !== null) {
            console.error(`Frontend process exited with code ${code}`);
          }
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
        // 【关键】确认是我们启动的进程在响应
        if (success && frontendProcess && !processExited) {
          console.log('Frontend started successfully, PID:', frontendProcess.pid);
          resolve();
        } else if (processExited) {
          reject(new Error('Frontend process exited unexpectedly'));
        } else {
          reject(new Error('Frontend failed to start within timeout'));
        }
      });
    }
  });
}

// 清理进程 - 双保险：按PID和按端口都清理
function cleanup() {
  console.log('Cleaning up processes...');
  
  if (process.platform === 'win32') {
    // 方式1: 按进程引用清理（如果有）
    if (backendProcess && backendProcess.pid) {
      try {
        require('child_process').execSync(`taskkill /F /PID ${backendProcess.pid} /T`, { stdio: 'ignore' });
        console.log(`已终止后端进程 PID: ${backendProcess.pid}`);
      } catch (e) {}
    }
    if (frontendProcess && frontendProcess.pid) {
      try {
        require('child_process').execSync(`taskkill /F /PID ${frontendProcess.pid} /T`, { stdio: 'ignore' });
        console.log(`已终止前端进程 PID: ${frontendProcess.pid}`);
      } catch (e) {}
    }
    
    // 方式2: 按进程名清理（兜底）
    try {
      require('child_process').execSync('taskkill /F /IM "backend.exe" /T', { stdio: 'ignore' });
    } catch (e) {}
    
    // 方式3: 按端口清理（双保险）
    try {
      require('child_process').execSync(
        'powershell -Command "Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore' }
      );
    } catch (e) {}
    try {
      require('child_process').execSync(
        'powershell -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore' }
      );
    } catch (e) {}
    
    console.log('进程清理完成');
  } else {
    // 非 Windows
    if (backendProcess) {
      try {
        backendProcess.kill('SIGTERM');
      } catch (e) {
        console.error('Error killing backend:', e);
      }
    }
    if (frontendProcess) {
      try {
        frontendProcess.kill('SIGTERM');
      } catch (e) {
        console.error('Error killing frontend:', e);
      }
    }
  }
  
  backendProcess = null;
  frontendProcess = null;
}

// 启动前的强制清理（确保端口可用）
function forceCleanupBeforeStart() {
  console.log('启动前强制清理残留进程...');
  
  if (process.platform === 'win32') {
    // 清理所有可能占用端口的进程
    try {
      // 清理 backend.exe
      require('child_process').execSync('taskkill /F /IM "backend.exe" /T', { stdio: 'ignore' });
    } catch (e) {}
    
    // 清理占用 8000 端口的进程
    try {
      require('child_process').execSync(
        'powershell -Command "Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore' }
      );
    } catch (e) {}
    
    // 清理占用 3000 端口的进程
    try {
      require('child_process').execSync(
        'powershell -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore' }
      );
    } catch (e) {}
  }
  
  console.log('启动前清理完成');
}

// 检查端口是否被占用
function checkPort(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    let resolved = false;
    
    // 超时处理 - 3秒内没有响应则认为端口可用
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { server.close(); } catch (e) {}
        console.log(`端口 ${port} 检测超时，假定可用`);
        resolve(false);
      }
    }, 3000);
    
    server.once('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (err.code === 'EADDRINUSE') {
          console.log(`端口 ${port} 被占用 (EADDRINUSE)`);
          resolve(true); // 端口被占用
        } else {
          console.log(`端口 ${port} 检测错误: ${err.code}，假定可用`);
          resolve(false);
        }
      }
    });
    
    server.once('listening', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        server.close();
        console.log(`端口 ${port} 可用`);
        resolve(false); // 端口可用
      }
    });
    
    try {
      server.listen(port, '127.0.0.1');
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`端口 ${port} listen调用失败: ${err.message}，假定可用`);
        resolve(false);
      }
    }
  });
}

// 获取占用端口的进程信息
function getPortProcess(port) {
  try {
    // 使用 PowerShell 更精确地获取本地端口监听信息
    const result = require('child_process').execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }
    );
    const pid = parseInt(result.trim());
    if (pid && !isNaN(pid)) {
      try {
        const taskInfo = require('child_process').execSync(
          `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 }
        );
        const match = taskInfo.match(/"([^"]+)"/);
        return { pid: pid, name: match ? match[1] : 'unknown' };
      } catch (e) {
        return { pid: pid, name: 'unknown' };
      }
    }
  } catch (e) {
    // PowerShell 方法失败，使用备用方案
    try {
      const result = require('child_process').execSync(
        `netstat -ano | findstr "LISTENING" | findstr "127.0.0.1:${port} 0.0.0.0:${port}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }
      );
      const lines = result.trim().split('\n');
      if (lines.length > 0 && lines[0].trim()) {
        const parts = lines[0].trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(parseInt(pid))) {
          return { pid: parseInt(pid), name: 'unknown' };
        }
      }
    } catch (e2) {
      // 没有找到占用进程
    }
  }
  return null;
}

// 强制终止占用端口的进程
function killPortProcess(port) {
  try {
    // 使用 PowerShell 获取并终止进程（更可靠）
    require('child_process').execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    // 备用方案：使用 netstat + taskkill
    try {
      require('child_process').execSync(
        `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') DO taskkill /F /PID %P`,
        { shell: 'cmd.exe', stdio: 'ignore' }
      );
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// 清理占用端口的旧进程
async function cleanupOldProcesses() {
  console.log('检查端口占用情况...');
  
  // 启动时先强制清理一遍（双保险第一层）
  forceCleanupBeforeStart();
  await new Promise(resolve => setTimeout(resolve, 500)); // 缩短等待时间
  
  const ports = [8000, 3000];
  const maxRetries = 2; // 减少重试次数，因为现在检测更准确了
  
  for (let retry = 0; retry < maxRetries; retry++) {
    const portStatus = {};
    let allClear = true;
    
    for (const port of ports) {
      const inUse = await checkPort(port);
      if (inUse) {
        const proc = getPortProcess(port);
        // 【关键修复】如果 checkPort 认为被占用，但找不到占用进程，可能是误判
        if (!proc) {
          console.log(`端口 ${port} checkPort返回被占用，但找不到占用进程，可能是误判，继续尝试...`);
          // 不标记为占用，继续检查下一个端口
          continue;
        }
        portStatus[port] = proc;
        allClear = false;
        console.log(`端口 ${port} 被占用: ${proc.name} (PID: ${proc.pid})`);
      }
    }
    
    if (allClear || Object.keys(portStatus).length === 0) {
      console.log('所有端口可用');
      return true;
    }
    
    // 第一次自动尝试清理
    if (retry < maxRetries - 1) {
      console.log(`尝试自动清理端口 (第 ${retry + 1} 次)...`);
      
      // 先尝试杀死已知的进程名
      try {
        require('child_process').execSync('taskkill /F /IM "backend.exe" /T', { stdio: 'ignore', timeout: 5000 });
      } catch (e) {}
      
      // 针对每个被占用的端口进行清理
      for (const port of Object.keys(portStatus)) {
        killPortProcess(parseInt(port));
      }
      
      // 等待进程退出
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    
    // 最后一次仍然失败，询问用户
    const occupiedPorts = Object.entries(portStatus)
      .map(([port, proc]) => `端口 ${port}: ${proc ? `${proc.name} (PID: ${proc.pid})` : '未知进程'}`)
      .join('\n');
    
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: '端口被占用',
      message: '以下端口被其他程序占用：',
      detail: `${occupiedPorts}\n\n可能原因：\n1. 上次程序没有正常关闭\n2. 其他程序正在使用这些端口\n\n点击"强制清理"再次尝试，或"退出"手动处理。`,
      buttons: ['强制清理', '退出'],
      defaultId: 0,
      cancelId: 1
    });
    
    if (result.response === 0) {
      // 用户选择强制清理
      for (const port of Object.keys(portStatus)) {
        killPortProcess(parseInt(port));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 最终检查
      let finalCheck = true;
      for (const port of ports) {
        if (await checkPort(port)) {
          finalCheck = false;
          console.log(`端口 ${port} 仍然被占用`);
        }
      }
      
      if (!finalCheck) {
        await dialog.showMessageBox({
          type: 'error',
          title: '端口清理失败',
          message: '无法释放被占用的端口',
          detail: '请手动关闭占用端口的程序后重试，或重启电脑。',
          buttons: ['确定']
        });
        return false;
      }
      return true;
    } else {
      return false; // 用户选择退出
    }
  }
  
  console.log('端口检查完成');
  return true;
}

// 应用启动
app.whenReady().then(async () => {
  console.log('App is ready, starting...');
  console.log('Is development:', isDev);
  console.log('Resources path:', isDev ? 'N/A' : process.resourcesPath);
  
  createSplashWindow();
  
  // 先检查并清理端口
  const canStart = await cleanupOldProcesses();
  if (!canStart) {
    if (splashWindow) splashWindow.close();
    app.quit();
    return;
  }
  
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
