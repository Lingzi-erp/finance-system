'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { 
  paymentMethodsApi, entitiesApi,
  PaymentMethod, PaymentMethodCreate, PaymentMethodUpdate,
  Entity, PAYMENT_METHOD_TYPES
} from '@/lib/api/v3';
import { 
  CreditCard, Plus, Edit, Trash2, Check, X, 
  Building2, Users, Star, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function PaymentMethodsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  
  // 编辑/新建弹窗
  const [showForm, setShowForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [formData, setFormData] = useState<PaymentMethodCreate>({
    name: '',
    method_type: 'bank',
    account_no: '',
    account_name: '',
    bank_name: '',
    is_proxy: false,
    proxy_entity_id: undefined,
    notes: '',
    is_default: false,
    sort_order: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [page, typeFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [methodsRes, entitiesRes] = await Promise.all([
        paymentMethodsApi.list({ 
          page, 
          page_size: 20, 
          method_type: typeFilter || undefined,
          is_active: undefined  // 显示全部
        }),
        entitiesApi.list({ limit: 100 })
      ]);
      
      setMethods(methodsRes.data);
      setTotal(methodsRes.total);
      setEntities(entitiesRes.data);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingMethod(null);
    setFormData({
      name: '',
      method_type: 'bank',
      account_no: '',
      account_name: '',
      bank_name: '',
      is_proxy: false,
      proxy_entity_id: undefined,
      notes: '',
      is_default: false,
      sort_order: methods.length,
    });
    setShowForm(true);
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      name: method.name,
      method_type: method.method_type,
      account_no: method.account_no || '',
      account_name: method.account_name || '',
      bank_name: method.bank_name || '',
      is_proxy: method.is_proxy,
      proxy_entity_id: method.proxy_entity_id,
      notes: method.notes || '',
      is_default: method.is_default,
      sort_order: method.sort_order,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个收付款方式吗？')) return;
    try {
      await paymentMethodsApi.delete(id);
      toast({ title: '删除成功' });
      loadData();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (method: PaymentMethod) => {
    try {
      await paymentMethodsApi.update(method.id, { is_active: !method.is_active });
      toast({ title: method.is_active ? '已禁用' : '已启用' });
      loadData();
    } catch (err: any) {
      toast({ title: '操作失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: '请输入名称', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      if (editingMethod) {
        await paymentMethodsApi.update(editingMethod.id, formData as PaymentMethodUpdate);
        toast({ title: '更新成功' });
      } else {
        await paymentMethodsApi.create(formData);
        toast({ title: '创建成功' });
      }
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleInitDefaults = async () => {
    try {
      const res = await paymentMethodsApi.initDefaults();
      toast({ title: res.message, description: res.created > 0 ? `创建了 ${res.created} 种方式` : undefined });
      loadData();
    } catch (err: any) {
      toast({ title: '初始化失败', description: err.message, variant: 'destructive' });
    }
  };

  const formatAmount = (amount: number) => 
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(amount);

  if (loading && methods.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">收付款方式</h1>
              <p className="text-sm text-gray-500">管理银行账户、微信、支付宝、代收账户等</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/payments">
              <Button variant="outline">收付款记录</Button>
            </Link>
            {methods.length === 0 && (
              <Button variant="outline" onClick={handleInitDefaults}>
                初始化默认方式
              </Button>
            )}
            <Button onClick={handleNew}>
              <Plus className="w-4 h-4 mr-2" />
              新增方式
            </Button>
          </div>
        </div>

        {/* 筛选区域 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-40">
              <label className="text-sm text-gray-600 block mb-1">类型</label>
              <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(PAYMENT_METHOD_TYPES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.icon} {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-500">共 {total} 种收付款方式</div>
          </div>
        </div>

        {/* 方式列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map(method => (
            <div 
              key={method.id} 
              className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative ${!method.is_active ? 'opacity-60' : ''}`}
            >
              {/* 默认标记 */}
              {method.is_default && (
                <div className="absolute top-3 right-3">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
              )}
              
              {/* 图标和名称 */}
              <div className="flex items-start gap-3 mb-3">
                <div className="text-3xl">{method.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{method.name}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${PAYMENT_METHOD_TYPES[method.method_type]?.color || 'bg-gray-100'}`}>
                    {method.type_display}
                  </span>
                </div>
              </div>
              
              {/* 详细信息 */}
              <div className="space-y-1 text-sm text-gray-600 mb-4">
                {method.bank_name && (
                  <p className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {method.bank_name}
                  </p>
                )}
                {method.account_no && (
                  <p>账号：{method.account_no}</p>
                )}
                {method.account_name && (
                  <p>户名：{method.account_name}</p>
                )}
                {method.is_proxy && (
                  <div className="flex items-center gap-1 text-purple-600">
                    <Users className="w-4 h-4" />
                    <span>代收人：{method.proxy_entity_name || '未指定'}</span>
                  </div>
                )}
                {method.is_proxy && method.proxy_balance !== 0 && (
                  <p className={`font-medium ${method.proxy_balance > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    代收余额：{formatAmount(method.proxy_balance)}
                  </p>
                )}
                {method.notes && (
                  <p className="text-gray-400 truncate">备注：{method.notes}</p>
                )}
              </div>
              
              {/* 操作按钮 */}
              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleToggleActive(method)}
                  className={method.is_active ? 'text-gray-500' : 'text-green-600'}
                >
                  {method.is_active ? '禁用' : '启用'}
                </Button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(method)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500"
                    onClick={() => handleDelete(method.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {methods.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">还没有收付款方式</h3>
            <p className="text-gray-500 mb-4">创建收付款方式来记录您的银行账户、微信、支付宝等</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={handleInitDefaults}>
                初始化默认方式
              </Button>
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4 mr-2" />
                新增方式
              </Button>
            </div>
          </div>
        )}

        {/* 分页 */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              上一页
            </Button>
            <span className="px-4 py-2 text-sm text-gray-600">
              第 {page} 页 / 共 {Math.ceil(total / 20)} 页
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 编辑/新建弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">
                {editingMethod ? '编辑收付款方式' : '新增收付款方式'}
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                <Input
                  placeholder="如：工商银行尾号1234"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              {/* 类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">类型 *</label>
                <Select 
                  value={formData.method_type} 
                  onValueChange={v => setFormData(prev => ({ ...prev, method_type: v, is_proxy: v === 'proxy' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_TYPES).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        {val.icon} {val.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* 银行名称（银行类型时显示） */}
              {formData.method_type === 'bank' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">银行名称</label>
                  <Input
                    placeholder="如：中国工商银行"
                    value={formData.bank_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  />
                </div>
              )}
              
              {/* 账号 */}
              {formData.method_type !== 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.method_type === 'bank' ? '卡号（可填后4位）' : '账号'}
                  </label>
                  <Input
                    placeholder="如：1234"
                    value={formData.account_no || ''}
                    onChange={e => setFormData(prev => ({ ...prev, account_no: e.target.value }))}
                  />
                </div>
              )}
              
              {/* 账户名 */}
              {formData.method_type !== 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">账户名</label>
                  <Input
                    placeholder="如：张三"
                    value={formData.account_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                  />
                </div>
              )}
              
              {/* 代收人（代收类型时显示） */}
              {(formData.method_type === 'proxy' || formData.is_proxy) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">代收人实体</label>
                  <Select 
                    value={formData.proxy_entity_id?.toString() || ''} 
                    onValueChange={v => setFormData(prev => ({ ...prev, proxy_entity_id: v ? parseInt(v) : undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择代收人" />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.filter(e => !e.entity_type.includes('warehouse')).map(entity => (
                        <SelectItem key={entity.id} value={entity.id.toString()}>
                          {entity.name} ({entity.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    选择帮您代收代付的人，方便追踪代收余额
                  </p>
                </div>
              )}
              
              {/* 是否代收（非proxy类型时显示切换） */}
              {formData.method_type !== 'proxy' && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_proxy"
                    checked={formData.is_proxy}
                    onChange={e => setFormData(prev => ({ ...prev, is_proxy: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <label htmlFor="is_proxy" className="text-sm text-gray-700">
                    这是代收账户（别人帮我代收的钱）
                  </label>
                </div>
              )}
              
              {/* 是否默认 */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={e => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">
                  设为默认收付款方式
                </label>
              </div>
              
              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <Input
                  placeholder="可选"
                  value={formData.notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

