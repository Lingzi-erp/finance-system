'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { 
  paymentsApi, PaymentRecord, PaymentSummary,
  PAYMENT_TYPE_MAP, PAYMENT_METHOD_MAP 
} from '@/lib/api/v3';
import { 
  CreditCard, Plus, ArrowDownCircle, ArrowUpCircle,
  Trash2, Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

export default function PaymentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => { loadData(); }, [page, typeFilter, methodFilter, startDate, endDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [paymentsRes, summaryRes] = await Promise.all([
        paymentsApi.list({ 
          page, 
          limit: 20, 
          payment_type: typeFilter || undefined,
          payment_method: methodFilter || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined
        }),
        paymentsApi.getSummary()
      ]);
      
      setPayments(paymentsRes.data);
      setTotal(paymentsRes.total);
      setSummary(summaryRes);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条收付款记录吗？相关账款状态将被回滚。')) return;
    try {
      await paymentsApi.delete(id);
      toast({ title: '删除成功' });
      loadData();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  const formatAmount = (amount: number) => 
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  // 格式化大金额，超过1万用"万"为单位
  const formatLargeAmount = (amount: number) => {
    if (Math.abs(amount) >= 10000) {
      return `¥${(amount / 10000).toFixed(2)}万`;
    }
    return formatAmount(amount);
  };

  if (loading && payments.length === 0) {
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
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">资金流水</h1>
              <p className="text-sm text-slate-500">管理收款和付款记录</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/accounts">
              <Button variant="outline">往来账款</Button>
            </Link>
            <Link href="/payment-methods">
              <Button variant="outline">收付款方式</Button>
            </Link>
            <Link href="/payments/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                新建收付款
              </Button>
            </Link>
          </div>
        </div>

        {/* 汇总卡片 - 分两行显示，更清晰 */}
        {summary && (
          <div className="space-y-4 mb-6">
            {/* 第一行：今日数据 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-card flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ArrowDownCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="stat-card-label">今日收款</p>
                  <p className="text-xl font-bold text-green-600 truncate" title={formatAmount(summary.today_received)}>
                    {formatLargeAmount(summary.today_received)}
                  </p>
                </div>
              </div>
              <div className="stat-card flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ArrowUpCircle className="w-6 h-6 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="stat-card-label">今日付款</p>
                  <p className="text-xl font-bold text-orange-600 truncate" title={formatAmount(summary.today_paid)}>
                    {formatLargeAmount(summary.today_paid)}
                  </p>
                </div>
              </div>
            </div>
            
            {/* 第二行：本月和累计数据 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stat-card">
                <p className="stat-card-label">本月收款</p>
                <p className="text-lg font-bold text-green-600 truncate" title={formatAmount(summary.month_received)}>
                  {formatLargeAmount(summary.month_received)}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card-label">本月付款</p>
                <p className="text-lg font-bold text-orange-600 truncate" title={formatAmount(summary.month_paid)}>
                  {formatLargeAmount(summary.month_paid)}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card-label">累计收款</p>
                <p className="text-lg font-bold text-slate-700 truncate" title={formatAmount(summary.total_received)}>
                  {formatLargeAmount(summary.total_received)}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-card-label">累计付款</p>
                <p className="text-lg font-bold text-slate-700 truncate" title={formatAmount(summary.total_paid)}>
                  {formatLargeAmount(summary.total_paid)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 筛选区域 */}
        <div className="filter-panel">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-36">
              <label className="form-label">类型</label>
              <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="receive">收款</SelectItem>
                  <SelectItem value="pay">付款</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="form-label">支付方式</label>
              <Select value={methodFilter || 'all'} onValueChange={v => { setMethodFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部方式</SelectItem>
                  <SelectItem value="cash">现金</SelectItem>
                  <SelectItem value="bank">银行转账</SelectItem>
                  <SelectItem value="wechat">微信</SelectItem>
                  <SelectItem value="alipay">支付宝</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="form-label">开始日期</label>
              <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
            </div>
            <div className="w-36">
              <label className="form-label">结束日期</label>
              <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
            </div>
            <div className="text-sm text-slate-500">共 {total} 条记录</div>
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
                  <th>客商</th>
                  <th>金额</th>
                  <th>支付方式</th>
                  <th>关联单号</th>
                  <th>日期</th>
                  <th>操作人</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td className="font-medium text-slate-900">{payment.payment_no}</td>
                    <td>
                      <span className={`badge ${payment.payment_type === 'receive' ? 'badge-success' : 'badge-warning'}`}>
                        {payment.type_display}
                      </span>
                    </td>
                    <td>
                      <div className="font-medium text-slate-900">{payment.entity_name}</div>
                      <div className="text-xs text-slate-400">{payment.entity_code}</div>
                    </td>
                    <td>
                      <span className={`font-bold ${payment.payment_type === 'receive' ? 'text-green-600' : 'text-orange-600'}`}>
                        {payment.payment_type === 'receive' ? '+' : '-'}{formatAmount(payment.amount)}
                      </span>
                    </td>
                    <td className="text-slate-600">{payment.method_display}</td>
                    <td>
                      {payment.order_no && payment.order_id ? (
                        <Link 
                          href={`/orders/${payment.order_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {payment.order_no}
                        </Link>
                      ) : payment.order_no ? (
                        <span className="text-slate-600">{payment.order_no}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="text-slate-500">
                      {new Date(payment.payment_date).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="text-slate-500">{payment.creator_name}</td>
                    <td>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(payment.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {payments.length === 0 && !loading && (
            <div className="empty-state">
              <CreditCard className="empty-state-icon" />
              <p className="empty-state-text">暂无收付款记录</p>
              <Link href="/payments/new">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  新建收付款
                </Button>
              </Link>
            </div>
          )}
        </div>

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
