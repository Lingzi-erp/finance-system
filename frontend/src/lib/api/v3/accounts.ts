/**
 * 应收/应付账款 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface AccountBalance {
  id: number;
  entity_id: number;
  order_id: number;
  balance_type: string;
  amount: number;
  paid_amount: number;
  balance: number;
  due_date?: string;
  status: string;
  notes?: string;
  is_initial?: boolean;  // 是否为期初数据
  type_display: string;
  status_display: string;
  entity_name: string;
  entity_code: string;
  order_no: string;
  business_date: string;  // 业务日期（装货/卸货日期）
  created_by: number;
  creator_name: string;
  created_at: string;
  updated_at?: string;
}

export interface AccountSummary {
  total_receivable: number;
  total_payable: number;
  receivable_balance: number;
  payable_balance: number;
  overdue_receivable: number;
  overdue_payable: number;
}

export const ACCOUNT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  receivable: { label: '应收', color: 'bg-green-100 text-green-700' },
  payable: { label: '应付', color: 'bg-orange-100 text-orange-700' }
};

export const ACCOUNT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-700' },
  partial: { label: '部分结算', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已结清', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-700' }
};

export const accountsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    balance_type?: string;
    status?: string;
    entity_id?: number;
    start_date?: string;
    end_date?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.balance_type) query.set('balance_type', params.balance_type);
    if (params?.status) query.set('status', params.status);
    if (params?.entity_id) query.set('entity_id', params.entity_id.toString());
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    
    const res = await fetch(`${API_BASE}/accounts/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<AccountBalance>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/accounts/${id}`, { headers: getAuthHeaders() });
    return handleResponse<AccountBalance>(res);
  },
  
  getSummary: async () => {
    const res = await fetch(`${API_BASE}/accounts/summary`, { headers: getAuthHeaders() });
    return handleResponse<AccountSummary>(res);
  },
  
  getEntitySummary: async (entityId: number) => {
    const res = await fetch(`${API_BASE}/accounts/entity/${entityId}/summary`, { headers: getAuthHeaders() });
    return handleResponse<{ entity_id: number; receivable_balance: number; payable_balance: number; net_balance: number }>(res);
  },
  
  update: async (id: number, data: { due_date?: string; notes?: string }) => {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<AccountBalance>(res);
  },
  
  cancel: async (id: number) => {
    const res = await fetch(`${API_BASE}/accounts/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  },
  
  // 往来汇总 - 按客户/供应商分组
  getOverviewByEntity: async (params?: { balance_type?: string; min_balance?: number; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.balance_type) query.set('balance_type', params.balance_type);
    if (params?.min_balance) query.set('min_balance', params.min_balance.toString());
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const res = await fetch(`${API_BASE}/accounts/overview/by-entity?${query}`, { headers: getAuthHeaders() });
    return handleResponse<{
      data: EntityAccountOverview[];
      total: number;
      page: number;
      limit: number;
    }>(res);
  },
  
  // 应收账龄分析
  getReceivableAging: async (entityId?: number) => {
    const query = entityId ? `?entity_id=${entityId}` : '';
    const res = await fetch(`${API_BASE}/accounts/aging/receivable${query}`, { headers: getAuthHeaders() });
    return handleResponse<AgingAnalysis>(res);
  },
  
  // 应付账龄分析
  getPayableAging: async (entityId?: number) => {
    const query = entityId ? `?entity_id=${entityId}` : '';
    const res = await fetch(`${API_BASE}/accounts/aging/payable${query}`, { headers: getAuthHeaders() });
    return handleResponse<AgingAnalysis>(res);
  },
  
  // 往来对账单
  getEntityStatement: async (entityId: number, startDate?: string, endDate?: string) => {
    const query = new URLSearchParams();
    if (startDate) query.set('start_date', startDate);
    if (endDate) query.set('end_date', endDate);
    
    const res = await fetch(`${API_BASE}/accounts/entity/${entityId}/statement?${query}`, { headers: getAuthHeaders() });
    return handleResponse<EntityStatement>(res);
  }
};

// 往来汇总类型
export interface EntityAccountOverview {
  entity_id: number;
  entity_name: string;
  entity_code: string;
  entity_type: string;
  balance_type: string;
  balance_type_display: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  overdue_amount: number;
  order_count: number;
}

// 账龄分析类型
export interface AgingBucket {
  label: string;
  count: number;
  amount: number;
}

export interface AgingDetail {
  entity_id: number;
  entity_name: string;
  entity_code: string;
  current: number;
  '1_30': number;
  '31_60': number;
  '61_90': number;
  over_90: number;
  total: number;
}

export interface AgingAnalysis {
  summary: {
    current: AgingBucket;
    '1_30': AgingBucket;
    '31_60': AgingBucket;
    '61_90': AgingBucket;
    over_90: AgingBucket;
  };
  total_receivable?: number;
  total_payable?: number;
  total_overdue: number;
  overdue_rate: number;
  details: AgingDetail[];
}

// 往来对账单类型
export interface StatementItem {
  date: string;
  type: string;
  ref_no: string;
  description: string;
  debit: number;
  credit: number;
  receivable_balance: number;
  payable_balance: number;
}

export interface EntityStatement {
  entity_id: number;
  entity_name: string;
  entity_code: string;
  start_date?: string;
  end_date?: string;
  items: StatementItem[];
  ending_receivable: number;
  ending_payable: number;
  net_balance: number;
}

