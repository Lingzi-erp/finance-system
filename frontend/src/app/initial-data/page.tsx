'use client';

import { useState, useEffect } from 'react';
import { 
  Database, Package, CreditCard, Plus, Trash2, 
  Loader2, AlertTriangle, CheckCircle, Building2, 
  Users, Warehouse, ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { initialDataApi, InitialDataSummary } from '@/lib/api/v3/initial-data';
import { entitiesApi, Entity } from '@/lib/api/v3/entities';
import { productsApi, Product } from '@/lib/api/v3/products';

type TabType = 'stock' | 'account';

export default function InitialDataPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('stock');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<InitialDataSummary | null>(null);
  
  // 期初库存相关
  const [warehouses, setWarehouses] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockList, setStockList] = useState<any[]>([]);
  const [stockForm, setStockForm] = useState({
    warehouse_id: '',
    product_id: '',
    quantity: '',
    notes: ''
  });
  
  // 期初账款相关
  const [customers, setCustomers] = useState<Entity[]>([]);
  const [suppliers, setSuppliers] = useState<Entity[]>([]);
  const [accountList, setAccountList] = useState<any[]>([]);
  const [accountForm, setAccountForm] = useState({
    entity_id: '',
    balance_type: 'receivable' as 'receivable' | 'payable',
    amount: '',
    notes: ''
  });

  // 加载数据
  useEffect(() => {
    loadSummary();
    loadEntities();
    loadProducts();
    loadStockList();
    loadAccountList();
  }, []);

  const loadSummary = async () => {
    try {
      const data = await initialDataApi.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('加载汇总失败', err);
    }
  };

  const loadEntities = async () => {
    try {
      const warehouseRes = await entitiesApi.list({ entity_type: 'warehouse', limit: 100 });
      setWarehouses(warehouseRes.data);
      
      const customerRes = await entitiesApi.list({ entity_type: 'customer', limit: 100 });
      setCustomers(customerRes.data);
      
      const supplierRes = await entitiesApi.list({ entity_type: 'supplier', limit: 100 });
      setSuppliers(supplierRes.data);
    } catch (err) {
      console.error('加载实体失败', err);
    }
  };

  const loadProducts = async () => {
    try {
      // 后端限制最大100，分页加载所有商品
      let allProducts: Product[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const res = await productsApi.list({ page, limit: 100, is_active: true });
        allProducts = [...allProducts, ...res.data];
        hasMore = allProducts.length < res.total;
        page++;
      }
      
      setProducts(allProducts);
    } catch (err) {
      console.error('加载商品失败', err);
    }
  };

  const loadStockList = async () => {
    try {
      const res = await initialDataApi.listStocks();
      setStockList(res.data);
    } catch (err) {
      console.error('加载库存失败', err);
    }
  };

  const loadAccountList = async () => {
    try {
      const res = await initialDataApi.listAccounts();
      setAccountList(res.data);
    } catch (err) {
      console.error('加载账款失败', err);
    }
  };

  // 提交期初库存
  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockForm.warehouse_id || !stockForm.product_id || !stockForm.quantity) {
      toast({ title: '请填写完整', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      await initialDataApi.createStock({
        warehouse_id: parseInt(stockForm.warehouse_id),
        product_id: parseInt(stockForm.product_id),
        quantity: parseFloat(stockForm.quantity),
        notes: stockForm.notes || undefined
      });
      toast({ title: '录入成功' });
      setStockForm({ warehouse_id: '', product_id: '', quantity: '', notes: '' });
      loadStockList();
      loadSummary();
    } catch (err: any) {
      toast({ title: '录入失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 提交期初账款
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.entity_id || !accountForm.amount) {
      toast({ title: '请填写完整', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      await initialDataApi.createAccount({
        entity_id: parseInt(accountForm.entity_id),
        balance_type: accountForm.balance_type,
        amount: parseFloat(accountForm.amount),
        notes: accountForm.notes || undefined
      });
      toast({ title: '录入成功' });
      setAccountForm({ entity_id: '', balance_type: 'receivable', amount: '', notes: '' });
      loadAccountList();
      loadSummary();
    } catch (err: any) {
      toast({ title: '录入失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 删除期初账款
  const handleDeleteAccount = async (id: number) => {
    if (!confirm('确定要删除这条期初账款吗？')) return;
    
    try {
      await initialDataApi.deleteAccount(id);
      toast({ title: '删除成功' });
      loadAccountList();
      loadSummary();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  // 获取可选的实体列表
  const getEntityOptions = () => {
    if (accountForm.balance_type === 'receivable') {
      return customers;
    }
    return suppliers;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-emerald-100 rounded-xl">
            <Database className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">期初数据录入</h1>
            <p className="text-sm text-gray-500">录入系统启用前的历史库存和账款数据</p>
          </div>
        </div>

        {/* 汇总卡片 */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-gray-600">期初库存</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{summary.stock.count} <span className="text-sm font-normal text-gray-500">条记录</span></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-2">
                <ArrowDownCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600">期初应收</span>
              </div>
              <div className="text-2xl font-bold text-green-600">¥{summary.receivable.total_balance.toLocaleString()}</div>
              <div className="text-xs text-gray-400">{summary.receivable.count} 条记录</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-2">
                <ArrowUpCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm text-gray-600">期初应付</span>
              </div>
              <div className="text-2xl font-bold text-red-600">¥{summary.payable.total_balance.toLocaleString()}</div>
              <div className="text-xs text-gray-400">{summary.payable.count} 条记录</div>
            </div>
          </div>
        )}

        {/* 提示信息 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">使用说明</p>
              <p className="text-sm text-amber-700 mt-1">
                期初数据用于记录系统启用前的历史数据。录入期初库存后，系统会自动更新库存数量；录入期初账款后，会自动更新客户/供应商的欠款余额。
              </p>
            </div>
          </div>
        </div>

        {/* 标签页切换 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'stock'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            期初库存
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'account'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <CreditCard className="w-4 h-4 inline mr-2" />
            期初账款
          </button>
        </div>

        {/* 期初库存 */}
        {activeTab === 'stock' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 录入表单 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                录入期初库存
              </h3>
              <form onSubmit={handleStockSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">仓库 *</label>
                  <select
                    value={stockForm.warehouse_id}
                    onChange={e => setStockForm({ ...stockForm, warehouse_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  >
                    <option value="">选择仓库</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">商品 *</label>
                  <select
                    value={stockForm.product_id}
                    onChange={e => setStockForm({ ...stockForm, product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  >
                    <option value="">选择商品</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.specification ? ` [${p.specification}]` : ''} ({p.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={stockForm.quantity}
                    onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="输入期初数量"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text"
                    value={stockForm.notes}
                    onChange={e => setStockForm({ ...stockForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="可选"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  录入
                </Button>
              </form>
            </div>

            {/* 已录入列表 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-blue-600" />
                已录入库存
              </h3>
              {stockList.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">暂无数据</p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {stockList.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.product_name}
                          {item.product_specification && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                              {item.product_specification}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{item.warehouse_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-emerald-600">{item.quantity}</div>
                        <div className="text-xs text-gray-400">{item.product_code}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 期初账款 */}
        {activeTab === 'account' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 录入表单 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                录入期初账款
              </h3>
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">账款类型 *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="balance_type"
                        value="receivable"
                        checked={accountForm.balance_type === 'receivable'}
                        onChange={() => setAccountForm({ ...accountForm, balance_type: 'receivable', entity_id: '' })}
                        className="mr-2"
                      />
                      <span className="text-green-600 font-medium">应收账款</span>
                      <span className="text-xs text-gray-500 ml-1">(客户欠我们)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="balance_type"
                        value="payable"
                        checked={accountForm.balance_type === 'payable'}
                        onChange={() => setAccountForm({ ...accountForm, balance_type: 'payable', entity_id: '' })}
                        className="mr-2"
                      />
                      <span className="text-red-600 font-medium">应付账款</span>
                      <span className="text-xs text-gray-500 ml-1">(我们欠供应商)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {accountForm.balance_type === 'receivable' ? '客户' : '供应商'} *
                  </label>
                  <select
                    value={accountForm.entity_id}
                    onChange={e => setAccountForm({ ...accountForm, entity_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  >
                    <option value="">选择{accountForm.balance_type === 'receivable' ? '客户' : '供应商'}</option>
                    {getEntityOptions().map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">期初余额 *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={accountForm.amount}
                      onChange={e => setAccountForm({ ...accountForm, amount: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="输入期初余额"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <input
                    type="text"
                    value={accountForm.notes}
                    onChange={e => setAccountForm({ ...accountForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="可选，如：上年度结转"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  录入
                </Button>
              </form>
            </div>

            {/* 已录入列表 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                已录入账款
              </h3>
              {accountList.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">暂无数据</p>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {accountList.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {item.balance_type === 'receivable' ? (
                          <Users className="w-5 h-5 text-green-600" />
                        ) : (
                          <Building2 className="w-5 h-5 text-red-600" />
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{item.entity_name}</div>
                          <div className="text-sm text-gray-500">{item.balance_type_display}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`font-semibold ${item.balance_type === 'receivable' ? 'text-green-600' : 'text-red-600'}`}>
                            ¥{item.balance.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">{item.entity_code}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteAccount(item.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

