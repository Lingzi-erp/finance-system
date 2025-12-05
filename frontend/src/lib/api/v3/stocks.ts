/**
 * 库存管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface Stock {
  id: number;
  warehouse_id: number;
  product_id: number;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  safety_stock: number;
  is_low_stock: boolean;
  last_check_at?: string;
  created_at: string;
  updated_at: string;
  warehouse_name: string;
  warehouse_code: string;
  product_name: string;
  product_code: string;
  product_unit: string;
  // 包装规格换算信息（从 ProductSpec 获取）
  container_name?: string;  // 容器名称：件、箱
  unit_quantity?: number;  // 每件数量：15
  base_unit_symbol?: string;  // 基础单位：kg
}

export interface StockFlow {
  id: number;
  stock_id: number;
  order_id?: number;
  order_item_id?: number;
  flow_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason?: string;
  type_display: string;
  operator_id: number;
  operator_name: string;
  operated_at: string;
  created_at: string;
  warehouse_name: string;
  product_name: string;
  order_no?: string;
  can_revert: boolean;
}

export interface WarehouseStock {
  warehouse_id: number;
  warehouse_name: string;
  warehouse_code: string;
  product_id: number;
  product_name: string;
  product_code: string;
  product_unit: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

export interface ProductStock {
  product_id: number;
  product_name: string;
  product_code: string;
  product_unit: string;
  warehouses: WarehouseStock[];
  total_quantity: number;
  total_available: number;
}

export const STOCK_FLOW_TYPE_MAP: Record<string, { label: string; color: string }> = {
  in: { label: '入库', color: 'bg-green-100 text-green-700' },
  out: { label: '出库', color: 'bg-red-100 text-red-700' },
  reserve: { label: '预留', color: 'bg-yellow-100 text-yellow-700' },
  release: { label: '释放', color: 'bg-blue-100 text-blue-700' },
  adjust: { label: '调整', color: 'bg-purple-100 text-purple-700' }
};

export const stocksApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    warehouse_id?: number;
    product_id?: number;
    low_stock_only?: boolean;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.warehouse_id) query.set('warehouse_id', params.warehouse_id.toString());
    if (params?.product_id) query.set('product_id', params.product_id.toString());
    if (params?.low_stock_only) query.set('low_stock_only', 'true');
    if (params?.search) query.set('search', params.search);
    
    const res = await fetch(`${API_BASE}/stocks/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<Stock>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/stocks/${id}`, { headers: getAuthHeaders() });
    return handleResponse<Stock>(res);
  },
  
  getByWarehouse: async (warehouseId: number, availableOnly?: boolean) => {
    const query = new URLSearchParams();
    if (availableOnly) query.set('available_only', 'true');
    const res = await fetch(`${API_BASE}/stocks/warehouse/${warehouseId}?${query}`, { headers: getAuthHeaders() });
    return handleResponse<WarehouseStock[]>(res);
  },
  
  getByProduct: async (productId: number) => {
    const res = await fetch(`${API_BASE}/stocks/product/${productId}`, { headers: getAuthHeaders() });
    return handleResponse<ProductStock>(res);
  },
  
  update: async (id: number, data: { safety_stock?: number }) => {
    const res = await fetch(`${API_BASE}/stocks/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Stock>(res);
  },
  
  adjust: async (id: number, data: { new_quantity: number; reason: string }) => {
    const res = await fetch(`${API_BASE}/stocks/${id}/adjust`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<Stock>(res);
  },
  
  getFlows: async (stockId: number, params?: { page?: number; limit?: number; flow_type?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.flow_type) query.set('flow_type', params.flow_type);
    
    const res = await fetch(`${API_BASE}/stocks/${stockId}/flows?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<StockFlow>>(res);
  },
  
  recalculate: async () => {
    const res = await fetch(`${API_BASE}/stocks/recalculate`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<{
      message: string;
      summary: { created: number; updated: number; unchanged: number };
      adjustments: Array<{
        warehouse_id: number;
        product_id: number;
        old_quantity: number;
        new_quantity: number;
        old_reserved: number;
        new_reserved: number;
      }>;
    }>(res);
  },
  
  revertFlow: async (flowId: number) => {
    const res = await fetch(`${API_BASE}/stocks/flows/${flowId}/revert`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<StockFlow>(res);
  },
  
  getAllFlows: async (params?: {
    page?: number;
    limit?: number;
    warehouse_id?: number;
    flow_type?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.warehouse_id) query.set('warehouse_id', params.warehouse_id.toString());
    if (params?.flow_type) query.set('flow_type', params.flow_type);
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);
    if (params?.search) query.set('search', params.search);
    
    const res = await fetch(`${API_BASE}/stocks/flows/all?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<StockFlow>>(res);
  }
};

