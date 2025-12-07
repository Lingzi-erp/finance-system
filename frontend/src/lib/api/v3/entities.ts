/**
 * 实体管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface Entity {
  id: number;
  name: string;
  code: string;
  entity_type: string;
  type_display: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  credit_level: number;
  credit_limit?: number;
  current_balance?: number;
  notes?: string;
  is_active: boolean;
  is_system?: boolean;  // 是否为系统内置实体
  created_by: number;
  created_at: string;
  updated_at: string;
  order_count?: number;
  total_amount?: number;
  receivable_balance?: number;
  payable_balance?: number;
}

export const ENTITY_TYPE_MAP: Record<string, { label: string; icon: string }> = {
  warehouse: { label: '仓库', icon: '🏭' },
  supplier: { label: '供应商', icon: '🏢' },
  customer: { label: '客户', icon: '👤' }
};

export const entitiesApi = {
  list: async (params?: { page?: number; limit?: number; entity_type?: string; search?: string; is_active?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.entity_type) query.set('entity_type', params.entity_type);
    if (params?.search) query.set('search', params.search);
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    
    const res = await fetch(`${API_BASE}/entities/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<Entity>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/entities/${id}`, { headers: getAuthHeaders() });
    return handleResponse<Entity>(res);
  },
  
  create: async (data: Partial<Entity>) => {
    const res = await fetch(`${API_BASE}/entities/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Entity>(res);
  },
  
  update: async (id: number, data: Partial<Entity>) => {
    const res = await fetch(`${API_BASE}/entities/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Entity>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/entities/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

