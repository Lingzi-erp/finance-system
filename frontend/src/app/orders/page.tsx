'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { ordersApi, BusinessOrder, ORDER_TYPE_MAP, ORDER_STATUS_MAP } from '@/lib/api/v3';
import { FileText, Plus, Search, Eye, Trash2, ArrowRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function OrdersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const canCreate = true;
  const canDeleteDraft = true;
  const isAdmin = true;

  useEffect(() => { loadOrders(); }, [page, search, typeFilter, statusFilter, startDate, endDate]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await ordersApi.list({ 
        page, 
        limit: 20, 
        search: search || undefined, 
        order_type: typeFilter || undefined, 
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setOrders(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除吗？')) return;
    try { 
      await ordersApi.delete(id); 
      toast({ title: '删除成功' }); 
      loadOrders(); 
    }
    catch (err: any) { 
      toast({ title: '删除失败', description: err.message, variant: 'destructive' }); 
    }
  };

  const formatAmount = (amount: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  if (loading && orders.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner mb-4"></div>
        <p className="text-slate-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">进销单据</h1>
              <p className="text-sm text-slate-500">采购、销售单据管理</p>
            </div>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              <Link href="/orders/new?type=purchase">
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  采购单
                </Button>
              </Link>
              <Link href="/orders/new?type=sale">
                <Button>
                  <Plus className="w-4 h-4 mr-1" />
                  销售单
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* 筛选栏 */}
        <div className="filter-panel">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label">搜索单号</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="搜索单号..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
              </div>
            </div>
            <div className="w-36">
              <label className="form-label">类型</label>
              <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="purchase">采购</SelectItem>
                  <SelectItem value="sale">销售</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="form-label">状态</label>
              <Select value={statusFilter || 'all'} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="form-label">开始日期</label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => { setStartDate(e.target.value); setPage(1); }} 
              />
            </div>
            <div className="w-36">
              <label className="form-label">结束日期</label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => { setEndDate(e.target.value); setPage(1); }} 
              />
            </div>
            <div className="text-sm text-slate-500 self-end pb-2">共 {total} 条</div>
          </div>
        </div>

        {/* 数据表格 */}
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>单号</th>
                  <th>类型</th>
                  <th>来源 → 目标</th>
                  <th>数量</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/orders/${order.id}`} className="font-medium text-amber-600 hover:text-amber-700 hover:underline">
                        {order.order_no}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${ORDER_TYPE_MAP[order.order_type]?.color || 'badge-neutral'}`}>
                        {order.type_display}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-slate-700">{order.source_name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-slate-700">{order.target_name}</span>
                      </div>
                    </td>
                    <td className="text-slate-600">{order.total_quantity}</td>
                    <td className="font-medium text-slate-900">{formatAmount(order.final_amount)}</td>
                    <td>
                      <span className={`badge ${ORDER_STATUS_MAP[order.status]?.color || 'badge-neutral'}`}>
                        {order.status_display}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {/* 采购单显示装货日期，销售单显示卸货日期 */}
                      {order.order_type === 'purchase' 
                        ? (order.loading_date ? new Date(order.loading_date).toLocaleDateString('zh-CN') : '-')
                        : (order.unloading_date ? new Date(order.unloading_date).toLocaleDateString('zh-CN') : '-')
                      }
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        {(isAdmin || (order.status === 'draft' && canDeleteDraft)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(order.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {orders.length === 0 && !loading && (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="empty-state-text">暂无单据</p>
            {canCreate && (
              <Link href="/orders/new">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />创建第一笔业务
                </Button>
              </Link>
            )}
          </div>
        )}
        
        {/* 分页 */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <span className="px-4 py-2 text-sm text-slate-500">
              第 {page} 页 / 共 {Math.ceil(total / 20)} 页
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
