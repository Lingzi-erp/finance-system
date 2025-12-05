/**
 * 数据备份 API
 */

import { API_BASE, getAuthHeaders, handleResponse } from './client';

export interface BackupInfo {
  filename: string;
  size: number;
  size_display: string;
  created_at: string;
}

export const backupApi = {
  list: async () => {
    const res = await fetch(`${API_BASE}/backup/`, { headers: getAuthHeaders() });
    return handleResponse<{ backups: BackupInfo[]; backup_dir: string }>(res);
  },
  
  create: async () => {
    const res = await fetch(`${API_BASE}/backup/create`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string; backup: BackupInfo }>(res);
  },
  
  download: async (filename: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('未登录');
    }
    
    try {
      // URL编码文件名，确保特殊字符正确处理
      const encodedFilename = encodeURIComponent(filename);
      const res = await fetch(`${API_BASE}/backup/download/${encodedFilename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        // 尝试解析错误响应
        let errorMessage = '下载失败';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // 如果不是JSON响应，使用状态文本
          errorMessage = res.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // 获取文件名（从Content-Disposition header或使用默认值）
      const contentDisposition = res.headers.get('content-disposition');
      let downloadFilename = filename;
      if (contentDisposition) {
        // 尝试匹配 filename="..." 或 filename*=UTF-8''...
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1].replace(/['"]/g, '');
          // 处理URL编码的文件名
          try {
            downloadFilename = decodeURIComponent(downloadFilename);
          } catch {
            // 如果解码失败，使用原始值
          }
        }
      }
      
      // 创建blob并下载
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      // 延迟清理，确保下载开始
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (err: any) {
      throw new Error(err.message || '下载失败');
    }
  },
  
  delete: async (filename: string) => {
    const res = await fetch(`${API_BASE}/backup/${filename}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  },
  
  restore: async (filename: string) => {
    const res = await fetch(`${API_BASE}/backup/restore/${filename}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string; pre_restore_backup: string }>(res);
  }
};

