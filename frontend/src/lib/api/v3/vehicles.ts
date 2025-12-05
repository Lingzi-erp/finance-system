/**
 * 车辆管理API
 */
import { API_BASE, getAuthHeaders, handleResponse } from './client';

export interface Vehicle {
  id: number;
  plate_number: string;
  logistics_company_id: number;
  company_name: string;
  vehicle_type?: string;
  notes?: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleSimple {
  id: number;
  plate_number: string;
  logistics_company_id: number;
  company_name: string;
  vehicle_type?: string;
}

export interface VehicleListResponse {
  data: Vehicle[];
  total: number;
}

export const vehiclesApi = {
  // 获取车辆列表
  list: async (params?: {
    logistics_company_id?: number;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<VehicleListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.logistics_company_id) searchParams.set('logistics_company_id', params.logistics_company_id.toString());
    if (params?.is_active !== undefined) searchParams.set('is_active', params.is_active.toString());
    if (params?.skip) searchParams.set('skip', params.skip.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/vehicles/?${searchParams.toString()}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  },

  // 获取简单列表（用于下拉选择）
  listSimple: async (logisticsCompanyId?: number): Promise<VehicleSimple[]> => {
    const params = logisticsCompanyId ? `?logistics_company_id=${logisticsCompanyId}` : '';
    const res = await fetch(`${API_BASE}/vehicles/simple${params}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  },

  // 获取单个车辆
  get: async (id: number): Promise<Vehicle> => {
    const res = await fetch(`${API_BASE}/vehicles/${id}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  },

  // 创建车辆
  create: async (data: {
    plate_number: string;
    logistics_company_id: number;
    vehicle_type?: string;
    notes?: string;
  }): Promise<Vehicle> => {
    const res = await fetch(`${API_BASE}/vehicles/`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  // 更新车辆
  update: async (id: number, data: {
    plate_number?: string;
    logistics_company_id?: number;
    vehicle_type?: string;
    notes?: string;
    is_active?: boolean;
  }): Promise<Vehicle> => {
    const res = await fetch(`${API_BASE}/vehicles/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  // 删除车辆（软删除）
  delete: async (id: number): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE}/vehicles/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse(res);
  }
};

