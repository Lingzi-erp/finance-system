'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { 
  ArrowLeft, RefreshCw, FileText, Building2, Users,
  ArrowDownRight, ArrowUpRight, Calendar, ChevronRight,
  Wallet, CheckCircle2, Clock, Receipt
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { accountsApi, AccountBalance, entitiesApi, Entity } from '@/lib/api/v3';

export default function EntityStatementPage() {
  const { entityId } = useParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [summary, setSummary] = useState<{
    entity_id: number;
    receivable_balance: number;
    payable_balance: number;
    net_balance: number;
  } | null>(null);

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      const id = parseInt(entityId as string);
      
      // 并行加载实体信息、账款明细和汇总
      const [entityRes, accountsRes, summaryRes] = await Promise.all([
        entitiesApi.get(id),
        accountsApi.list({ entity_id: id, limit: 100 }),
        accountsApi.getEntitySummary(id)
      ]);
      
      setEntity(entityRes);
      setAccounts(accountsRes.data || []);
      setSummary(summaryRes);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      loadData();
    }
  }, [entityId]);

  // 格式化金额
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { 
      style: 'currency', 
      currency: 'CNY',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 获取实体图标
  const getEntityIcon = () => {
    if (!entity) return <Building2 className="w-6 h-6 text-slate-600" />;
    
    if (entity.entity_type.includes('customer')) {
      return <Users className="w-6 h-6 text-blue-600" />;
    }
    return <Building2 className="w-6 h-6 text-purple-600" />;
  };

  // 获取实体类型标签
  const getEntityTypeLabel = () => {
    if (!entity) return '';
    if (entity.entity_type.includes('customer')) return '客户';
    if (entity.entity_type.includes('supplier')) return '供应商';
    if (entity.entity_type.includes('logistics')) return '物流公司';
    if (entity.entity_type.includes('warehouse')) return '仓库';
    return '其他';
  };

  // 按时间排序账款
  const sortedAccounts = [...accounts].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // 分离应收应付
  const receivables = sortedAccounts.filter(a => a.balance_type === 'receivable' && a.balance > 0);
  const payables = sortedAccounts.filter(a => a.balance_type === 'payable' && a.balance > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* 页面头部 */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/statistics/accounts-overview" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">往来对账单</h1>
                <p className="text-emerald-100 text-sm">
                  {loading ? '加载中...' : entity?.name || '未知客商'}
                </p>
              </div>
            </div>
            <Button onClick={loadData} variant="secondary" size="sm" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* 客商信息卡片 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  entity?.entity_type.includes('customer') ? 'bg-blue-100' :
                  entity?.entity_type.includes('supplier') ? 'bg-purple-100' :
                  entity?.entity_type.includes('logistics') ? 'bg-cyan-100' :
                  entity?.entity_type.includes('warehouse') ? 'bg-amber-100' : 'bg-slate-100'
                }`}>
                  {getEntityIcon()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-800">{entity?.name}</h2>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                      {getEntityTypeLabel()}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mt-1 flex items-center gap-4">
                    <span>编码：{entity?.code}</span>
                    {entity?.contact_name && <span>联系人：{entity.contact_name}</span>}
                    {entity?.phone && <span>电话：{entity.phone}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* 往来汇总 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
              {/* 应收余额 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <ArrowDownRight className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-sm text-slate-600">应收余额</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatMoney(summary?.receivable_balance || 0)}
                </div>
              </div>

              {/* 应付余额 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-slate-600">应付余额</span>
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  {formatMoney(summary?.payable_balance || 0)}
                </div>
              </div>

              {/* 净额 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    (summary?.net_balance || 0) >= 0 ? 'bg-blue-100' : 'bg-rose-100'
                  }`}>
                    <Wallet className={`w-5 h-5 ${
                      (summary?.net_balance || 0) >= 0 ? 'text-blue-600' : 'text-rose-600'
                    }`} />
                  </div>
                  <span className="text-sm text-slate-600">净余额</span>
                </div>
                <div className={`text-2xl font-bold ${
                  (summary?.net_balance || 0) >= 0 ? 'text-blue-600' : 'text-rose-600'
                }`}>
                  {(summary?.net_balance || 0) >= 0 ? '+' : ''}{formatMoney(summary?.net_balance || 0)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {(summary?.net_balance || 0) >= 0 ? '应收 > 应付' : '应付 > 应收'}
                </div>
              </div>
            </div>

            {/* 账款明细 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  未结账款明细
                </h3>
              </div>

              {sortedAccounts.filter(a => a.balance > 0).length === 0 ? (
                <div className="py-16 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">账款已结清</p>
                  <p className="text-sm text-slate-400 mt-1">与该客商的所有账款都已处理完毕</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedAccounts.filter(a => a.balance > 0).map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          account.balance_type === 'receivable' ? 'bg-emerald-100' : 'bg-orange-100'
                        }`}>
                          {account.balance_type === 'receivable' ? (
                            <ArrowDownRight className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-2">
                            <Link 
                              href={`/orders/${account.order_id}`}
                              className="hover:text-emerald-600 hover:underline"
                            >
                              {account.order_no}
                            </Link>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              account.balance_type === 'receivable' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {account.type_display}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              account.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              account.status === 'partial' ? 'bg-blue-100 text-blue-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {account.status_display}
                            </span>
                          </div>
                          <div className="text-sm text-slate-500 mt-1 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(account.created_at)}
                            </span>
                            {account.due_date && (
                              <span className={`flex items-center gap-1 ${
                                new Date(account.due_date) < new Date() ? 'text-red-500' : ''
                              }`}>
                                <Clock className="w-3.5 h-3.5" />
                                到期 {formatDate(account.due_date)}
                                {new Date(account.due_date) < new Date() && ' (已逾期)'}
                              </span>
                            )}
                            {account.notes && (
                              <span className="text-slate-400">备注：{account.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          account.balance_type === 'receivable' ? 'text-emerald-600' : 'text-orange-600'
                        }`}>
                          {formatMoney(account.balance)}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          原{formatMoney(account.amount)} / 已收付{formatMoney(account.paid_amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 已结清账款 */}
            {sortedAccounts.filter(a => a.balance === 0 && a.status === 'paid').length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-500 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-slate-400" />
                    已结清账款
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 opacity-60">
                  {sortedAccounts.filter(a => a.balance === 0 && a.status === 'paid').slice(0, 5).map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <div>
                          <Link 
                            href={`/orders/${account.order_id}`}
                            className="text-sm text-slate-600 hover:text-emerald-600 hover:underline"
                          >
                            {account.order_no}
                          </Link>
                          <span className="text-xs text-slate-400 ml-2">
                            {formatDate(account.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {formatMoney(account.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

