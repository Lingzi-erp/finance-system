'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Package, TrendingUp, TrendingDown, 
  Warehouse, DollarSign, RefreshCw, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { API_BASE, getAuthHeaders, handleResponse, categoriesApi } from '@/lib/api/v3';

interface ProductTradingItem {
  product_id: number;
  product_code: string;
  product_name: string;
  category_name: string;
  base_unit: string;
  purchase_qty: number;
  purchase_amount: number;
  sale_qty: number;
  sale_amount: number;
  profit: number;
  profit_rate: number;
  stock_qty: number;
  avg_purchase_price: number;
  avg_sale_price: number;
}

interface TradingSummary {
  total_products: number;
  total_purchase_qty: number;
  total_purchase_amount: number;
  total_sale_qty: number;
  total_sale_amount: number;
  total_profit: number;
  total_profit_rate: number;
  total_stock: number;
}

interface TradingData {
  items: ProductTradingItem[];
  summary: TradingSummary;
  date_range: { start_date: string | null; end_date: string | null };
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

export default function ProductTradingPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TradingData | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);

  // 加载分类列表
  useEffect(() => {
    categoriesApi.list().then(res => {
      setCategories(res.data || []);
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (search) params.set('search', search);
      if (categoryId && categoryId !== 'all') params.set('category_id', categoryId);
      
      const res = await fetch(`${API_BASE}/statistics/product-trading?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await handleResponse<TradingData>(res);
      setData(result);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const formatAmount = (value: number) => {
    return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatQty = (value: number, unit?: string) => {
    return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
  };

  // 智能单位转换：kg超过1000自动转换为t
  const formatWeight = (value: number, unit: string) => {
    if (unit === 'kg' && value >= 1000) {
      const tons = value / 1000;
      return { value: tons, unit: 't', display: `${tons.toLocaleString(undefined, { maximumFractionDigits: 2 })} t` };
    }
    return { value, unit, display: `${value.toLocaleString()} ${unit}` };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* 顶部区域 */}
      <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/statistics" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">商品进销统计</h1>
                <p className="text-indigo-100 text-sm">采购·销售·库存·毛利</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* 筛选区域 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-40">
              <label className="text-xs text-slate-500 block mb-1">开始日期</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="w-40">
              <label className="text-xs text-slate-500 block mb-1">结束日期</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="w-44">
              <label className="text-xs text-slate-500 block mb-1">商品分类</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.parent_id ? '└ ' : ''}{cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-xs text-slate-500 block mb-1">搜索商品</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  className="pl-9" 
                  placeholder="名称或编码..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
            </div>
            <Button onClick={loadData} disabled={loading}>
              {loading ? '查询中...' : '查询'}
            </Button>
          </div>
        </div>

        {/* 汇总卡片 */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">采购总额</p>
                  <p className="text-lg font-bold text-blue-600">{formatAmount(data.summary.total_purchase_amount)}</p>
                  <p className="text-xs text-slate-400">共 {formatQty(data.summary.total_purchase_qty)} 入库</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">销售总额</p>
                  <p className="text-lg font-bold text-green-600">{formatAmount(data.summary.total_sale_amount)}</p>
                  <p className="text-xs text-slate-400">共 {formatQty(data.summary.total_sale_qty)} 出库</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">毛利润</p>
                  <p className="text-lg font-bold text-amber-600">{formatAmount(data.summary.total_profit)}</p>
                  <p className="text-xs text-slate-400">综合毛利率 {data.summary.total_profit_rate}%</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Warehouse className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">当前库存</p>
                  <p className="text-lg font-bold text-purple-600">{data.summary.total_products} 种</p>
                  <p className="text-xs text-slate-400">合计 {formatQty(data.summary.total_stock)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 数据表格 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-3 font-medium text-slate-600">商品</th>
                  <th className="p-3 font-medium text-slate-600">采购数量</th>
                  <th className="p-3 font-medium text-slate-600">采购金额</th>
                  <th className="p-3 font-medium text-slate-600">销售数量</th>
                  <th className="p-3 font-medium text-slate-600">销售金额</th>
                  <th className="p-3 font-medium text-slate-600">毛利润</th>
                  <th className="p-3 font-medium text-slate-600">毛利率</th>
                  <th className="p-3 font-medium text-slate-600">库存</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">加载中...</td>
                  </tr>
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">暂无数据</td>
                  </tr>
                ) : (
                  data?.items.map(item => {
                    const purchaseDisplay = formatWeight(item.purchase_qty, item.base_unit);
                    const saleDisplay = formatWeight(item.sale_qty, item.base_unit);
                    const stockDisplay = formatWeight(item.stock_qty, item.base_unit);
                    return (
                      <tr key={item.product_id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                            <p className="text-xs text-slate-500">
                              {item.product_code}
                              {item.category_name && <span className="ml-1 px-1.5 py-0.5 bg-slate-100 rounded">{item.category_name}</span>}
                            </p>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-blue-600 font-medium">{purchaseDisplay.display}</span>
                        </td>
                        <td className="p-3 text-blue-600">{formatAmount(item.purchase_amount)}</td>
                        <td className="p-3">
                          <span className="text-green-600 font-medium">{saleDisplay.display}</span>
                        </td>
                        <td className="p-3 text-green-600">{formatAmount(item.sale_amount)}</td>
                        <td className="p-3">
                          <span className={item.profit >= 0 ? 'text-amber-600' : 'text-red-600'}>
                            {formatAmount(item.profit)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            item.profit_rate >= 20 ? 'bg-green-100 text-green-700' :
                            item.profit_rate >= 10 ? 'bg-amber-100 text-amber-700' :
                            item.profit_rate > 0 ? 'bg-slate-100 text-slate-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {item.profit_rate}%
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${item.stock_qty > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                            {stockDisplay.display}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

