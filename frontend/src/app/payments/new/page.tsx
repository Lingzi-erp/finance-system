'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { paymentsApi, entitiesApi, accountsApi, paymentMethodsApi, Entity, PaymentMethodSimple, AccountBalance } from '@/lib/api/v3';
import { CreditCard, ArrowLeft, Settings, ArrowDownCircle, ArrowUpCircle, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

function NewPaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSimple[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<AccountBalance | null>(null);
  
  // 从URL获取参数
  const accountIdParam = searchParams.get('account_id');
  const entityIdParam = searchParams.get('entity_id');
  const typeParam = searchParams.get('type');
  const amountParam = searchParams.get('amount');
  
  // 是否从账单跳转来的（有account_id参数）
  const isFromAccount = !!accountIdParam;
  
  const [formData, setFormData] = useState({
    entity_id: entityIdParam || '',
    account_balance_id: accountIdParam || '',
    payment_type: typeParam || 'receive',
    amount: amountParam || '',
    payment_method_id: '',
    payment_method: 'bank',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setDataLoading(true);
    try {
      const [entitiesRes, methodsRes] = await Promise.all([
        entitiesApi.list({ limit: 100 }),
        paymentMethodsApi.listSimple(true)
      ]);
      
      setEntities(entitiesRes.data.filter((e: Entity) => e.is_active !== false));
      setPaymentMethods(methodsRes);
      
      // 设置默认收付款方式
      const defaultMethod = methodsRes.find((m: PaymentMethodSimple) => !m.is_proxy);
      if (defaultMethod) {
        setFormData(prev => ({ 
          ...prev, 
          payment_method_id: defaultMethod.id.toString(),
          payment_method: defaultMethod.method_type 
        }));
      }
      
      // 如果有account_id，加载账单详情
      if (accountIdParam) {
        try {
          const accountRes = await accountsApi.get(parseInt(accountIdParam));
          setLinkedAccount(accountRes);
        } catch (err) {
          console.error('加载账单失败', err);
        }
      }
    } catch (err) {
      console.error('加载数据失败', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleMethodChange = (methodId: string) => {
    const method = paymentMethods.find(m => m.id.toString() === methodId);
    setFormData(prev => ({ 
      ...prev, 
      payment_method_id: methodId,
      payment_method: method?.method_type || 'other'
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.entity_id || !formData.amount) {
      toast({ title: '请填写必填字段', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      await paymentsApi.create({
        entity_id: parseInt(formData.entity_id),
        account_balance_id: formData.account_balance_id ? parseInt(formData.account_balance_id) : undefined,
        payment_type: formData.payment_type,
        amount: parseFloat(formData.amount),
        payment_method_id: formData.payment_method_id ? parseInt(formData.payment_method_id) : undefined,
        payment_method: formData.payment_method,
        payment_date: formData.payment_date,
        notes: formData.notes || undefined
      });
      
      toast({ title: formData.payment_type === 'receive' ? '收款成功' : '付款成功' });
      
      // 如果是从账单跳转来的，返回账款列表
      if (isFromAccount) {
        router.push('/accounts');
      } else {
        router.push('/payments');
      }
    } catch (err: any) {
      toast({ title: '操作失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 获取选中的收付款方式
  const selectedMethod = paymentMethods.find(m => m.id.toString() === formData.payment_method_id);
  
  // 获取选中的实体
  const selectedEntity = entities.find(e => e.id.toString() === formData.entity_id);
  
  // 主题配置
  const isReceive = formData.payment_type === 'receive';
  const themeColor = isReceive ? 'emerald' : 'orange';
  const themeGradient = isReceive 
    ? 'from-slate-50 to-emerald-50' 
    : 'from-slate-50 to-orange-50';
  const themeBorder = isReceive ? 'border-emerald-200' : 'border-orange-200';
  const themeIcon = isReceive 
    ? <ArrowDownCircle className="w-8 h-8 text-emerald-600" />
    : <ArrowUpCircle className="w-8 h-8 text-orange-600" />;

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);

  if (dataLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themeGradient}`}>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href={isFromAccount ? "/accounts" : "/payments"}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              {themeIcon}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isFromAccount 
                    ? (isReceive ? '账单收款' : '账单付款')
                    : (isReceive ? '新建收款' : '新建付款')
                  }
                </h1>
                <p className="text-sm text-gray-500">
                  {isReceive ? '记录客户付款' : '记录向供应商/物流/冷库付款'}
                </p>
              </div>
            </div>
          </div>
          <Link href="/payment-methods">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-1" />
              管理方式
            </Button>
          </Link>
        </div>

        {/* 关联账单信息 */}
        {isFromAccount && linkedAccount && (
          <div className={`bg-white rounded-xl shadow-sm border ${themeBorder} p-4 mb-4`}>
            <div className="flex items-start gap-3">
              <FileText className={`w-5 h-5 mt-0.5 ${isReceive ? 'text-emerald-600' : 'text-orange-600'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">关联账单</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">订单号：</span>
                    <span className="font-medium">{linkedAccount.order_no || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">类型：</span>
                    <span className={`font-medium ${isReceive ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {linkedAccount.type_display}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">账单金额：</span>
                    <span className="font-medium">{formatCurrency(linkedAccount.amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">待{isReceive ? '收' : '付'}：</span>
                    <span className={`font-bold ${isReceive ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {formatCurrency(linkedAccount.balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 表单 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 收付款类型选择 - 仅手动模式显示 */}
            {!isFromAccount && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">收付款类型 *</label>
                <div className="flex gap-4">
                  <label className={`flex-1 p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.payment_type === 'receive' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input 
                      type="radio" 
                      name="payment_type" 
                      value="receive"
                      checked={formData.payment_type === 'receive'}
                      onChange={e => setFormData(prev => ({ ...prev, payment_type: e.target.value }))}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <div className="text-2xl mb-1">💰</div>
                      <div className="font-medium text-emerald-700">收款</div>
                      <div className="text-xs text-gray-500">客户付给我们</div>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.payment_type === 'pay' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input 
                      type="radio" 
                      name="payment_type" 
                      value="pay"
                      checked={formData.payment_type === 'pay'}
                      onChange={e => setFormData(prev => ({ ...prev, payment_type: e.target.value }))}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <div className="text-2xl mb-1">💸</div>
                      <div className="font-medium text-orange-700">付款</div>
                      <div className="text-xs text-gray-500">我们付给供应商</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 实体信息 - 账单模式只读显示，手动模式可选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isReceive ? '付款方（客户）' : '收款方'} *
              </label>
              {isFromAccount && selectedEntity ? (
                <div className="h-10 flex items-center px-3 bg-gray-50 border border-gray-200 rounded-md">
                  <span className="font-medium text-gray-900">{selectedEntity.name}</span>
                  <span className="ml-2 text-gray-500 text-sm">({selectedEntity.code})</span>
                </div>
              ) : (
                <Select 
                  value={formData.entity_id} 
                  onValueChange={v => setFormData(prev => ({ ...prev, entity_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择实体" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities
                      .filter(e => {
                        const type = e.entity_type || '';
                        if (formData.payment_type === 'receive') {
                          return type.includes('customer');
                        } else {
                          return !type.includes('customer');
                        }
                      })
                      .map(entity => (
                        <SelectItem key={entity.id} value={entity.id.toString()}>
                          {entity.name} ({entity.code})
                        </SelectItem>
                      ))
                    }
                    {/* 如果筛选后为空，显示所有实体 */}
                    {entities.filter(e => {
                      const type = e.entity_type || '';
                      if (formData.payment_type === 'receive') {
                        return type.includes('customer');
                      } else {
                        return !type.includes('customer');
                      }
                    }).length === 0 && 
                      entities.map(entity => (
                        <SelectItem key={entity.id} value={entity.id.toString()}>
                          {entity.name} ({entity.code})
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 金额 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isReceive ? '收款' : '付款'}金额 *
                {isFromAccount && linkedAccount && (
                  <span className="ml-2 text-gray-400 font-normal">
                    （待{isReceive ? '收' : '付'}：{formatCurrency(linkedAccount.balance)}）
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">¥</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={isFromAccount && linkedAccount ? linkedAccount.balance : undefined}
                  placeholder="输入金额"
                  value={formData.amount}
                  onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="text-2xl font-bold pl-8 h-14"
                />
              </div>
              {isFromAccount && linkedAccount && parseFloat(formData.amount || '0') > linkedAccount.balance && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  金额不能超过待{isReceive ? '收' : '付'}余额
                </p>
              )}
            </div>

            {/* 收付款方式 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isReceive ? '收款' : '付款'}方式
                {paymentMethods.length === 0 && (
                  <Link href="/payment-methods" className="text-emerald-600 text-xs ml-2 hover:underline">
                    去创建
                  </Link>
                )}
              </label>
              {paymentMethods.length > 0 ? (
                <Select 
                  value={formData.payment_method_id} 
                  onValueChange={handleMethodChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择收付款方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(method => (
                      <SelectItem key={method.id} value={method.id.toString()}>
                        <span className="flex items-center gap-2">
                          <span>{method.icon}</span>
                          <span>{method.display_name}</span>
                          {method.is_proxy && method.proxy_balance !== 0 && (
                            <span className={`text-xs ${method.proxy_balance > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              (余额: ¥{method.proxy_balance})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select 
                  value={formData.payment_method} 
                  onValueChange={v => setFormData(prev => ({ ...prev, payment_method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">现金</SelectItem>
                    <SelectItem value="bank">银行转账</SelectItem>
                    <SelectItem value="wechat">微信</SelectItem>
                    <SelectItem value="alipay">支付宝</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              {/* 代收账户提示 */}
              {selectedMethod?.is_proxy && (
                <p className="text-xs text-purple-600 mt-1">
                  💡 这是代收账户，{isReceive ? '收款' : '付款'}后将自动更新代收余额
                </p>
              )}
            </div>

            {/* 日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isReceive ? '收款' : '付款'}日期
              </label>
              <Input
                type="date"
                value={formData.payment_date}
                onChange={e => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>

            {/* 备注 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
              <Input
                placeholder="可选，填写备注信息"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-4 pt-4">
              <Link href={isFromAccount ? "/accounts" : "/payments"} className="flex-1">
                <Button type="button" variant="outline" className="w-full">取消</Button>
              </Link>
              <Button 
                type="submit" 
                className={`flex-1 ${isReceive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                disabled={loading || (isFromAccount && linkedAccount && parseFloat(formData.amount || '0') > linkedAccount.balance)}
              >
                {loading ? '处理中...' : (isReceive ? '确认收款' : '确认付款')}
              </Button>
            </div>
          </form>
        </div>

        {/* 手动模式提示 */}
        {!isFromAccount && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              💡 <strong>提示：</strong>这是手动{isReceive ? '收款' : '付款'}模式，不关联具体账单。
              如需关联账单，请从 <Link href="/accounts" className="underline">往来账款</Link> 页面点击对应账单的{isReceive ? '收款' : '付款'}按钮。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-screen"><p>加载中...</p></div>}>
      <NewPaymentForm />
    </Suspense>
  );
}
