'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search, AlertTriangle, ArrowUpDown, Building2, RefreshCw, ChevronDown, ChevronUp, History, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { stocksApi, Stock, entitiesApi, Entity, STOCK_FLOW_TYPE_MAP, StockFlow } from '@/lib/api/v3';

export default function StocksPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 筛选
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [warehouses, setWarehouses] = useState<Entity[]>([]);
  
  // 分页
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // 展开的库存流水
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null);
  const [flows, setFlows] = useState<StockFlow[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [revertingFlowId, setRevertingFlowId] = useState<number | null>(null);
  
  // 调整库存对话框
  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  
  useEffect(() => {
    loadWarehouses();
    loadStocks();
  }, []);
  
  // 搜索防抖
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  
  useEffect(() => {
    loadStocks();
  }, [page, warehouseId, debouncedSearch]);
  
  const loadWarehouses = async () => {
    try {
      const res = await entitiesApi.list({ limit: 100, entity_type: 'warehouse' });
      setWarehouses(res.data);
    } catch (err) {
      console.error('Failed to load warehouses:', err);
    }
  };
  
  const loadStocks = async () => {
    try {
      setLoading(true);
      const res = await stocksApi.list({
        page,
        limit,
        warehouse_id: warehouseId && warehouseId !== 'all' ? parseInt(warehouseId) : undefined,
        search: debouncedSearch || undefined,
      });
      setStocks(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  const toggleFlows = async (stockId: number) => {
    if (expandedStockId === stockId) {
      setExpandedStockId(null);
      setFlows([]);
      return;
    }
    
    setExpandedStockId(stockId);
    setFlowsLoading(true);
    try {
      const res = await stocksApi.getFlows(stockId, { limit: 10 });
      setFlows(res.data);
    } catch (err: any) {
      toast({ title: '加载流水失败', description: err.message, variant: 'destructive' });
    } finally {
      setFlowsLoading(false);
    }
  };
  
  const openAdjustDialog = (stock: Stock) => {
    setAdjustingStock(stock);
    setAdjustQuantity(stock.quantity.toString());
    setAdjustReason('');
  };
  
  const handleAdjust = async () => {
    if (!adjustingStock) return;
    
    const newQty = parseInt(adjustQuantity);
    if (isNaN(newQty) || newQty < 0) {
      toast({ title: '请输入有效的数量', variant: 'destructive' });
      return;
    }
    if (!adjustReason.trim()) {
      toast({ title: '请填写调整原因', variant: 'destructive' });
      return;
    }
    
    setAdjusting(true);
    try {
      await stocksApi.adjust(adjustingStock.id, {
        new_quantity: newQty,
        reason: adjustReason.trim(),
      });
      toast({ title: '调整成功' });
      setAdjustingStock(null);
      loadStocks();
    } catch (err: any) {
      toast({ title: '调整失败', description: err.message, variant: 'destructive' });
    } finally {
      setAdjusting(false);
    }
  };
  
  const canViewStock = true;
  const canAdjustStock = true;
  
  // 撤销库存调整
  const handleRevertFlow = async (flowId: number, stockId: number) => {
    if (revertingFlowId) return;
    
    if (!confirm('确定要撤销此调整吗？这将创建一条反向调整记录。')) {
      return;
    }
    
    setRevertingFlowId(flowId);
    try {
      await stocksApi.revertFlow(flowId);
      toast({ title: '撤销成功', description: '已创建反向调整记录' });
      const res = await stocksApi.getFlows(stockId, { limit: 10 });
      setFlows(res.data);
      loadStocks();
    } catch (err: any) {
      toast({ title: '撤销失败', description: err.message, variant: 'destructive' });
    } finally {
      setRevertingFlowId(null);
    }
  };
  
  // 刷新库存（自动重算）
  const handleRefresh = async () => {
    setLoading(true);
    try {
      await stocksApi.recalculate();
      await loadStocks();
      toast({ title: '刷新完成', description: '库存已根据业务单重新计算' });
    } catch (err: any) {
      toast({ title: '刷新失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  if (!canViewStock) {
    return (
      <div className="loading-container">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">无权访问</h2>
        <p className="text-slate-500 mt-2">您没有查看库存的权限</p>
      </div>
    );
  }
  
  return (
    <div className="page-container">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Boxes className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">库存台账</h1>
              <p className="text-sm text-slate-500">查看和管理各仓库的商品库存</p>
            </div>
          </div>
        </div>
        
        {/* 筛选栏 */}
        <div className="filter-panel">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label">搜索商品</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="商品名称或编码..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="w-48">
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
          </div>
        </div>
        
        {/* 库存列表 */}
        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">加载中...</div>
          ) : stocks.length === 0 ? (
            <div className="empty-state">
              <Package className="empty-state-icon" />
              <p className="empty-state-text">暂无库存数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                <tr>
                    <th>仓库</th>
                    <th>商品</th>
                    <th>当前库存</th>
                    <th>预留</th>
                    <th>可用</th>
                    <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => (
                  <React.Fragment key={stock.id}>
                      <tr>
                        <td>
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                          <div>
                              <div className="font-medium text-slate-900">{stock.warehouse_name}</div>
                              <div className="text-xs text-slate-400">{stock.warehouse_code}</div>
                          </div>
                        </div>
                      </td>
                        <td>
                        <div>
                            <div className="font-medium text-slate-900">{stock.product_name}</div>
                            <div className="text-xs text-slate-400">
                            {stock.product_code}
                            {stock.unit_quantity && stock.unit_quantity > 1 ? (
                              <span className="ml-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                                {stock.container_name}({stock.unit_quantity}{stock.base_unit_symbol})
                              </span>
                            ) : (
                              <span className="ml-1">· {stock.product_unit}</span>
                            )}
                          </div>
                        </div>
                      </td>
                        <td>
                        {stock.unit_quantity && stock.unit_quantity > 1 ? (
                          <div>
                              <div className="font-mono font-semibold text-slate-900">
                              {(stock.quantity * stock.unit_quantity).toLocaleString()} {stock.base_unit_symbol}
                            </div>
                              <div className="text-xs text-slate-400">
                              ({stock.quantity} {stock.container_name})
                            </div>
                          </div>
                        ) : (
                            <span className="font-mono text-slate-900">{stock.quantity} {stock.product_unit}</span>
                        )}
                      </td>
                        <td>
                        {stock.unit_quantity && stock.unit_quantity > 1 ? (
                          <div>
                              <div className="font-mono text-amber-600">
                              {(stock.reserved_quantity * stock.unit_quantity).toLocaleString()} {stock.base_unit_symbol}
                            </div>
                              <div className="text-xs text-amber-500">
                              ({stock.reserved_quantity} {stock.container_name})
                            </div>
                          </div>
                        ) : (
                            <span className="font-mono text-amber-600">{stock.reserved_quantity}</span>
                        )}
                      </td>
                        <td>
                        {stock.unit_quantity && stock.unit_quantity > 1 ? (
                          <div>
                              <div className="font-mono font-semibold text-green-600">
                              {(stock.available_quantity * stock.unit_quantity).toLocaleString()} {stock.base_unit_symbol}
                            </div>
                            <div className="text-xs text-green-500">
                              {stock.available_quantity} {stock.container_name}
                            </div>
                          </div>
                        ) : (
                            <span className="font-mono font-semibold text-green-600">{stock.available_quantity}</span>
                        )}
                      </td>
                        <td>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFlows(stock.id)}
                            title="查看流水"
                          >
                            <History className="w-4 h-4" />
                            {expandedStockId === stock.id ? (
                              <ChevronUp className="w-3 h-3 ml-1" />
                            ) : (
                              <ChevronDown className="w-3 h-3 ml-1" />
                            )}
                          </Button>
                          {canAdjustStock && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAdjustDialog(stock)}
                              title="调整库存"
                            >
                              <ArrowUpDown className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* 展开的流水记录 */}
                    {expandedStockId === stock.id && (
                      <tr>
                          <td colSpan={6} className="p-0 bg-slate-50/50">
                          <div className="p-4">
                              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <History className="w-4 h-4 text-slate-400" />
                              最近流水记录
                            </h4>
                            {flowsLoading ? (
                                <div className="text-center text-slate-400 py-4">加载中...</div>
                            ) : flows.length === 0 ? (
                                <div className="text-center text-slate-400 py-4">暂无流水记录</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[750px]">
                                  <thead>
                                      <tr className="text-slate-400 border-b border-slate-200">
                                        <th className="text-left py-2 px-2 w-40 font-medium">时间</th>
                                        <th className="text-left py-2 px-2 w-16 font-medium">类型</th>
                                        <th className="text-right py-2 px-2 w-16 font-medium">变动</th>
                                        <th className="text-right py-2 px-2 w-20 font-medium">变动后</th>
                                        <th className="text-left py-2 px-2 font-medium">原因</th>
                                        <th className="text-left py-2 px-2 w-20 font-medium">操作人</th>
                                        <th className="text-center py-2 px-2 w-16 font-medium">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {flows.map((flow) => (
                                        <tr key={flow.id} className="border-t border-slate-100 hover:bg-slate-50">
                                          <td className="py-2 px-2 text-slate-500 whitespace-nowrap">
                                          {new Date(flow.operated_at).toLocaleString('zh-CN')}
                                        </td>
                                        <td className="py-2 px-2">
                                            <span className={`badge ${STOCK_FLOW_TYPE_MAP[flow.flow_type]?.color || 'badge-neutral'}`}>
                                            {flow.type_display}
                                          </span>
                                        </td>
                                          <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${flow.quantity_change > 0 ? 'text-green-600' : flow.quantity_change < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                          {flow.quantity_change > 0 ? '+' : ''}{flow.quantity_change}
                                        </td>
                                          <td className="py-2 px-2 text-right font-mono text-slate-900">{flow.quantity_after}</td>
                                          <td className="py-2 px-2 text-slate-600">{flow.reason || '-'}</td>
                                          <td className="py-2 px-2 text-slate-500">{flow.operator_name}</td>
                                        <td className="py-2 px-2 text-center">
                                          {flow.can_revert && (
                                            <button
                                              onClick={() => handleRevertFlow(flow.id, stock.id)}
                                              disabled={revertingFlowId === flow.id}
                                                className={`text-xs ${revertingFlowId === flow.id ? 'text-slate-400 cursor-not-allowed' : 'text-red-500 hover:text-red-700 hover:underline'}`}
                                              title="撤销此调整"
                                            >
                                              {revertingFlowId === flow.id ? '撤销中...' : '撤销'}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
      
      {/* 调整库存对话框 */}
      {adjustingStock && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">调整库存</h3>
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500">商品</div>
                <div className="font-medium text-slate-900">{adjustingStock.product_name}</div>
                <div className="text-xs text-slate-400">{adjustingStock.warehouse_name}</div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-slate-500">当前库存</div>
                  {adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 ? (
                    <>
                      <div className="text-xl font-bold text-slate-900">
                        {(adjustingStock.quantity * adjustingStock.unit_quantity).toLocaleString()} {adjustingStock.base_unit_symbol}
                      </div>
                      <div className="text-xs text-slate-400">{adjustingStock.quantity} {adjustingStock.container_name}</div>
                    </>
                  ) : (
                    <div className="text-xl font-bold text-slate-900">{adjustingStock.quantity}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-slate-500">预留</div>
                  {adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 ? (
                    <>
                      <div className="text-xl font-bold text-amber-600">
                        {(adjustingStock.reserved_quantity * adjustingStock.unit_quantity).toLocaleString()} {adjustingStock.base_unit_symbol}
                      </div>
                      <div className="text-xs text-amber-500">{adjustingStock.reserved_quantity} {adjustingStock.container_name}</div>
                    </>
                  ) : (
                    <div className="text-xl font-bold text-amber-600">{adjustingStock.reserved_quantity}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-slate-500">可用</div>
                  {adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 ? (
                    <>
                      <div className="text-xl font-bold text-green-600">
                        {(adjustingStock.available_quantity * adjustingStock.unit_quantity).toLocaleString()} {adjustingStock.base_unit_symbol}
                      </div>
                      <div className="text-xs text-green-500">{adjustingStock.available_quantity} {adjustingStock.container_name}</div>
                    </>
                  ) : (
                    <div className="text-xl font-bold text-green-600">{adjustingStock.available_quantity}</div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="form-label">
                  调整后数量 *
                  {adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 && (
                    <span className="text-slate-400 ml-1">（单位：{adjustingStock.container_name}）</span>
                  )}
                </label>
                <Input
                  type="number"
                  min="0"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  placeholder={`输入新的${adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 ? adjustingStock.container_name + '数' : '库存数量'}`}
                />
                {adjustQuantity && parseInt(adjustQuantity) !== adjustingStock.quantity && (
                  <div className={`text-sm mt-1 ${parseInt(adjustQuantity) > adjustingStock.quantity ? 'text-green-600' : 'text-red-600'}`}>
                    {parseInt(adjustQuantity) > adjustingStock.quantity ? '+' : ''}{parseInt(adjustQuantity) - adjustingStock.quantity} {adjustingStock.container_name || ''}
                    {adjustingStock.unit_quantity && adjustingStock.unit_quantity > 1 && (
                      <span className="text-slate-400 ml-1">
                        = {((parseInt(adjustQuantity) - adjustingStock.quantity) * adjustingStock.unit_quantity).toLocaleString()} {adjustingStock.base_unit_symbol}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div>
                <label className="form-label">调整原因 *</label>
                <textarea
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  rows={3}
                  placeholder="如：盘点调整、损耗、系统修正..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setAdjustingStock(null)}>取消</Button>
              <Button onClick={handleAdjust} disabled={adjusting}>
                {adjusting ? '处理中...' : '确认调整'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
