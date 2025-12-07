'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, RefreshCw, Search, Building2, Users, Package,
  TrendingUp, ShoppingCart, Truck, Calendar, ChevronRight,
  BarChart3, FileText, Weight, DollarSign, Scale
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { entitiesApi, Entity } from '@/lib/api/v3';
import { API_BASE, getAuthHeaders, handleResponse } from '@/lib/api/v3/client';

interface EntityTrading {
  entity: {
    id: number;
    name: string;
    code: string;
    entity_type: string;
    contact_name?: string;
    phone?: string;
  };
  date_range: {
    start_date?: string;
    end_date?: string;
  };
  sales: {
    order_count: number;
    quantity: number;
    amount: number;
    profit: number;
    profit_rate: number;
    products: ProductStat[];
  };
  purchase: {
    order_count: number;
    quantity: number;
    amount: number;
    products: ProductStat[];
  };
  recent_orders: OrderStat[];
}

interface ProductStat {
  product_id: number;
  product_name: string;
  product_code: string;
  unit: string;
  quantity: number;
  amount: number;
  profit?: number;
  // 商品规格（如：中号、大号）
  specification?: string;
  // 包装规格信息（从 ProductSpec 获取）
  spec_name?: string;       // 包装规格名称：大件、小件
  container_name?: string;  // 容器名称：件、箱
  unit_quantity?: number;   // 每件数量：15
  base_unit_symbol?: string; // 基础单位：kg
}

interface OrderStat {
  id: number;
  order_no: string;
  order_type: string;
  type_display: string;
  quantity: number;
  amount: number;
  date: string;
}

// 日期快捷选项
const DATE_PRESETS = [
  { label: '本月', value: 'month' },
  { label: '近一季', value: 'quarter' },
  { label: '近半年', value: 'half_year' },
  { label: '近一年', value: 'year' },
];

export default function EntityTradingPage() {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [tradingData, setTradingData] = useState<EntityTrading | null>(null);
  const [activePreset, setActivePreset] = useState<string>('month');
  
  // 商品筛选 - 两级筛选：商品 + 商品规格
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedSpec, setSelectedSpec] = useState<string>('all');

  // 加载客商列表
  useEffect(() => {
    const loadEntities = async () => {
      try {
        const res = await entitiesApi.list({ limit: 100 });
        setEntities(res.data.filter(e => 
          e.entity_type.includes('customer') || e.entity_type.includes('supplier')
        ));
      } catch (err) {
        console.error('Failed to load entities:', err);
      }
    };
    loadEntities();
    
    // 默认日期：本月
    applyDatePreset('month');
  }, []);

  // 应用日期快捷选项
  const applyDatePreset = (preset: string) => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: Date;
    
    switch (preset) {
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'half_year':
        start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case 'year':
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
    setActivePreset(preset);
  };

  // 判断是客户还是供应商（或两者兼有）
  const entityRole = useMemo(() => {
    if (!tradingData) return null;
    const type = tradingData.entity.entity_type;
    const isCustomer = type.includes('customer');
    const isSupplier = type.includes('supplier');
    
    const hasSales = tradingData.sales.order_count > 0;
    const hasPurchase = tradingData.purchase.order_count > 0;
    
    if ((isCustomer && hasPurchase) || (isSupplier && hasSales)) {
      return 'both';
    }
    if (isCustomer || hasSales) return 'customer';
    if (isSupplier || hasPurchase) return 'supplier';
    return 'customer';
  }, [tradingData]);

  // 获取当前商品列表
  const currentProducts = useMemo(() => {
    if (!tradingData) return [];
    return entityRole === 'supplier' 
      ? tradingData.purchase.products 
      : tradingData.sales.products;
  }, [tradingData, entityRole]);

  // 唯一的商品列表（去重，用于商品筛选下拉框）
  const uniqueProducts = useMemo(() => {
    const productMap = new Map<number, { id: number; name: string; code: string }>();
    currentProducts.forEach(p => {
      if (!productMap.has(p.product_id)) {
        productMap.set(p.product_id, {
          id: p.product_id,
          name: p.product_name,
          code: p.product_code
        });
      }
    });
    return Array.from(productMap.values());
  }, [currentProducts]);

  // 选中商品的规格列表（商品规格，如：中号、大号）
  const productSpecs = useMemo(() => {
    if (selectedProductId === 'all') return [];
    const specs = currentProducts
      .filter(p => p.product_id.toString() === selectedProductId)
      .map(p => p.specification || '默认')
      .filter((v, i, arr) => arr.indexOf(v) === i); // 去重
    return specs;
  }, [currentProducts, selectedProductId]);

  // 当选择商品变化时，重置规格选择
  useEffect(() => {
    setSelectedSpec('all');
  }, [selectedProductId]);

  // 过滤后的商品列表
  const filteredProducts = useMemo(() => {
    let result = currentProducts;
    
    // 按商品ID筛选
    if (selectedProductId !== 'all') {
      result = result.filter(p => p.product_id.toString() === selectedProductId);
    }
    
    // 按商品规格筛选
    if (selectedSpec !== 'all') {
      result = result.filter(p => (p.specification || '默认') === selectedSpec);
    }
    
    return result;
  }, [currentProducts, selectedProductId, selectedSpec]);

  // 计算总重量（从有复式单位的商品汇总）
  const totalWeight = useMemo(() => {
    if (!currentProducts.length) return null;
    
    let weight = 0;
    let hasWeight = false;
    
    currentProducts.forEach(p => {
      if (p.unit_quantity && p.unit_quantity > 0 && p.base_unit_symbol) {
        weight += p.quantity * p.unit_quantity;
        hasWeight = true;
      } else if (p.unit === 'kg' || p.unit === '千克' || p.unit === '公斤') {
        weight += p.quantity;
        hasWeight = true;
      }
    });
    
    return hasWeight ? weight : null;
  }, [currentProducts]);

  // 查询交易数据
  const handleSearch = async () => {
    if (!selectedEntityId) {
      toast({ title: '请选择客商', variant: 'destructive' });
      return;
    }
    
    try {
      setLoading(true);
      setSelectedProductId('all'); // 重置筛选
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      
      let url: string;
      if (selectedEntityId === 'all_customers' || selectedEntityId === 'all_suppliers') {
        // 全部客户或全部供应商
        const entityType = selectedEntityId === 'all_customers' ? 'customer' : 'supplier';
        url = `${API_BASE}/statistics/entity-trading-summary/${entityType}?${params}`;
      } else {
        // 单个客商
        url = `${API_BASE}/statistics/entity-trading/${selectedEntityId}?${params}`;
      }
      
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await handleResponse<EntityTrading>(res);
      setTradingData(data);
    } catch (err: any) {
      toast({ title: '查询失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 格式化金额
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { 
      style: 'currency', 
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // 格式化数量（复式单位优先显示重量）
  const formatQuantityDisplay = (product: ProductStat) => {
    if (product.unit_quantity && product.unit_quantity > 1 && product.base_unit_symbol) {
      const totalWeight = product.quantity * product.unit_quantity;
      return (
        <div>
          <div className="font-semibold text-slate-900">
            {totalWeight.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} {product.base_unit_symbol}
          </div>
          <div className="text-xs text-slate-500">
            ({product.quantity.toLocaleString()} {product.container_name || '件'})
          </div>
        </div>
      );
    }
    return (
      <span className="font-medium text-slate-900">
        {product.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 
        <span className="text-slate-500 font-normal ml-1">{product.unit}</span>
      </span>
    );
  };

  // 获取实体类型标签
  const getEntityTypeLabel = (type: string) => {
    const isCustomer = type.includes('customer');
    const isSupplier = type.includes('supplier');
    if (isCustomer && isSupplier) return '客户/供应商';
    if (isCustomer) return '客户';
    if (isSupplier) return '供应商';
    return '其他';
  };

  // 获取当前统计数据
  const currentStats = entityRole === 'supplier' ? tradingData?.purchase : tradingData?.sales;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* 页面头部 */}
      <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/statistics" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">客商交易分析</h1>
                <p className="text-blue-100 text-sm">供货统计 · 采购统计 · 利润分析</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* 查询条件 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6">
          {/* 客商选择 */}
          <div className="mb-4">
            <label className="text-sm text-slate-600 block mb-1.5 font-medium">选择客商</label>
            <div className="flex gap-4">
              <div className="flex-1 max-w-md">
                <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择客户或供应商" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* 汇总选项 */}
                    <SelectItem value="all_customers">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-emerald-700">📊 全部客户</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="all_suppliers">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-orange-700">📊 全部供应商</span>
                      </div>
                    </SelectItem>
                    <div className="border-t border-slate-200 my-1" />
                    {/* 具体客商 */}
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id.toString()}>
                        <div className="flex items-center gap-2">
                          {e.entity_type.includes('customer') ? (
                            <Users className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Building2 className="w-4 h-4 text-purple-500" />
                          )}
                          <span>{e.name}</span>
                          <span className="text-slate-400 text-xs">({e.code})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 日期选择 */}
          <div className="flex flex-wrap items-end gap-4">
            {/* 快捷日期按钮 */}
            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">快捷选择</label>
              <div className="flex gap-1">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => applyDatePreset(preset.value)}
                    className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                      activePreset === preset.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义日期 */}
            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">开始日期</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setActivePreset(''); }}
                className="w-40"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1.5 font-medium">结束日期</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setActivePreset(''); }}
                className="w-40"
              />
            </div>

            <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 px-6" disabled={loading}>
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              查询
            </Button>
          </div>
        </div>

        {/* 查询结果 */}
        {tradingData && (
          <>
            {/* 客商信息 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  entityRole === 'customer' ? 'bg-emerald-100' : 
                  entityRole === 'supplier' ? 'bg-orange-100' : 'bg-blue-100'
                }`}>
                  {entityRole === 'customer' ? (
                    <TrendingUp className="w-7 h-7 text-emerald-600" />
                  ) : entityRole === 'supplier' ? (
                    <Truck className="w-7 h-7 text-orange-600" />
                  ) : (
                    <Building2 className="w-7 h-7 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-800">{tradingData.entity.name}</h2>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      entityRole === 'customer' ? 'bg-emerald-100 text-emerald-700' :
                      entityRole === 'supplier' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {getEntityTypeLabel(tradingData.entity.entity_type)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mt-1 flex items-center gap-4">
                    <span>编码：{tradingData.entity.code}</span>
                    <span>统计区间：{startDate} ~ {endDate}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 汇总卡片 */}
            {entityRole === 'both' ? (
              <>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> 销售给该客户
                  </h3>
                  <div className="grid grid-cols-5 gap-4">
                    <StatCard icon={FileText} label="订单数" value={`${tradingData.sales.order_count}笔`} color="emerald" />
                    <StatCard icon={Scale} label="销售重量" value={calculateProductsWeight(tradingData.sales.products)} color="emerald" />
                    <StatCard icon={DollarSign} label="金额" value={formatMoney(tradingData.sales.amount)} color="emerald" />
                    <StatCard icon={TrendingUp} label="利润" value={formatMoney(tradingData.sales.profit)} subtext={`利润率 ${tradingData.sales.profit_rate}%`} color="emerald" />
                  </div>
                </div>
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> 从该供应商采购
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <StatCard icon={FileText} label="订单数" value={`${tradingData.purchase.order_count}笔`} color="orange" />
                    <StatCard icon={Scale} label="采购重量" value={calculateProductsWeight(tradingData.purchase.products)} color="orange" />
                    <StatCard icon={DollarSign} label="金额" value={formatMoney(tradingData.purchase.amount)} color="orange" />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <StatCard 
                  icon={FileText} 
                  label="订单数" 
                  value={`${currentStats?.order_count || 0}笔`} 
                  color={entityRole === 'customer' ? 'emerald' : 'orange'} 
                />
                {totalWeight !== null && (
                  <StatCard 
                    icon={Scale} 
                    label={entityRole === 'customer' ? '销售重量' : '采购重量'}
                    value={`${totalWeight.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kg`} 
                    color={entityRole === 'customer' ? 'emerald' : 'orange'} 
                  />
                )}
                <StatCard 
                  icon={DollarSign} 
                  label={entityRole === 'customer' ? '销售金额' : '采购金额'}
                  value={formatMoney(currentStats?.amount || 0)} 
                  color={entityRole === 'customer' ? 'emerald' : 'orange'} 
                />
                {entityRole === 'customer' && tradingData.sales && (
                  <StatCard 
                    icon={TrendingUp} 
                    label="利润" 
                    value={formatMoney(tradingData.sales.profit)} 
                    subtext={`利润率 ${tradingData.sales.profit_rate}%`}
                    color="emerald" 
                  />
                )}
              </div>
            )}

            {/* 商品明细 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-slate-600" />
                  {entityRole === 'customer' ? '销售商品明细' : '采购商品明细'}
                  <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                    {filteredProducts.length}
                  </span>
                </h3>
                
                {/* 两级筛选：商品 + 规格 */}
                {uniqueProducts.length > 1 && (
                  <div className="flex items-center gap-2">
                    {/* 商品筛选 */}
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue placeholder="选择商品" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <span className="text-slate-600">全部商品</span>
                        </SelectItem>
                        {uniqueProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span>{p.name}</span>
                              <span className="text-xs text-slate-400">({p.code})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {/* 商品规格筛选（选中商品且有多种规格时显示） */}
                    {selectedProductId !== 'all' && productSpecs.length > 1 && (
                      <Select value={selectedSpec} onValueChange={setSelectedSpec}>
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue placeholder="选择规格" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            <span className="text-slate-600">全部规格</span>
                          </SelectItem>
                          {productSpecs.map((spec) => (
                            <SelectItem key={spec} value={spec}>
                              <span className="text-orange-600">{spec}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* 商品列表 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-4 text-xs font-semibold text-slate-600 uppercase">商品</th>
                      <th className="text-right p-4 text-xs font-semibold text-slate-600 uppercase">数量/重量</th>
                      <th className="text-right p-4 text-xs font-semibold text-slate-600 uppercase">金额</th>
                      {entityRole === 'customer' && (
                        <th className="text-right p-4 text-xs font-semibold text-slate-600 uppercase">利润</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-slate-500">
                          <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          暂无交易记录
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((product, idx) => (
                        <tr key={`${product.product_id}-${idx}`} className="hover:bg-slate-50/50">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                                <Package className="w-4 h-4 text-slate-500" />
                              </div>
                              <div>
                                <div className="font-medium text-slate-800">
                                  {product.product_name}
                                  {product.specification && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                                      {product.specification}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 flex items-center gap-2">
                                  {product.product_code}
                                  {product.spec_name && (
                                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                                      {product.spec_name}
                                    </span>
                                  )}
                                  {product.unit_quantity && product.unit_quantity > 1 && (
                                    <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                                      {product.container_name}({product.unit_quantity}{product.base_unit_symbol})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            {formatQuantityDisplay(product)}
                          </td>
                          <td className="p-4 text-right font-mono font-semibold text-slate-800">
                            {formatMoney(product.amount)}
                          </td>
                          {entityRole === 'customer' && (
                            <td className={`p-4 text-right font-mono font-semibold ${
                              (product.profit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {formatMoney(product.profit || 0)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 最近订单 */}
            {tradingData.recent_orders.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    近期订单
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {tradingData.recent_orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          order.order_type === 'sale' ? 'bg-emerald-100' : 'bg-orange-100'
                        }`}>
                          {order.order_type === 'sale' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ShoppingCart className="w-4 h-4 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 group-hover:text-blue-600">
                            {order.order_no}
                          </div>
                          <div className="text-xs text-slate-400">
                            {order.date} · {order.type_display}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold text-slate-800">{formatMoney(order.amount)}</div>
                          <div className="text-xs text-slate-400">{order.quantity.toLocaleString()}</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 空状态 */}
        {!tradingData && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">选择客商查看交易分析</h3>
            <p className="text-sm text-slate-400">
              选择客户或供应商，设置日期范围，查看详细的交易统计
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// 计算商品列表的总重量
function calculateProductsWeight(products: ProductStat[]): string {
  let weight = 0;
  let hasWeight = false;
  
  products.forEach(p => {
    if (p.unit_quantity && p.unit_quantity > 0 && p.base_unit_symbol) {
      weight += p.quantity * p.unit_quantity;
      hasWeight = true;
    } else if (p.unit === 'kg' || p.unit === '千克' || p.unit === '公斤') {
      weight += p.quantity;
      hasWeight = true;
    }
  });
  
  if (!hasWeight) return '-';
  return `${weight.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kg`;
}

// 统计卡片组件
function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  color: 'emerald' | 'orange' | 'blue';
}) {
  const colorStyles = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', value: 'text-emerald-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-500', value: 'text-orange-600' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-500', value: 'text-blue-600' },
  };
  const styles = colorStyles[color];
  
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <div className={`w-6 h-6 rounded-md ${styles.bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${styles.icon}`} />
        </div>
        {label}
      </div>
      <div className={`text-xl font-bold ${styles.value}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-slate-400 mt-1">{subtext}</div>
      )}
    </div>
  );
}
