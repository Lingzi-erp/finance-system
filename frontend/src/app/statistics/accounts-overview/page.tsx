'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Users, Building2,
  AlertTriangle, ChevronRight, Wallet, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { accountsApi, AccountSummary, EntityAccountOverview } from '@/lib/api/v3';

export default function AccountsOverviewPage() {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [receivableList, setReceivableList] = useState<EntityAccountOverview[]>([]);
  const [payableList, setPayableList] = useState<EntityAccountOverview[]>([]);
  const [activeTab, setActiveTab] = useState<'receivable' | 'payable'>('receivable');

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      
      // 并行加载汇总和明细
      const [summaryRes, receivableRes, payableRes] = await Promise.all([
        accountsApi.getSummary(),
        accountsApi.getOverviewByEntity({ balance_type: 'receivable', limit: 50 }),
        accountsApi.getOverviewByEntity({ balance_type: 'payable', limit: 50 })
      ]);
      
      setSummary(summaryRes);
      setReceivableList(receivableRes.data || []);
      setPayableList(payableRes.data || []);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 格式化金额
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { 
      style: 'currency', 
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // 净欠款计算
  const netBalance = (summary?.receivable_balance || 0) - (summary?.payable_balance || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* 页面头部 */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/statistics" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">快捷对账</h1>
                <p className="text-emerald-100 text-sm">应收应付 · 客商汇总 · 快速查询</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {loading && !summary ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* 核心指标卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {/* 应收（别人欠我） */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                    <ArrowDownRight className="w-6 h-6 text-white" />
                  </div>
                  {(summary?.overdue_receivable || 0) > 0 && (
                    <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      逾期 {formatMoney(summary?.overdue_receivable || 0)}
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-500 mb-1">应收账款</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {formatMoney(summary?.receivable_balance || 0)}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  累计应收 {formatMoney(summary?.total_receivable || 0)}
                </div>
              </div>

              {/* 应付（我欠别人） */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                    <ArrowUpRight className="w-6 h-6 text-white" />
                  </div>
                  {(summary?.overdue_payable || 0) > 0 && (
                    <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      逾期 {formatMoney(summary?.overdue_payable || 0)}
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-500 mb-1">应付账款</div>
                <div className="text-3xl font-bold text-orange-600">
                  {formatMoney(summary?.payable_balance || 0)}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  累计应付 {formatMoney(summary?.total_payable || 0)}
                </div>
              </div>

              {/* 净欠款 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                    netBalance >= 0 
                      ? 'bg-gradient-to-br from-blue-400 to-indigo-500 shadow-blue-200' 
                      : 'bg-gradient-to-br from-rose-400 to-pink-500 shadow-rose-200'
                  }`}>
                    {netBalance >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-white" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-500 mb-1">
                  {netBalance >= 0 ? '净应收' : '净应付'}
                </div>
                <div className={`text-3xl font-bold ${netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  {netBalance >= 0 ? '+' : ''}{formatMoney(Math.abs(netBalance))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  应收 - 应付 = 净额
                </div>
              </div>
            </div>

            {/* 明细列表 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Tab 切换 */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('receivable')}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors relative ${
                    activeTab === 'receivable' 
                      ? 'text-emerald-600 bg-emerald-50/50' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ArrowDownRight className="w-4 h-4" />
                    应收账款
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'receivable' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {receivableList.length}
                    </span>
                  </div>
                  {activeTab === 'receivable' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('payable')}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors relative ${
                    activeTab === 'payable' 
                      ? 'text-orange-600 bg-orange-50/50' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    应付账款
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'payable' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {payableList.length}
                    </span>
                  </div>
                  {activeTab === 'payable' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                  )}
                </button>
              </div>

              {/* 列表内容 */}
              <div className="divide-y divide-slate-100">
                {(activeTab === 'receivable' ? receivableList : payableList).length === 0 ? (
                  <div className="py-16 text-center">
                    <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">
                      {activeTab === 'receivable' ? '暂无应收账款' : '暂无应付账款'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">账款已结清</p>
                  </div>
                ) : (
                  (activeTab === 'receivable' ? receivableList : payableList)
                    .filter(item => item.balance > 0)
                    .sort((a, b) => b.balance - a.balance)
                    .map((item) => (
                      <Link
                        key={`${item.entity_id}-${item.balance_type}`}
                        href={`/statistics/accounts-overview/${item.entity_id}`}
                        className="flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                            item.entity_type === 'customer' ? 'bg-blue-100' :
                            item.entity_type === 'supplier' ? 'bg-purple-100' :
                            item.entity_type === 'logistics' ? 'bg-cyan-100' :
                            item.entity_type === 'warehouse' ? 'bg-amber-100' : 'bg-slate-100'
                          }`}>
                            {item.entity_type === 'customer' ? (
                              <Users className={`w-5 h-5 text-blue-600`} />
                            ) : (
                              <Building2 className={`w-5 h-5 ${
                                item.entity_type === 'supplier' ? 'text-purple-600' :
                                item.entity_type === 'logistics' ? 'text-cyan-600' :
                                item.entity_type === 'warehouse' ? 'text-amber-600' : 'text-slate-600'
                              }`} />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 group-hover:text-slate-900">
                              {item.entity_name}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                              <span>{item.entity_code}</span>
                              <span>·</span>
                              <span>{item.order_count} 笔订单</span>
                              {item.overdue_amount > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-600 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    逾期 {formatMoney(item.overdue_amount)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-lg font-bold ${
                              activeTab === 'receivable' ? 'text-emerald-600' : 'text-orange-600'
                            }`}>
                              {formatMoney(item.balance)}
                            </div>
                            <div className="text-xs text-slate-400">
                              已收/付 {formatMoney(item.paid_amount)}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </Link>
                    ))
                )}
              </div>
            </div>

            {/* 底部提示 */}
            <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
              <p className="text-sm text-emerald-700">
                💡 点击客商可查看详细对账单
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

