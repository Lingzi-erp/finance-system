/**
 * 单位管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface UnitGroup {
  id: number;
  name: string;
  base_unit: string;
  description: string | null;
  is_active: boolean;
  units: UnitInGroup[];
  created_at: string;
}

export interface UnitInGroup {
  id: number;
  name: string;
  symbol: string;
  conversion_rate: number;
  is_base: boolean;
}

export interface Unit {
  id: number;
  group_id: number;
  group_name: string;
  name: string;
  symbol: string;
  conversion_rate: number;
  is_base: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface CompositeUnit {
  id: number;
  name: string;
  container_name: string;
  quantity: number;
  unit_id: number;
  description: string | null;
  is_active: boolean;
  display_name: string;
  unit_name: string;
  unit_symbol: string;
  created_at: string;
}

export const unitsApi = {
  // 单位组
  listGroups: async (is_active?: boolean) => {
    const query = new URLSearchParams();
    if (is_active !== undefined) query.set('is_active', is_active.toString());
    
    const res = await fetch(`${API_BASE}/units/groups?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{ data: UnitGroup[]; total: number }>(res);
  },
  
  getGroup: async (id: number) => {
    const res = await fetch(`${API_BASE}/units/groups/${id}`, { headers: getAuthHeaders() });
    return handleResponse<UnitGroup>(res);
  },
  
  createGroup: async (data: { name: string; base_unit: string; description?: string }) => {
    const res = await fetch(`${API_BASE}/units/groups`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<UnitGroup>(res);
  },
  
  updateGroup: async (id: number, data: Partial<UnitGroup>) => {
    const res = await fetch(`${API_BASE}/units/groups/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<UnitGroup>(res);
  },
  
  // 单位
  list: async (params?: { group_id?: number; is_active?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.group_id) query.set('group_id', params.group_id.toString());
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    
    const res = await fetch(`${API_BASE}/units/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<Unit[]>(res);
  },
  
  create: async (data: { group_id: number; name: string; symbol: string; conversion_rate: number; is_base?: boolean; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/units/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Unit>(res);
  },
  
  update: async (id: number, data: Partial<Unit>) => {
    const res = await fetch(`${API_BASE}/units/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Unit>(res);
  },
  
  // 复式单位
  listComposite: async (params?: { page?: number; limit?: number; is_active?: boolean; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.is_active !== undefined) query.set('is_active', params.is_active.toString());
    if (params?.search) query.set('search', params.search);
    
    const res = await fetch(`${API_BASE}/units/composite?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<CompositeUnit>>(res);
  },
  
  createComposite: async (data: { name?: string; container_name: string; quantity: number; unit_id: number; description?: string }) => {
    const res = await fetch(`${API_BASE}/units/composite`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<CompositeUnit>(res);
  },
  
  updateComposite: async (id: number, data: Partial<CompositeUnit>) => {
    const res = await fetch(`${API_BASE}/units/composite/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<CompositeUnit>(res);
  },
  
  deleteComposite: async (id: number) => {
    const res = await fetch(`${API_BASE}/units/composite/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

