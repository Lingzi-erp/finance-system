/**
 * 商品分类 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface Category {
  id: number;
  name: string;
  code: string;
  parent_id: number | null;
  parent_name: string | null;
  level: number;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  children_count: number;
  products_count: number;
  created_at: string;
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

export const categoriesApi = {
  list: async (params?: { 
    page?: number; 
    limit?: number; 
    parent_id?: number; 
    level?: number;
    is_active?: boolean;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.parent_id !== undefined) query.set('parent_id', params.parent_id.toString());
    if (params?.level) query.set('level', params.level.toString());
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    if (params?.search) query.set('search', params.search);
    
    const res = await fetch(`${API_BASE}/categories/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<Category>>(res);
  },
  
  tree: async (is_active?: boolean) => {
    const query = new URLSearchParams();
    if (is_active !== undefined) query.set('is_active', is_active.toString());
    
    const res = await fetch(`${API_BASE}/categories/tree?${query}`, { headers: getAuthHeaders() });
    return handleResponse<CategoryTreeNode[]>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/categories/${id}`, { headers: getAuthHeaders() });
    return handleResponse<Category>(res);
  },
  
  create: async (data: { name: string; parent_id?: number; description?: string; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/categories/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Category>(res);
  },
  
  update: async (id: number, data: Partial<Category>) => {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Category>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

