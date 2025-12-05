// Electron 预加载脚本
// 这里可以暴露一些安全的 API 给渲染进程

const { contextBridge } = require('electron');

// 暴露版本信息
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  version: '1.0.0'
});


