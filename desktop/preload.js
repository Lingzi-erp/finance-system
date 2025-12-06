// Electron 预加载脚本
// 这里可以暴露一些安全的 API 给渲染进程

const { contextBridge, ipcRenderer } = require('electron');

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 基本信息
  platform: process.platform,
  isElectron: true,
  version: '1.1.8',
  
  // 检查更新
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  
  // 监听更新事件
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update-not-available', () => callback());
  },
  
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (event, error) => callback(error));
  },
  
  // 安装更新
  installUpdate: () => {
    ipcRenderer.send('install-update');
  }
});
