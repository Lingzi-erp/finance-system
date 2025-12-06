'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Package, Search, Plus, RefreshCw, 
  ChevronDown, ChevronUp, Warehouse, Truck, 
  Clock, DollarSign, Scale, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { 
  batchesApi, deductionFormulasApi, 
  StockBatch, DeductionFormula, BATCH_STATUS_MAP,
  entitiesApi, Entity, productsApi, Product,
  OutboundRecord
} from '@/lib/api/v3';

// 解析复式单位信息（如 "箱(20kg)" -> { container: "箱", quantity: 20, unit: "kg" }）
function parseCompositeUnit(unitStr: string): { container: string; quantity: number; unit: string } | null {
  const match = unitStr.match(/^(.+?)\((\d+(?:\.\d+)?)(kg|g|斤|L|ml|个)\)$/);
  if (match) {
    return {
      container: match[1],
      quantity: parseFloat(match[2]),
      unit: match[3]
    };
  }
  return null;
}


export default function BatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(false);
  // 筛选
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [hasStock, setHasStock] = useState<boolean>(true);
  
  // 基础数据
  const [warehouses, setWarehouses] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formulas, setFormulas] = useState<DeductionFormula[]>([]);
  
  // 分页
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // 展开详情
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  
  // 新建批次对话框
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBatch, setNewBatch] = useState({
    product_id: '',
    warehouse_id: '',
    supplier_id: '',
    gross_weight: '',
    deduction_formula_id: '',
    initial_quantity: '',
    purchase_price: '',
    freight_cost: '',
    storage_rate: '',
    notes: '',
    is_initial: true,
  });
  
  
  
  // 防抖搜索
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  
  
  
  // 加载出库记录
  const loadOutboundRecords = async (batchId: number) => {
    setLoadingRecords(true);
    try {
      const records = await batchesApi.getOutboundRecords(batchId);
      setOutboundRecords(records);
    } catch (err) {
      console.error('Failed to load outbound records:', err);
      setOutboundRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  };
  
  // 展开批次时加载出库记录
  const handleExpandBatch = (batchId: number) => {
    if (expandedId === batchId) {
      setExpandedId(null);
      setOutboundRecords([]);
    } else {
      setExpandedId(batchId);
      loadOutboundRecords(batchId);
    }
  };
  
  useEffect(() => {
    loadBatches();
    loadBaseData();
  }, []);
  
  useEffect(() => {
    loadBatches();
  }, [page, warehouseId, statusFilter, hasStock, debouncedSearch]);
  
  const loadBaseData = async () => {
    try {
      const [warehousesRes, productsRes, formulasRes] = await Promise.all([
        entitiesApi.list({ entity_type: 'warehouse', limit: 100 }),
        productsApi.list({ limit: 100 }),
        deductionFormulasApi.list({ is_active: true, limit: 100 }),
      ]);
      setWarehouses(warehousesRes.data);
      setProducts(productsRes.data);
      setFormulas(formulasRes.data);
    } catch (err) {
      console.error('Failed to load base data:', err);
    }
  };
  
  const loadBatches = async (force = false) => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (warehouseId && warehouseId !== 'all') params.storage_entity_id = parseInt(warehouseId);
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter;
        params.include_depleted = true;  // 需要传这个才能按状态筛选
      }
      if (!hasStock) params.include_depleted = true;  // 不勾选"只看有库存"时显示所有
      if (debouncedSearch) params.search = debouncedSearch;
      
      const res = await batchesApi.list(params);
      setBatches(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  
  
  // 计算净重（当选择公式时）
  const calculateNetWeight = useCallback(async () => {
    if (!newBatch.gross_weight || !newBatch.deduction_formula_id) {
      return;
    }
    try {
      const result = await deductionFormulasApi.calculate(
        parseFloat(newBatch.gross_weight),
        parseInt(newBatch.deduction_formula_id)
      );
      setNewBatch(prev => ({
        ...prev,
        initial_quantity: result.net_weight.toString(),
      }));
    } catch (err: any) {
      console.error('Calculate failed:', err);
    }
  }, [newBatch.gross_weight, newBatch.deduction_formula_id]);
  
  useEffect(() => {
    if (newBatch.gross_weight && newBatch.deduction_formula_id) {
      calculateNetWeight();
    }
  }, [newBatch.gross_weight, newBatch.deduction_formula_id, calculateNetWeight]);
  const handleCreateBatch = async () => {
    if (!newBatch.product_id || !newBatch.warehouse_id || !newBatch.initial_quantity) {
      toast({ title: '请填写必填项', variant: 'destructive' });
      return;
    }
    
    setCreating(true);
    try {
      await batchesApi.create({
        product_id: parseInt(newBatch.product_id),
        warehouse_id: parseInt(newBatch.warehouse_id),
        supplier_id: newBatch.supplier_id ? parseInt(newBatch.supplier_id) : undefined,
        gross_weight: newBatch.gross_weight ? parseFloat(newBatch.gross_weight) : undefined,
        deduction_formula_id: newBatch.deduction_formula_id ? parseInt(newBatch.deduction_formula_id) : undefined,
        initial_quantity: parseFloat(newBatch.initial_quantity),
        purchase_price: newBatch.purchase_price ? parseFloat(newBatch.purchase_price) : undefined,
        freight_cost: newBatch.freight_cost ? parseFloat(newBatch.freight_cost) : undefined,
        storage_rate: newBatch.storage_rate ? parseFloat(newBatch.storage_rate) : undefined,
        notes: newBatch.notes || undefined,
        is_initial: newBatch.is_initial,
      });
      toast({ title: '创建成功' });
      setShowCreateDialog(false);
      setNewBatch({
        product_id: '',
        warehouse_id: '',
        supplier_id: '',
        gross_weight: '',
        deduction_formula_id: '',
        initial_quantity: '',
        purchase_price: '',
        freight_cost: '',
        storage_rate: '',
        notes: '',
        is_initial: true,
      });
      loadBatches();
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };
  
  const formatCurrency = (value: number | null | undefined) => {
    const num = value ?? 0;
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(num);
  };
  
  const formatNumber = (value: number | null | undefined, decimals = 2) => {
    if (value === null || value === undefined) return '0';
    return Number(value).toFixed(decimals);
  };
  
  // 解析复式单位用于计算每公斤价格
  // 如 "件(15kg)" => { baseUnit: "kg", factor: 15 }
  const parseUnitForPrice = (unit: string) => {
    const match = unit.match(/\((\d+(?:\.\d+)?)(kg|斤|g|克)\)/i);
    if (match) {
      return {
        isComposite: true,
        factor: parseFloat(match[1]),
        baseUnit: match[2].toLowerCase() === 'kg' ? 'kg' : match[2],
      };
    }
    return { isComposite: false, factor: 1, baseUnit: unit };
  };
  
  // 计算每公斤/每斤价格
  const calcPerKgPrice = (price: number, unit: string) => {
    const parsed = parseUnitForPrice(unit);
    if (parsed.isComposite && parsed.factor > 0) {
      return price / parsed.factor;
    }
    return null; // 非复式单位不显示
  };
  
  return (
    <div className="page-container">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">批次追溯</h1>
              <p className="text-sm text-slate-500">追踪每批货物的来源、成本和库存变动</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            新建期初批次
          </Button>
        </div>
        
        {/* 筛选栏 */}
        <div className="filter-panel">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="批次号、商品名称..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="w-40">
              <label className="form-label">仓库</label>
              <Select value={warehouseId} onValueChange={(v) => { setWarehouseId(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部仓库" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部仓库</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-36">
              <label className="form-label">状态</label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(BATCH_STATUS_MAP).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasStock"
                checked={hasStock}
                onChange={(e) => { setHasStock(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="hasStock" className="text-sm text-slate-600">只看有库存</label>
            </div>
            
          </div>
        </div>
        
        {/* 批次列表 */}
        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              加载中...
            </div>
          ) : batches.length === 0 ? (
            <div className="empty-state py-16">
              <Package className="empty-state-icon" />
              <p className="empty-state-text mb-2">暂无批次数据</p>
              <p className="text-sm text-slate-400 mb-4">
                批次会在采购订单<strong>完成</strong>时自动创建，每个采购明细对应一个批次
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  手动创建期初批次
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>批次号</th>
                    <th>商品</th>
                    <th>仓库</th>
                    <th>当前/初始</th>
                    <th>采购价</th>
                    <th>仓储天数</th>
                    <th>状态</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <React.Fragment key={batch.id}>
                      <tr 
                        className={`cursor-pointer ${expandedId === batch.id ? 'bg-slate-50' : ''}`}
                        onClick={() => handleExpandBatch(batch.id)}
                      >
                        <td>
                          <div className="font-mono text-sm font-medium text-slate-900">{batch.batch_no}</div>
                          {batch.is_initial && (
                            <span className="badge badge-info text-xs">期初</span>
                          )}
                        </td>
                        <td>
                          <div className="font-medium text-slate-900">{batch.product_name}</div>
                          <div className="text-xs text-slate-400">{batch.product_code}</div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                            {batch.storage_entity_name}
                          </div>
                        </td>
                        <td>
                          {(() => {
                            const cu = parseCompositeUnit(batch.product_unit);
                            if (cu && cu.quantity > 1) {
                              const currentWeight = batch.current_quantity * cu.quantity;
                              const initialWeight = batch.initial_quantity * cu.quantity;
                              return (
                                <div>
                                  <div className="font-mono font-semibold text-slate-900">
                                    {formatNumber(currentWeight)} <span className="text-xs text-slate-500">{cu.unit}</span>
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    ({batch.current_quantity} / {batch.initial_quantity} {cu.container})
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <>
                                <span className="font-mono font-semibold text-slate-900">
                                  {formatNumber(batch.current_quantity)}
                                </span>
                                <span className="text-slate-300 mx-1">/</span>
                                <span className="font-mono text-slate-400">
                                  {formatNumber(batch.initial_quantity)}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">{batch.product_unit}</span>
                              </>
                            );
                          })()}
                        </td>
                        <td className="font-mono text-slate-600">
                          {formatCurrency(batch.cost_price)}
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1 text-slate-600">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{batch.storage_days}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${BATCH_STATUS_MAP[batch.status]?.color || 'badge-neutral'}`}>
                            {batch.status_display}
                          </span>
                        </td>
                        <td>
                          {expandedId === batch.id ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </td>
                      </tr>
                      
                      {/* 展开详情 - 货物流向追溯 */}
                      {expandedId === batch.id && (
                        <tr>
                          <td colSpan={9} className="p-0 bg-slate-50/50">
                            <div className="p-6">
                              {/* 入库信息（从哪来）*/}
                              <div className="mb-6">
                                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
                                  <Truck className="w-4 h-4 text-blue-500" />
                                  <span className="text-blue-600">入库</span>
                                  <span className="text-slate-400 font-normal">（从哪来）</span>
                                </h4>
                                <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <span className="text-slate-500">供应商：</span>
                                      <span className="text-slate-800 font-medium">{batch.source_entity_name || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">采购单：</span>
                                      {batch.source_order_id ? (
                                        <a 
                                          href={`/orders/${batch.source_order_id}`}
                                          className="text-amber-600 hover:text-amber-700 hover:underline font-medium"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {batch.source_order_no}
                                        </a>
                                      ) : (
                                        <span className="text-slate-400">期初数据</span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-slate-500">入库日期：</span>
                                      <span className="text-slate-800">{batch.received_at ? new Date(batch.received_at).toLocaleDateString('zh-CN') : '-'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">入库数量：</span>
                                      <span className="text-slate-800 font-medium">{formatNumber(batch.initial_quantity)} {batch.product_unit}</span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t border-blue-100">
                                    <div>
                                      <span className="text-slate-500">采购单价：</span>
                                      <span className="text-slate-800">{formatCurrency(batch.cost_price)}/{batch.product_unit}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">运费：</span>
                                      <span className="text-slate-800">{formatCurrency(batch.freight_cost)}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">冷藏费：</span>
                                      <span className="text-slate-800">{formatCurrency((batch.storage_fee_paid || 0) + (batch.accumulated_storage_fee || 0))}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">综合成本：</span>
                                      <span className="text-emerald-600 font-medium">{formatCurrency(batch.real_cost_price)}/{batch.product_unit}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* 出库记录（到哪去）*/}
                              <div>
                                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
                                  <Package className="w-4 h-4 text-green-500" />
                                  <span className="text-green-600">出库记录</span>
                                  <span className="text-slate-400 font-normal">（到哪去）</span>
                                  <span className="text-xs text-slate-400 ml-2">
                                    已出 {formatNumber(batch.initial_quantity - batch.current_quantity)} / 剩余 {formatNumber(batch.current_quantity)}
                                  </span>
                                </h4>
                                
                                {loadingRecords ? (
                                  <div className="text-center py-4 text-slate-400">
                                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                                    加载中...
                                  </div>
                                ) : outboundRecords.length === 0 ? (
                                  <div className="bg-slate-100/50 rounded-lg p-4 text-center text-slate-400 text-sm">
                                    暂无出库记录
                                  </div>
                                ) : (
                                  <div className="bg-green-50/50 rounded-lg border border-green-100 overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-green-100/50">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-slate-600">销售单</th>
                                          <th className="px-3 py-2 text-left text-slate-600">客户</th>
                                          <th className="px-3 py-2 text-left text-slate-600">日期</th>
                                          <th className="px-3 py-2 text-right text-slate-600">出库数量</th>
                                          <th className="px-3 py-2 text-right text-slate-600">售价</th>
                                          <th className="px-3 py-2 text-right text-slate-600">成本</th>
                                          <th className="px-3 py-2 text-right text-slate-600">利润</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {outboundRecords.map((record) => (
                                          <tr key={record.id} className="border-t border-green-100">
                                            <td className="px-3 py-2">
                                              <a 
                                                href={`/orders/${record.order_id}`}
                                                className="text-amber-600 hover:text-amber-700 hover:underline font-medium"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                {record.order_no}
                                              </a>
                                              <span className="text-xs text-slate-400 ml-1">({record.order_type_display})</span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">{record.customer_name}</td>
                                            <td className="px-3 py-2 text-slate-600">
                                              {record.order_date ? new Date(record.order_date).toLocaleDateString('zh-CN') : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-800">
                                              {formatNumber(record.quantity)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-600">
                                              {record.sale_amount ? formatCurrency(record.sale_amount) : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-600">
                                              {record.cost_amount ? formatCurrency(record.cost_amount) : '-'}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-mono font-medium ${
                                              record.profit && record.profit > 0 ? 'text-emerald-600' : 
                                              record.profit && record.profit < 0 ? 'text-red-500' : 'text-slate-400'
                                            }`}>
                                              {record.profit !== null ? formatCurrency(record.profit) : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                              
                              {/* 备注 */}
                              {batch.notes && !batch.notes.startsWith('补充生成') && (
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                  <span className="text-sm text-slate-500">备注：</span>
                                  <span className="text-sm text-slate-700">{batch.notes}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* 分页 */}
          {total > limit && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100">
              <div className="text-sm text-slate-500">
                共 {total} 条记录
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </Button>
                <span className="px-3 py-1 text-sm text-slate-600">
                  {page} / {Math.ceil(total / limit)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 新建批次对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">新建期初批次</h3>
              <button onClick={() => setShowCreateDialog(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">商品 *</label>
                  <Select 
                    value={newBatch.product_id} 
                    onValueChange={(v) => setNewBatch({...newBatch, product_id: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择商品" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="form-label">仓库 *</label>
                  <Select 
                    value={newBatch.warehouse_id} 
                    onValueChange={(v) => setNewBatch({...newBatch, warehouse_id: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择仓库" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id.toString()}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* 重量和数量 */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-4">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-slate-400" /> 重量计算
                </h4>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="form-label">毛重</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newBatch.gross_weight}
                      onChange={(e) => setNewBatch({...newBatch, gross_weight: e.target.value})}
                      placeholder="过磅重量"
                    />
                  </div>
                  
                  <div>
                    <label className="form-label">扣重公式</label>
                    <Select 
                      value={newBatch.deduction_formula_id} 
                      onValueChange={(v) => setNewBatch({...newBatch, deduction_formula_id: v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择公式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">无扣重</SelectItem>
                        {formulas.map((f) => (
                          <SelectItem key={f.id} value={f.id.toString()}>
                            {f.name} {f.description ? `(${f.description})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="form-label">净重（数量）*</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newBatch.initial_quantity}
                      onChange={(e) => setNewBatch({...newBatch, initial_quantity: e.target.value})}
                      placeholder="实际入库数量"
                    />
                  </div>
                </div>
                
              </div>
              
              {/* 成本信息 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">采购单价</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newBatch.purchase_price}
                    onChange={(e) => setNewBatch({...newBatch, purchase_price: e.target.value})}
                    placeholder="元/单位"
                  />
                </div>
                
                <div>
                  <label className="form-label">运费</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newBatch.freight_cost}
                    onChange={(e) => setNewBatch({...newBatch, freight_cost: e.target.value})}
                    placeholder="运费总额"
                  />
                </div>
                
                <div>
                  <label className="form-label">仓储费率</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={newBatch.storage_rate}
                    onChange={(e) => setNewBatch({...newBatch, storage_rate: e.target.value})}
                    placeholder="元/单位/天"
                  />
                </div>
              </div>
              
              {/* 备注 */}
              <div>
                <label className="form-label">备注</label>
                <textarea
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  rows={2}
                  value={newBatch.notes}
                  onChange={(e) => setNewBatch({...newBatch, notes: e.target.value})}
                  placeholder="可选，记录批次的特殊情况"
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                取消
              </Button>
              <Button onClick={handleCreateBatch} disabled={creating}>
                {creating ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
