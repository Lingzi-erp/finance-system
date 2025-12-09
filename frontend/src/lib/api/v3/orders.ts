/**
 * 业务单管理 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  amount: number;
  shipping_cost: number;
  shipping_type?: string;
  shipping_rate?: number;
  discount: number;
  subtotal: number;
  notes?: string;
  // 运输信息
  plate_number?: string;
  driver_phone?: string;
  logistics_company?: string;
  invoice_no?: string;
  // 商品信息
  product_name: string;
  product_code: string;
  product_unit: string;
  original_item_id?: number;
  returned_quantity?: number;
  returnable_quantity?: number;
  // === 商品规格快照（从 ProductSpec 获取）===
  spec_id?: number;
  spec_name?: string;  // 规格名称：大件、小件
  // === 包装换算信息（从订单明细快照读取）===
  container_name?: string;  // 容器名称：件、箱
  unit_quantity?: number;  // 每件数量：15
  base_unit_symbol?: string;  // 基础单位：kg
  // === 计价方式 ===
  pricing_mode?: string;  // container(按件)/weight(按重量)
  container_count?: number;  // 件数
  // 批次相关
  gross_weight?: number;
  deduction_formula_id?: number;
  deduction_formula_name?: string;
  storage_rate?: number;
  batch_id?: number;
  batch_no?: string;
  // 成本相关
  cost_price?: number;
  cost_amount?: number;
  profit?: number;
  created_at: string;
}

export interface OrderFlow {
  id: number;
  order_id: number;
  flow_type: string;
  flow_status: string;
  type_display: string;
  description?: string;
  meta_data?: Record<string, any>;
  notes?: string;
  operator_id: number;
  operator_name: string;
  operated_at: string;
}

export interface RelatedOrderInfo {
  id: number;
  order_no: string;
  order_type: string;
  type_display: string;
  status: string;
  status_display: string;
  total_quantity: number;
  final_amount: number;
  created_at: string;
  completed_at?: string;
}

export interface BusinessOrder {
  id: number;
  order_no: string;
  order_type: string;
  type_display: string;
  status: string;
  status_display: string;
  source_id: number;
  source_name: string;
  source_code: string;
  source_type: string;
  target_id: number;
  target_name: string;
  target_code: string;
  target_type: string;
  logistics_company_id?: number;
  logistics_company_name?: string;
  logistics_company_code?: string;
  business_type?: string;
  business_type_display?: string;
  total_quantity: number;
  total_amount: number;
  total_shipping: number;
  total_storage_fee: number;
  other_fee: number;
  total_discount: number;
  final_amount: number;
  order_date: string;
  loading_date?: string;
  unloading_date?: string;
  notes?: string;
  items: OrderItem[];
  flows: OrderFlow[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
  related_order_id?: number;
  related_order?: RelatedOrderInfo | null;
  return_orders?: RelatedOrderInfo[];
}

export interface OrderCreateData {
  order_type: string;
  source_id: number;
  target_id: number;
  logistics_company_id?: number;
  order_date?: string;
  total_discount?: number;
  total_shipping?: number;
  total_storage_fee?: number;
  other_fee?: number;
  calculate_storage_fee?: boolean;
  notes?: string;
  items: {
    product_id: number;
    quantity: number;
    unit_price: number;
    shipping_cost?: number;
    shipping_type?: string;
    shipping_rate?: number;
    discount?: number;
    notes?: string;
    // === 商品规格（从 ProductSpec 获取）===
    spec_id?: number;
    spec_name?: string;
    // === 包装换算信息 ===
    container_name?: string;
    unit_quantity?: number;
    base_unit_symbol?: string;
    // === 计价方式 ===
    pricing_mode?: string;  // container(按件)/weight(按重量)
    container_count?: number;  // 件数
    // 运输信息
    logistics_company_id?: number;
    vehicle_id?: number;
    plate_number?: string;
    driver_phone?: string;
    logistics_company?: string;
    invoice_no?: string;
    // 采购相关
    gross_weight?: number;
    deduction_formula_id?: number;
    storage_rate?: number;
    // 销售批次分配
    batch_allocations?: { batch_id: number; quantity: number }[];
  }[];
}

export const ORDER_TYPE_MAP: Record<string, { label: string; color: string }> = {
  loading: { label: '装货单', color: 'bg-blue-100 text-blue-700' },
  unloading: { label: '卸货单', color: 'bg-green-100 text-green-700' },
  // 兼容旧类型显示
  purchase: { label: '采购', color: 'bg-blue-100 text-blue-700' },
  sale: { label: '销售', color: 'bg-green-100 text-green-700' },
  return_in: { label: '客户退货', color: 'bg-orange-100 text-orange-700' },
  return_out: { label: '退供应商', color: 'bg-red-100 text-red-700' }
};

export const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' }
};

export const ordersApi = {
  list: async (params?: { 
    page?: number; 
    limit?: number; 
    order_type?: string; 
    status?: string;
    source_id?: number;
    target_id?: number;
    search?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.order_type) query.set('order_type', params.order_type);
    if (params?.status) query.set('status', params.status);
    if (params?.source_id) query.set('source_id', params.source_id.toString());
    if (params?.target_id) query.set('target_id', params.target_id.toString());
    if (params?.search) query.set('search', params.search);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    
    const res = await fetch(`${API_BASE}/orders/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<BusinessOrder>>(res);
  },
  
  get: async (id: number) => {
    const res = await fetch(`${API_BASE}/orders/${id}`, { headers: getAuthHeaders() });
    return handleResponse<BusinessOrder>(res);
  },
  
  create: async (data: OrderCreateData) => {
    const res = await fetch(`${API_BASE}/orders/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<BusinessOrder>(res);
  },
  
  delete: async (id: number) => {
    const res = await fetch(`${API_BASE}/orders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse<{ message: string }>(res);
  },
  
  action: async (id: number, data: { 
    action: string; 
    description?: string; 
    meta_data?: Record<string, any>; 
    notes?: string; 
    return_target_id?: number; 
    return_date?: string; 
    return_items?: { order_item_id: number; quantity: number }[]; 
    return_shipping?: number 
  }) => {
    const res = await fetch(`${API_BASE}/orders/${id}/action`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<BusinessOrder>(res);
  },

  update: async (id: number, data: Partial<OrderCreateData>) => {
    const res = await fetch(`${API_BASE}/orders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse<BusinessOrder>(res);
  }
};

