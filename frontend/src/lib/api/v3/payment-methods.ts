/**
 * 收付款方式管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface PaymentMethod {
  id: number;
  name: string;
  method_type: string;
  account_no?: string;
  account_name?: string;
  bank_name?: string;
  is_proxy: boolean;
  proxy_entity_id?: number;
  proxy_balance: number;
  proxy_entity_name: string;
  notes?: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  type_display: string;
  display_name: string;
  icon: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodSimple {
  id: number;
  name: string;
  method_type: string;
  type_display: string;
  display_name: string;
  icon: string;
  is_proxy: boolean;
  proxy_balance: number;
}

export interface PaymentMethodCreate {
  name: string;
  method_type: string;
  account_no?: string;
  account_name?: string;
  bank_name?: string;
  is_proxy?: boolean;
  proxy_entity_id?: number;
  notes?: string;
  is_default?: boolean;
  sort_order?: number;
}

export interface PaymentMethodUpdate {
  name?: string;
  method_type?: string;
  account_no?: string;
  account_name?: string;
  bank_name?: string;
  is_proxy?: boolean;
  proxy_entity_id?: number;
  notes?: string;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

// 类型常量
export const PAYMENT_METHOD_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  bank: { label: '银行账户', icon: '🏦', color: 'bg-blue-100 text-blue-700' },
  wechat: { label: '微信', icon: '💚', color: 'bg-green-100 text-green-700' },
  alipay: { label: '支付宝', icon: '🔵', color: 'bg-sky-100 text-sky-700' },
  cash: { label: '现金', icon: '💵', color: 'bg-amber-100 text-amber-700' },
  proxy: { label: '代收账户', icon: '👤', color: 'bg-purple-100 text-purple-700' },
  other: { label: '其他', icon: '💳', color: 'bg-gray-100 text-gray-700' },
};

export const paymentMethodsApi = {
  list: async (params?: {
    method_type?: string;
    is_proxy?: boolean;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.method_type) query.set('method_type', params.method_type);
    if (params?.is_proxy !== undefined) query.set('is_proxy', String(params.is_proxy));
    if (params?.is_active !== undefined) query.set('is_active', String(params.is_active));
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    
    const res = await fetch(`${API_BASE}/payment-methods/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<PaymentMethod>>(res);
  },
  
  listSimple: async (is_active: boolean = true) => {
    const res = await fetch(`${API_BASE}/payment-methods/simple?is_active=${is_active}`, { 
      headers: getAuthHeaders() 
    });
    return handleResponse<PaymentMethodSimple[]>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/payment-methods/${id}`, { headers: getAuthHeaders() });
    return handleResponse<PaymentMethod>(res);
  },
  
  create: async (data: PaymentMethodCreate) => {
    const res = await fetch(`${API_BASE}/payment-methods/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<PaymentMethod>(res);
  },
  
  update: async (id: number, data: PaymentMethodUpdate) => {
    const res = await fetch(`${API_BASE}/payment-methods/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<PaymentMethod>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/payment-methods/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  },
  
  initDefaults: async () => {
    const res = await fetch(`${API_BASE}/payment-methods/init-defaults`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string; created: number }>(res);
  },
};

