/**
 * V3 API 客户端
 * 统一导出所有模块，保持向后兼容
 */

// 基础客户端
export { API_BASE, getAuthHeaders, handleResponse } from './client';
export type { ListResponse } from './client';

// 实体管理
export { entitiesApi, ENTITY_TYPE_MAP } from './entities';
export type { Entity } from './entities';

// 商品管理
export { productsApi } from './products';
export type { Product } from './products';

// 业务单管理
export { ordersApi, ORDER_TYPE_MAP, ORDER_STATUS_MAP } from './orders';
export type { BusinessOrder, OrderItem, OrderFlow, OrderCreateData, RelatedOrderInfo } from './orders';

// 库存管理
export { stocksApi, STOCK_FLOW_TYPE_MAP } from './stocks';
export type { Stock, StockFlow, WarehouseStock, ProductStock } from './stocks';

// 商品分类
export { categoriesApi } from './categories';
export type { Category, CategoryTreeNode } from './categories';

// 规格模板
export { specificationsApi } from './specifications';
export type { Specification } from './specifications';

// 单位管理
export { unitsApi } from './units';
export type { UnitGroup, UnitInGroup, Unit, CompositeUnit } from './units';

// 应收/应付账款
export { accountsApi, ACCOUNT_TYPE_MAP, ACCOUNT_STATUS_MAP } from './accounts';
export type { AccountBalance, AccountSummary } from './accounts';

// 收付款方式管理
export { paymentMethodsApi, PAYMENT_METHOD_TYPES } from './payment-methods';
export type { PaymentMethod, PaymentMethodSimple, PaymentMethodCreate, PaymentMethodUpdate } from './payment-methods';

// 收付款管理
export { paymentsApi, PAYMENT_TYPE_MAP, PAYMENT_METHOD_MAP } from './payments';
export type { PaymentRecord, PaymentSummary } from './payments';

// 统计报表
export { statisticsApi } from './statistics';
export type { DashboardData, SalesStatItem } from './statistics';

// 数据备份
export { backupApi } from './backup';
export type { BackupInfo } from './backup';

// 审计日志
export { auditLogsApi } from './audit';
export type { AuditLog } from './audit';

// 批次管理
export { batchesApi, deductionFormulasApi, BATCH_STATUS_MAP } from './batches';
export type { StockBatch, BatchListParams, BatchCreateData, BatchUpdateData, DeductionFormula, FormulaCreateData } from './batches';

// 车辆管理
export { vehiclesApi } from './vehicles';
export type { Vehicle, VehicleSimple, VehicleListResponse } from './vehicles';
