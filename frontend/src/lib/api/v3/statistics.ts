/**
 * 统计报表 API
 */

import { API_BASE, getAuthHeaders, handleResponse } from './client';

export interface DashboardData {
  today_sales: number;
  today_sales_count: number;
  today_purchase: number;
  today_purchase_count: number;
  today_received: number;
  today_paid: number;
  month_sales: number;
  month_sales_count: number;
  month_purchase: number;
  month_purchase_count: number;
  month_profit: number;
  pending_orders: number;
  draft_orders: number;
  total_receivable: number;
  total_payable: number;
  overdue_receivable: number;
  low_stock_count: number;
  out_of_stock_count: number;
  recent_orders: Array<{
    id: number;
    order_no: string;
    order_type: string;
    type_display: string;
    status: string;
    status_display: string;
    final_amount: number;
    created_at: string;
  }>;
  sales_trend: Array<{ date: string; amount: number }>;
}

export interface SalesStatItem {
  date?: string;
  entity_id?: number;
  entity_name?: string;
  product_id?: number;
  product_name?: string;
  order_count: number;
  total_quantity: number;
  total_amount: number;
  total_cost?: number;
  total_profit?: number;
  profit_rate?: number;
}

export const statisticsApi = {
  getDashboard: async () => {
    const res = await fetch(`${API_BASE}/statistics/dashboard`, { headers: getAuthHeaders() });
    return handleResponse<DashboardData>(res);
  },
  
  getSales: async (params?: {
    group_by?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.group_by) query.set('group_by', params.group_by);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/statistics/sales?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{ items: SalesStatItem[]; summary: Record<string, any>; start_date?: string; end_date?: string }>(res);
  },
  
  getPurchase: async (params?: {
    group_by?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.group_by) query.set('group_by', params.group_by);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/statistics/purchase?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{ items: SalesStatItem[]; summary: Record<string, any>; start_date?: string; end_date?: string }>(res);
  },
  
  getEntityRank: async (params?: { rank_type?: string; start_date?: string; end_date?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.rank_type) query.set('rank_type', params.rank_type);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/statistics/entity-rank?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{ items: Array<{ entity_id: number; entity_name: string; entity_code: string; order_count: number; total_amount: number }>; rank_type: string }>(res);
  },
  
  getProductRank: async (params?: { rank_type?: string; start_date?: string; end_date?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.rank_type) query.set('rank_type', params.rank_type);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/statistics/product-rank?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{ items: Array<{ product_id: number; product_name: string; product_code: string; total_quantity: number; total_amount: number; total_profit: number }>; rank_type: string }>(res);
  }
};

