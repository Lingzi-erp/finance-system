/**
 * 收付款管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface PaymentRecord {
  id: number;
  payment_no: string;
  entity_id: number;
  account_balance_id?: number;
  payment_type: string;
  amount: number;
  payment_method_id?: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
  type_display: string;
  method_display: string;
  entity_name: string;
  entity_code: string;
  order_id?: number;
  order_no: string;
  created_by: number;
  creator_name: string;
  created_at: string;
  updated_at?: string;
}

export interface PaymentSummary {
  total_received: number;
  total_paid: number;
  today_received: number;
  today_paid: number;
  month_received: number;
  month_paid: number;
}

export const PAYMENT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  receive: { label: '收款', color: 'bg-green-100 text-green-700' },
  pay: { label: '付款', color: 'bg-orange-100 text-orange-700' }
};

export const PAYMENT_METHOD_MAP: Record<string, { label: string }> = {
  cash: { label: '现金' },
  bank: { label: '银行转账' },
  wechat: { label: '微信' },
  alipay: { label: '支付宝' },
  check: { label: '支票' },
  other: { label: '其他' }
};

export const paymentsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    payment_type?: string;
    payment_method?: string;
    entity_id?: number;
    start_date?: string;
    end_date?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.payment_type) query.set('payment_type', params.payment_type);
    if (params?.payment_method) query.set('payment_method', params.payment_method);
    if (params?.entity_id) query.set('entity_id', params.entity_id.toString());
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    
    const res = await fetch(`${API_BASE}/payments/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<PaymentRecord>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/payments/${id}`, { headers: getAuthHeaders() });
    return handleResponse<PaymentRecord>(res);
  },
  
  getSummary: async () => {
    const res = await fetch(`${API_BASE}/payments/summary`, { headers: getAuthHeaders() });
    return handleResponse<PaymentSummary>(res);
  },
  
  create: async (data: {
    entity_id: number;
    account_balance_id?: number;
    payment_type: string;
    amount: number;
    payment_method_id?: number;
    payment_method?: string;
    payment_date?: string;
    notes?: string;
  }) => {
    const res = await fetch(`${API_BASE}/payments/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<PaymentRecord>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  }
};

