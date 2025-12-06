/**
 * 期初数据 API 客户端
 */

import { API_BASE, getAuthHeaders } from './client';

// ===== 类型定义 =====

export interface InitialStockCreate {
  warehouse_id: number;
  product_id: number;
  quantity: number;
  notes?: string;
}

export interface InitialStockBatchCreate {
  items: InitialStockCreate[];
}

export interface InitialAccountCreate {
  entity_id: number;
  balance_type: 'receivable' | 'payable';
  amount: number;
  notes?: string;
}

export interface InitialAccountBatchCreate {
  items: InitialAccountCreate[];
}

export interface InitialStockResponse {
  id: number;
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  product_name: string;
  product_code: string;
  quantity: number;
  notes?: string;
  created_at: string;
}

export interface InitialAccountResponse {
  id: number;
  entity_id: number;
  entity_name: string;
  entity_code: string;
  balance_type: string;
  balance_type_display: string;
  amount: number;
  balance: number;
  status: string;
  notes?: string;
  created_at: string;
}

export interface InitialDataSummary {
  stock: {
    count: number;
    total_quantity: number;
  };
  receivable: {
    count: number;
    total_amount: number;
    total_balance: number;
  };
  payable: {
    count: number;
    total_amount: number;
    total_balance: number;
  };
}

// ===== API 函数 =====

export const initialDataApi = {
  // 期初库存
  createStock: async (data: InitialStockCreate): Promise<InitialStockResponse> => {
    const res = await fetch(`${API_BASE}/initial-data/stock`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || '创建失败');
    }
    return res.json();
  },

  createStockBatch: async (data: InitialStockBatchCreate) => {
    const res = await fetch(`${API_BASE}/initial-data/stock/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || '批量创建失败');
    }
    return res.json();
  },

  listStocks: async (warehouseId?: number) => {
    const params = new URLSearchParams();
    if (warehouseId) params.append('warehouse_id', String(warehouseId));
    
    const res = await fetch(`${API_BASE}/initial-data/stock?${params}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('获取失败');
    return res.json();
  },

  // 期初账款
  createAccount: async (data: InitialAccountCreate): Promise<InitialAccountResponse> => {
    const res = await fetch(`${API_BASE}/initial-data/account`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || '创建失败');
    }
    return res.json();
  },

  createAccountBatch: async (data: InitialAccountBatchCreate) => {
    const res = await fetch(`${API_BASE}/initial-data/account/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || '批量创建失败');
    }
    return res.json();
  },

  listAccounts: async (balanceType?: string) => {
    const params = new URLSearchParams();
    if (balanceType) params.append('balance_type', balanceType);
    
    const res = await fetch(`${API_BASE}/initial-data/account?${params}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('获取失败');
    return res.json();
  },

  deleteAccount: async (accountId: number) => {
    const res = await fetch(`${API_BASE}/initial-data/account/${accountId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || '删除失败');
    }
    return res.json();
  },

  // 汇总统计
  getSummary: async (): Promise<InitialDataSummary> => {
    const res = await fetch(`${API_BASE}/initial-data/summary`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('获取失败');
    return res.json();
  },
};

