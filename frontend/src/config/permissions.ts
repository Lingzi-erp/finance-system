/**
 * 权限系统配置
 * 与后端 app/core/permissions.py 保持同步
 */

// 权限模块定义
export const PERMISSION_MODULES = [
  {
    key: "master",
    name: "基础数据",
    icon: "Database",
    description: "客商、商品、单位等基础信息管理",
    permissions: [
      { code: "master.view", name: "查看基础数据", description: "查看客商、商品、单位等" },
      { code: "master.edit", name: "编辑基础数据", description: "创建、修改客商、商品等" },
      { code: "master.delete", name: "删除基础数据", description: "删除客商、商品等" },
    ]
  },
  {
    key: "purchase",
    name: "采购管理",
    icon: "ShoppingCart",
    description: "采购入库单据管理",
    permissions: [
      { code: "purchase.view", name: "查看采购单", description: "查看采购单列表和详情" },
      { code: "purchase.create", name: "创建采购单", description: "新建采购入库单" },
      { code: "purchase.edit", name: "编辑采购单", description: "修改草稿状态的采购单" },
      { code: "purchase.confirm", name: "确认采购单", description: "确认采购单并入库" },
      { code: "purchase.delete", name: "删除采购单", description: "删除草稿状态的采购单" },
    ]
  },
  {
    key: "sales",
    name: "销售管理",
    icon: "TrendingUp",
    description: "销售出库单据管理",
    permissions: [
      { code: "sales.view", name: "查看销售单", description: "查看销售单列表和详情" },
      { code: "sales.create", name: "创建销售单", description: "新建销售出库单" },
      { code: "sales.edit", name: "编辑销售单", description: "修改草稿状态的销售单" },
      { code: "sales.confirm", name: "确认销售单", description: "确认销售单并出库" },
      { code: "sales.delete", name: "删除销售单", description: "删除草稿状态的销售单" },
    ]
  },
  {
    key: "stock",
    name: "库存管理",
    icon: "Package",
    description: "库存查询、调整",
    permissions: [
      { code: "stock.view", name: "查看库存", description: "查看库存数量、流水、批次" },
      { code: "stock.adjust", name: "调整库存", description: "盘点调整、手动入库出库" },
    ]
  },
  {
    key: "finance",
    name: "财务管理",
    icon: "Wallet",
    description: "账款、收付款管理",
    permissions: [
      { code: "finance.view", name: "查看财务数据", description: "查看账款、收付款记录" },
      { code: "finance.payment", name: "收付款操作", description: "登记收款、付款" },
      { code: "finance.edit", name: "编辑财务数据", description: "修改收付款方式等" },
    ]
  },
  {
    key: "report",
    name: "报表统计",
    icon: "BarChart",
    description: "各类数据分析报表",
    permissions: [
      { code: "report.view", name: "查看报表", description: "查看各类统计报表" },
      { code: "report.export", name: "导出报表", description: "导出报表数据" },
    ]
  },
  {
    key: "system",
    name: "系统管理",
    icon: "Settings",
    description: "用户、角色、系统设置",
    permissions: [
      { code: "system.user", name: "用户管理", description: "管理用户账号" },
      { code: "system.role", name: "角色管理", description: "管理角色和权限" },
      { code: "system.backup", name: "数据备份", description: "备份和恢复数据" },
      { code: "system.settings", name: "系统设置", description: "修改系统配置" },
    ]
  },
];

// 获取所有权限代码
export function getAllPermissionCodes(): string[] {
  const codes: string[] = [];
  PERMISSION_MODULES.forEach(module => {
    module.permissions.forEach(perm => {
      codes.push(perm.code);
    });
  });
  return codes;
}

// 权限兼容性映射（旧权限 -> 新权限）
// 用于平滑过渡
export const PERMISSION_MIGRATION_MAP: Record<string, string | string[]> = {
  // 旧实体权限 -> 新基础数据权限
  "entity.view": "master.view",
  "entity.create": "master.edit",
  "entity.edit": "master.edit",
  "entity.delete": "master.delete",
  
  // 旧商品权限 -> 新基础数据权限
  "product.view": "master.view",
  "product.create": "master.edit",
  "product.edit": "master.edit",
  "product.delete": "master.delete",
  
  // 旧订单权限 -> 新采购/销售权限
  "order.view": ["purchase.view", "sales.view"],
  "order.view_all": ["purchase.view", "sales.view"],
  "order.create": ["purchase.create", "sales.create"],
  "order.edit": ["purchase.edit", "sales.edit"],
  "order.delete": ["purchase.delete", "sales.delete"],
  "order.confirm": ["purchase.confirm", "sales.confirm"],
  
  // 旧库存权限 -> 新库存权限（保持不变）
  "stock.view": "stock.view",
  "stock.adjust": "stock.adjust",
  
  // 旧用户权限 -> 新系统权限
  "user.manage": "system.user",
  "role.manage": "system.role",
};

/**
 * 将权限代码转换为新格式（兼容旧权限）
 */
export function migratePermission(permission: string): string[] {
  // 如果已经是新权限，直接返回
  const allNewCodes = getAllPermissionCodes();
  if (allNewCodes.includes(permission)) {
    return [permission];
  }
  
  // 尝试映射旧权限
  const mapping = PERMISSION_MIGRATION_MAP[permission];
  if (!mapping) {
    return [];
  }
  
  return Array.isArray(mapping) ? mapping : [mapping];
}

/**
 * 检查用户是否有指定权限（兼容新旧权限）
 */
export function checkPermission(userPermissions: string[], requiredPermission: string): boolean {
  // 直接检查
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }
  
  // 尝试新权限映射
  const newPerms = migratePermission(requiredPermission);
  return newPerms.some(p => userPermissions.includes(p));
}

// 预置角色模板
export const DEFAULT_ROLES = [
  {
    code: "super_admin",
    name: "超级管理员",
    description: "拥有系统全部权限",
    permissions: getAllPermissionCodes(),
  },
  {
    code: "finance_manager",
    name: "财务主管",
    description: "管理财务和查看所有业务数据",
    permissions: [
      "master.view",
      "purchase.view", "sales.view",
      "stock.view",
      "finance.view", "finance.payment", "finance.edit",
      "report.view", "report.export",
    ],
  },
  {
    code: "warehouse_manager",
    name: "仓库主管",
    description: "管理库存和采购入库",
    permissions: [
      "master.view", "master.edit",
      "purchase.view", "purchase.create", "purchase.edit", "purchase.confirm",
      "stock.view", "stock.adjust",
      "report.view",
    ],
  },
  {
    code: "sales_manager",
    name: "销售主管",
    description: "管理销售业务",
    permissions: [
      "master.view",
      "sales.view", "sales.create", "sales.edit", "sales.confirm", "sales.delete",
      "stock.view",
      "finance.view",
      "report.view",
    ],
  },
  {
    code: "salesperson",
    name: "销售员",
    description: "负责日常销售",
    permissions: [
      "master.view",
      "sales.view", "sales.create", "sales.edit",
      "stock.view",
    ],
  },
  {
    code: "viewer",
    name: "只读用户",
    description: "只能查看数据，不能操作",
    permissions: [
      "master.view",
      "purchase.view", "sales.view",
      "stock.view",
      "finance.view",
      "report.view",
    ],
  },
];

