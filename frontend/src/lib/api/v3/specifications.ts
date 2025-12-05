/**
 * 规格模板 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface Specification {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export const specificationsApi = {
  list: async (params?: { 
    page?: number; 
    limit?: number; 
    category_id?: number;
    is_active?: boolean;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.category_id !== undefined) query.set('category_id', params.category_id.toString());
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    if (params?.search) query.set('search', params.search);
    
    const res = await fetch(`${API_BASE}/specifications/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<Specification>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/specifications/${id}`, { headers: getAuthHeaders() });
    return handleResponse<Specification>(res);
  },
  
  create: async (data: { name: string; category_id?: number; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/specifications/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Specification>(res);
  },
  
  update: async (id: number, data: Partial<Specification>) => {
    const res = await fetch(`${API_BASE}/specifications/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Specification>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/specifications/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

