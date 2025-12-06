/**
 * V3 API 客户端基础模块
 * 提供通用的请求方法和类型
 */

// 从环境变量获取 API 地址，默认本地开发
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v3';

export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: '请求失败' }));
    // 处理 Pydantic 验证错误格式
    if (Array.isArray(error.detail)) {
      const msg = error.detail.map((e: any) => e.msg || e).join(', ');
      throw new Error(msg || '请求失败');
    }
    throw new Error(error.detail || JSON.stringify(error) || '请求失败');
  }
  return res.json();
}

// 通用分页响应类型
export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

