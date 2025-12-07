/**
 * 批次管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

// 批次状态映射
export const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '在库', color: 'badge-success' },
  partial: { label: '部分在库', color: 'badge-warning' },
  depleted: { label: '已清空', color: 'badge-neutral' },
};

// 批次类型（字段名与后端API保持一致）
export interface StockBatch {
  id: number;
  batch_no: string;
  product_id: number;
  product_name: string;
  product_code: string;
  product_unit: string;
  // 存放仓库
  storage_entity_id: number;
  storage_entity_name: string;
  storage_entity_code?: string;
  // 来源（供应商）
  source_entity_id?: number;
  source_entity_name?: string;
  source_entity_code?: string;
  // 来源订单
  source_order_id?: number;
  source_order_no?: string;
  // 毛重/净重
  gross_weight?: number;
  tare_weight?: number;
  current_gross_weight?: number;
  // 数量
  initial_quantity: number;
  current_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  // 成本（cost_price = 采购单价）
  cost_price: number;
  cost_amount: number;
  freight_cost: number;
  freight_rate?: number;
  storage_fee_paid: number;
  extra_cost: number;
  // 仓储相关
  storage_start_date?: string;
  storage_rate: number;
  // 计算字段
  storage_days: number;
  accumulated_storage_fee: number;
  total_cost: number;
  real_cost_price: number;
  // 扣重公式
  deduction_formula_id?: number;
  deduction_formula_name?: string;
  deduction_formula_display?: string;
  // 其他
  notes?: string;
  status: string;
  status_display: string;
  is_depleted: boolean;
  is_initial: boolean;
  received_at?: string;
  created_at: string;
  updated_at: string;
  creator_name?: string;
}

// 批次查询参数
export interface BatchListParams {
  page?: number;
  limit?: number;
  product_id?: number;
  storage_entity_id?: number;  // 仓库ID
  supplier_id?: number;
  status?: string;
  search?: string;
  include_depleted?: boolean;  // 是否包含已清空批次
}

// 批次创建参数
export interface BatchCreateData {
  product_id: number;
  warehouse_id: number;
  supplier_id?: number;
  source_order_id?: number;
  gross_weight?: number;
  deduction_formula_id?: number;
  initial_quantity: number;
  purchase_price?: number;
  freight_cost?: number;
  freight_rate?: number;
  storage_rate?: number;
  storage_start_date?: string;
  extra_cost?: number;
  notes?: string;
  is_initial?: boolean;
}

// 批次更新参数
export interface BatchUpdateData {
  purchase_price?: number;
  freight_cost?: number;
  storage_rate?: number;
  storage_fee_paid?: number;
  extra_cost?: number;
  notes?: string;
  status?: string;
}

// 扣重公式
export interface DeductionFormula {
  id: number;
  name: string;
  formula_type: string;
  parameter?: number;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  created_by: number;
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

export interface FormulaCreateData {
  name: string;
  formula_type: string;
  parameter?: number;
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
}

// 批次 API
export const batchesApi = {
  // 列表
  list: async (params: BatchListParams = {}): Promise<ListResponse<StockBatch>> => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.product_id) query.set('product_id', params.product_id.toString());
    if (params.storage_entity_id) query.set('storage_entity_id', params.storage_entity_id.toString());
    if (params.supplier_id) query.set('source_entity_id', params.supplier_id.toString());
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.include_depleted !== undefined) query.set('include_depleted', params.include_depleted.toString());
    
    const res = await fetch(`${API_BASE}/batches?${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 获取单个
  get: async (id: number): Promise<StockBatch> => {
    const res = await fetch(`${API_BASE}/batches/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 创建（手动创建期初批次）
  create: async (data: BatchCreateData): Promise<StockBatch> => {
    const res = await fetch(`${API_BASE}/batches`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  // 更新
  update: async (id: number, data: BatchUpdateData): Promise<StockBatch> => {
    const res = await fetch(`${API_BASE}/batches/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  // 按产品查询可用批次（用于销售选择）
  listByProduct: async (productId: number, storageEntityId?: number): Promise<ListResponse<StockBatch>> => {
    const query = new URLSearchParams();
    query.set('product_id', productId.toString());
    query.set('limit', '100');
    if (storageEntityId) query.set('storage_entity_id', storageEntityId.toString());
    
    const res = await fetch(`${API_BASE}/batches?${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 支付仓储费
  payStorageFee: async (id: number, amount: number): Promise<StockBatch> => {
    const res = await fetch(`${API_BASE}/batches/${id}/pay-storage`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    return handleResponse(res);
  },
  
  // 从历史订单同步生成批次
  syncFromOrders: async (): Promise<{
    message: string;
    created_count: number;
    created_batches: Array<{
      batch_no: string;
      order_no: string;
      product_name: string;
      quantity: number;
    }>;
  }> => {
    const res = await fetch(`${API_BASE}/batches/sync-from-orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 获取批次出库记录（出库去向追溯）
  getOutboundRecords: async (batchId: number): Promise<OutboundRecord[]> => {
    const res = await fetch(`${API_BASE}/batches/${batchId}/outbound-records`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
};

// 出库记录类型
export interface OutboundRecord {
  id: number;
  order_item_id: number;
  batch_id: number;
  batch_no: string;
  quantity: number;
  cost_price: number | null;
  cost_amount: number | null;
  created_at: string;
  // 销售单信息
  order_id: number | null;
  order_no: string;
  order_type: string;
  order_type_display: string;
  order_date: string | null;
  // 客户信息
  customer_id: number | null;
  customer_name: string;
  // 金额
  sale_price: number | null;
  sale_amount: number | null;
  profit: number | null;
}

// 扣重公式 API
export const deductionFormulasApi = {
  // 列表
  list: async (params: { page?: number; limit?: number; is_active?: boolean } = {}): Promise<ListResponse<DeductionFormula>> => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.is_active !== undefined) query.set('is_active', params.is_active.toString());
    
    const res = await fetch(`${API_BASE}/deduction-formulas?${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 获取单个
  get: async (id: number): Promise<DeductionFormula> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 创建
  create: async (data: FormulaCreateData): Promise<DeductionFormula> => {
    const res = await fetch(`${API_BASE}/deduction-formulas`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  // 更新
  update: async (id: number, data: Partial<FormulaCreateData>): Promise<DeductionFormula> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },
  
  // 删除
  delete: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 计算净重
  calculate: async (grossWeight: number, formulaId: number, units?: number): Promise<{
    gross_weight: number;
    net_weight: number;
    tare_weight: number;
    formula_name: string;
  }> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/calculate`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gross_weight: grossWeight,
        formula_id: formulaId,
        unit_count: units || 1,
      }),
    });
    return handleResponse(res);
  },
  
  // 初始化默认公式
  initDefaults: async (): Promise<{ message: string; created: number }> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/init-defaults`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
  
  // 获取简单列表（下拉选择）
  listSimple: async (): Promise<DeductionFormula[]> => {
    const res = await fetch(`${API_BASE}/deduction-formulas/simple`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
};

