'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { History, Search, Filter, ArrowLeft, Building2, Package, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { stocksApi, StockFlow, entitiesApi, Entity, STOCK_FLOW_TYPE_MAP } from '@/lib/api/v3';

export default function FlowsHistoryPage() {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [flows, setFlows] = useState<StockFlow[]>([]);
  const [warehouses, setWarehouses] = useState<Entity[]>([]);
  
  // 筛选条件
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [flowType, setFlowType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  
  // 分页
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // 加载流水数据
  const loadFlows = useCallback(async (
    currentPage: number,
    filters: {
      warehouseId: string;
      flowType: string;
      dateFrom: string;
      dateTo: string;
      search: string;
    }
  ) => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit,
      };
      if (filters.warehouseId !== 'all') params.warehouse_id = parseInt(filters.warehouseId);
      if (filters.flowType !== 'all') params.flow_type = filters.flowType;
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.search) params.search = filters.search;
      
      const res = await stocksApi.getAllFlows(params);
      setFlows(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // 初始加载
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await entitiesApi.list({ limit: 100, entity_type: 'warehouse' });
        setWarehouses(res.data);
      } catch (err) {
        console.error('Failed to load warehouses:', err);
      }
    };
    loadWarehouses();
    loadFlows(1, { warehouseId: 'all', flowType: 'all', dateFrom: '', dateTo: '', search: '' });
  }, [loadFlows]);

  // 页码变化时重新加载
  useEffect(() => {
    if (page > 1) {
      loadFlows(page, { warehouseId, flowType, dateFrom, dateTo, search });
    }
  }, [page, warehouseId, flowType, dateFrom, dateTo, search, loadFlows]);

  // 筛选
  const handleFilter = () => {
    setPage(1);
    loadFlows(1, { warehouseId, flowType, dateFrom, dateTo, search });
  };

  // 重置
  const handleReset = () => {
    setWarehouseId('all');
    setFlowType('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setPage(1);
    loadFlows(1, { warehouseId: 'all', flowType: 'all', dateFrom: '', dateTo: '', search: '' });
  };

  // 刷新
  const handleRefresh = () => {
    loadFlows(page, { warehouseId, flowType, dateFrom, dateTo, search });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      {/* 页面头部 */}
      <div className="bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/statistics" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">库存流水查询</h1>
                <p className="text-violet-200 text-sm">查询所有仓库的入库、出库、调整记录</p>
              </div>
            </div>
            <Button onClick={handleRefresh} variant="secondary" size="sm" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* 筛选栏 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">仓库</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
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

            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">流水类型</label>
              <Select value={flowType} onValueChange={setFlowType}>
                <SelectTrigger>
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="in">入库</SelectItem>
                  <SelectItem value="out">出库</SelectItem>
                  <SelectItem value="adjust">调整</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">开始日期</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">结束日期</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="商品/单号/原因..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleFilter} className="flex-1 bg-violet-600 hover:bg-violet-700">
                <Filter className="w-4 h-4 mr-2" />
                筛选
              </Button>
              <Button onClick={handleReset} variant="outline">
                重置
              </Button>
            </div>
          </div>
        </div>

        {/* 流水列表 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {loading && flows.length === 0 ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-violet-500 mx-auto mb-3 animate-spin" />
              <p className="text-slate-500">加载中...</p>
            </div>
          ) : flows.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">暂无流水记录</p>
              <p className="text-sm text-slate-400 mt-1">调整筛选条件试试</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">时间</th>
                      <th className="text-left p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">仓库</th>
                      <th className="text-left p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">商品</th>
                      <th className="text-center p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">类型</th>
                      <th className="text-right p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">变动</th>
                      <th className="text-right p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">变动后</th>
                      <th className="text-left p-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">原因/单号</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {flows.map((flow) => (
                      <tr key={flow.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-sm text-slate-600 whitespace-nowrap">
                          {new Date(flow.operated_at).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-700">{flow.warehouse_name}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-slate-400" />
                            <span className="text-sm text-slate-700 font-medium">{flow.product_name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            flow.flow_type === 'in' ? 'bg-emerald-100 text-emerald-700' :
                            flow.flow_type === 'out' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {flow.type_display}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-mono text-sm font-semibold ${
                          flow.quantity_change > 0 ? 'text-emerald-600' : 
                          flow.quantity_change < 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}>
                          {flow.quantity_change > 0 ? '+' : ''}{flow.quantity_change}
                        </td>
                        <td className="p-4 text-right font-mono text-sm text-slate-800">
                          {flow.quantity_after}
                        </td>
                        <td className="p-4 text-sm text-slate-600 max-w-[200px] truncate" title={flow.reason || flow.order_no || '-'}>
                          {flow.order_no ? (
                            <Link href={`/orders/${flow.order_id}`} className="text-violet-600 hover:text-violet-800 hover:underline">
                              {flow.order_no}
                            </Link>
                          ) : (
                            flow.reason || '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50/50">
                  <div className="text-sm text-slate-500">
                    共 <span className="font-medium text-slate-700">{total}</span> 条记录，
                    第 <span className="font-medium text-slate-700">{page}</span>/<span className="font-medium text-slate-700">{totalPages}</span> 页
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
