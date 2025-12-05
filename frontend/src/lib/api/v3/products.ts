/**
 * 商品管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

// 包装规格接口
export interface ProductSpec {
  id: number;
  product_id: number;
  name: string;          // 规格名称，如：大箱、小箱、散装
  container_name: string; // 容器名称，如：箱、件、kg
  quantity: number;       // 每个容器的基础单位数量
  unit_id: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 展开的信息
  unit_symbol?: string;   // 基础单位符号，如：kg
  display_name?: string;  // 显示名称，如：大箱(20kg)
  is_bulk?: boolean;      // 是否散装
}

export interface ProductSpecCreate {
  name: string;
  container_name: string;
  quantity: number;
  unit_id: number;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface Product {
  id: number;
  name: string;
  code: string;
  specification?: string;
  unit: string;
  unit_id?: number;
  // 包装规格列表（从 ProductSpec 获取）
  specs?: ProductSpec[];
  category?: string;
  cost_price?: number;
  suggested_price?: number;
  description?: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export const productsApi = {
  list: async (params?: { page?: number; limit?: number; category?: string; search?: string; is_active?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    
    const res = await fetch(`${API_BASE}/products/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<Product>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/products/${id}`, { headers: getAuthHeaders() });
    return handleResponse<Product>(res);
  },
  
  create: async (data: Partial<Product>) => {
    const res = await fetch(`${API_BASE}/products/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Product>(res);
  },
  
  update: async (id: number, data: Partial<Product>) => {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Product>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  },
  
  getUnits: async () => {
    const res = await fetch(`${API_BASE}/products/units`, { headers: getAuthHeaders() });
    return handleResponse<{ units: { value: string; label: string }[] }>(res);
  },
  
  getCategories: async () => {
    const res = await fetch(`${API_BASE}/products/categories`, { headers: getAuthHeaders() });
    return handleResponse<{ categories: string[] }>(res);
  },

  // 包装规格管理
  listSpecs: async (productId: number) => {
    const res = await fetch(`${API_BASE}/products/${productId}/specs`, { headers: getAuthHeaders() });
    return handleResponse<{ data: ProductSpec[]; total: number }>(res);
  },

  addSpec: async (productId: number, data: ProductSpecCreate) => {
    const res = await fetch(`${API_BASE}/products/${productId}/specs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<ProductSpec>(res);
  },

  updateSpec: async (productId: number, specId: number, data: Partial<ProductSpecCreate>) => {
    const res = await fetch(`${API_BASE}/products/${productId}/specs/${specId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<ProductSpec>(res);
  },

  deleteSpec: async (productId: number, specId: number) => {
    const res = await fetch(`${API_BASE}/products/${productId}/specs/${specId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

