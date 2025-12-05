/**
 * 审计日志 API
 */

import { API_BASE, getAuthHeaders, handleResponse, ListResponse } from './client';

export interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  resource_type: string;
  resource_id?: number;
  resource_name?: string;
  description?: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  ip_address?: string;
  created_at: string;
  action_display: string;
  resource_type_display: string;
  username: string;
}

export const auditLogsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    action?: string;
    resource_type?: string;
    user_id?: number;
    start_date?: string;
    end_date?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.action) query.set('action', params.action);
    if (params?.resource_type) query.set('resource_type', params.resource_type);
    if (params?.user_id) query.set('user_id', params.user_id.toString());
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    
    const res = await fetch(`${API_BASE}/audit-logs/?${query}`, { headers: getAuthHeaders() });
    return handleResponse<ListResponse<AuditLog>>(res);
  }
};

