'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { 
  accountsApi, AccountBalance, AccountSummary, 
  ACCOUNT_TYPE_MAP, ACCOUNT_STATUS_MAP 
} from '@/lib/api/v3';
import { 
  Receipt, ArrowDownCircle, ArrowUpCircle, 
  CreditCard, BarChart3, Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function AccountsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { loadData(); }, [page, typeFilter, statusFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [accountsRes, summaryRes] = await Promise.all([
        accountsApi.list({ 
          page, 
          limit: 20, 
          balance_type: typeFilter || undefined,
          status: statusFilter || undefined 
        }),
        accountsApi.getSummary()
      ]);
      
      setAccounts(accountsRes.data);
      setTotal(accountsRes.total);
      setSummary(summaryRes);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => 
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(amount);

  if (loading && accounts.length === 0) {
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
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Receipt className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">往来账款</h1>
              <p className="text-sm text-slate-500">管理应收应付账款余额</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/statistics/accounts">
              <Button variant="outline">
                <BarChart3 className="w-4 h-4 mr-2" />
                往来分析
              </Button>
            </Link>
            <Link href="/payments">
              <Button variant="outline">
                <CreditCard className="w-4 h-4 mr-2" />
                资金流水
              </Button>
            </Link>
          </div>
        </div>

        {/* 汇总卡片 */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <div className="flex items-center gap-4">
                <div className="stat-card-icon bg-green-100">
                  <ArrowDownCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="stat-card-label">应收余额</p>
                  <p className="stat-card-value text-green-600">{formatAmount(summary.receivable_balance)}</p>
                </div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="flex items-center gap-4">
                <div className="stat-card-icon bg-orange-100">
                  <ArrowUpCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="stat-card-label">应付余额</p>
                  <p className="stat-card-value text-orange-600">{formatAmount(summary.payable_balance)}</p>
                </div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="flex items-center gap-4">
                <div className="stat-card-icon bg-slate-100">
                  <Wallet className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="stat-card-label">净往来</p>
                  <p className={`stat-card-value ${summary.receivable_balance - summary.payable_balance >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                    {formatAmount(summary.receivable_balance - summary.payable_balance)}
                  </p>
                </div>
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
                  <SelectItem value="receivable">应收账款</SelectItem>
                  <SelectItem value="payable">应付账款</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <label className="form-label">状态</label>
              <Select value={statusFilter || 'all'} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="partial">部分结算</SelectItem>
                  <SelectItem value="paid">已结清</SelectItem>
                </SelectContent>
              </Select>
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
                  <th>类型</th>
                  <th>客商</th>
                  <th>关联单号</th>
                  <th className="text-right">金额</th>
                  <th className="text-right">已付</th>
                  <th className="text-right">余额</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th className="text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account.id}>
                    <td>
                      <span className={`badge ${account.balance_type === 'receivable' ? 'badge-success' : 'badge-warning'}`}>
                        {account.type_display}
                      </span>
                    </td>
                    <td>
                      <div className="font-medium text-slate-900">{account.entity_name}</div>
                      <div className="text-xs text-slate-400">{account.entity_code}</div>
                    </td>
                    <td>
                      <Link href={`/orders/${account.order_id}`} className="text-amber-600 hover:text-amber-700 hover:underline text-sm">
                        {account.order_no}
                      </Link>
                    </td>
                    <td className="text-right font-medium text-slate-900">{formatAmount(account.amount)}</td>
                    <td className="text-right text-slate-500">{formatAmount(account.paid_amount)}</td>
                    <td className="text-right font-bold text-indigo-600">{formatAmount(account.balance)}</td>
                    <td>
                      <span className={`badge ${
                        account.status === 'paid' ? 'badge-success' : 
                        account.status === 'partial' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {account.status_display}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {new Date(account.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="text-center">
                      {account.status !== 'paid' && account.status !== 'cancelled' && account.balance > 0 && (
                        <Link href={`/payments/new?account_id=${account.id}&entity_id=${account.entity_id}&type=${account.balance_type === 'receivable' ? 'receive' : 'pay'}&amount=${account.balance}`}>
                          {account.balance_type === 'receivable' ? (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                              <ArrowDownCircle className="w-3 h-3 mr-1" />
                              收款
                            </Button>
                          ) : (
                            <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
                              <ArrowUpCircle className="w-3 h-3 mr-1" />
                              付款
                            </Button>
                          )}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {accounts.length === 0 && !loading && (
            <div className="empty-state">
              <Receipt className="empty-state-icon" />
              <p className="empty-state-text">暂无账款记录</p>
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
