'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { statisticsApi, DashboardData } from '@/lib/api/v3';
import { 
  Plus, TrendingUp, Truck, 
  BarChart3, ArrowDownCircle, ArrowUpCircle,
  Clock, ChevronRight, Sparkles, Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 获取仪表盘数据
      const dashboardData = await statisticsApi.getDashboard();
      setDashboard(dashboardData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0 }).format(amount);
  };

  const formatCompactAmount = (amount: number) => {
    if (amount >= 10000) {
      return `${(amount / 10000).toFixed(1)}万`;
    }
    return amount.toLocaleString();
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner mb-4"></div>
        <p className="text-slate-500">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-container">
        <p className="text-red-500">错误: {error}</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* 欢迎区域 */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
          <div>
              <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                <Sparkles className="w-4 h-4" />
                <span>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                {getGreeting()}
            </h1>
              <p className="text-amber-100 text-sm mt-1">欢迎使用财务中心</p>
            </div>
            <div className="hidden md:flex gap-2">
              <Link href="/orders/new?type=purchase">
                <Button className="bg-white/20 hover:bg-white/30 text-white border-0">
                  <Plus className="w-4 h-4 mr-1" />
                  新建采购
                </Button>
              </Link>
              <Link href="/orders/new?type=sale">
                <Button className="bg-white hover:bg-white/90 text-amber-600 border-0">
                  <Plus className="w-4 h-4 mr-1" />
                  新建销售
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {dashboard && (
          <>
            {/* 今日数据卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatCard 
                icon={<TrendingUp className="w-5 h-5" />}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                label="今日销售"
                value={formatAmount(dashboard.today_sales)}
                subValue={`${dashboard.today_sales_count} 笔订单`}
              />
              <StatCard 
                icon={<Truck className="w-5 h-5" />}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                label="今日采购"
                value={formatAmount(dashboard.today_purchase)}
                subValue={`${dashboard.today_purchase_count} 笔订单`}
              />
              <StatCard 
                icon={<ArrowDownCircle className="w-5 h-5" />}
                iconBg="bg-green-100"
                iconColor="text-green-600"
                label="今日收款"
                value={formatAmount(dashboard.today_received)}
                valueColor="text-green-600"
              />
              <StatCard 
                icon={<ArrowUpCircle className="w-5 h-5" />}
                iconBg="bg-orange-100"
                iconColor="text-orange-600"
                label="今日付款"
                value={formatAmount(dashboard.today_paid)}
                valueColor="text-orange-600"
              />
              <StatCard 
                icon={<Clock className="w-5 h-5" />}
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                label="待处理"
                value={`${dashboard.pending_orders} 单`}
                subValue={`草稿 ${dashboard.draft_orders} 单`}
              />
            </div>
              
            {/* 主要内容区 */}
            <div className="grid grid-cols-1 xl:grid-cols-5 lg:grid-cols-3 gap-6 mb-8">
              {/* 本月业务概览 */}
              <div className="xl:col-span-3 lg:col-span-2 card-base p-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="section-title">本月业务</h2>
                  <Link href="/statistics" className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1">
                    查看报表 <ChevronRight className="w-4 h-4" />
                  </Link>
              </div>
              
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-bold text-slate-900">{formatCompactAmount(dashboard.month_sales)}</p>
                    <p className="text-sm text-slate-500 mt-1">销售额</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-bold text-slate-900">{formatCompactAmount(dashboard.month_purchase)}</p>
                    <p className="text-sm text-slate-500 mt-1">采购额</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-bold text-slate-900">{dashboard.month_sales_count}</p>
                    <p className="text-sm text-slate-500 mt-1">销售单数</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-bold text-slate-900">{dashboard.month_purchase_count}</p>
                    <p className="text-sm text-slate-500 mt-1">采购单数</p>
              </div>
            </div>

            {/* 销售趋势图 */}
            {dashboard.sales_trend.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-600 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-slate-400" />
                  近7天销售趋势
                </h3>
                    <div className="flex items-end gap-2 h-28 px-2">
                  {dashboard.sales_trend.map((item, idx) => {
                    const maxAmount = Math.max(...dashboard.sales_trend.map(i => i.amount), 1);
                    const height = (item.amount / maxAmount) * 100;
                    return (
                          <div key={idx} className="flex-1 flex flex-col items-center group">
                            <div className="w-full relative">
                        <div 
                                className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-md transition-all group-hover:from-amber-600 group-hover:to-amber-500 cursor-pointer relative"
                                style={{ height: `${Math.max(height, 8)}%`, minHeight: '8px' }}
                              >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                  {formatAmount(item.amount)}
                                </div>
                              </div>
                            </div>
                            <span className="text-xs text-slate-400 mt-2">{item.date}</span>
                      </div>
                    );
                  })}
                </div>
        </div>
            )}
              </div>

              {/* 往来账款 */}
              <div className="xl:col-span-2 card-base p-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="section-title">往来账款</h2>
                  <Link href="/accounts" className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1">
                    详情 <ChevronRight className="w-4 h-4" />
              </Link>
        </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <ArrowDownCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                        <p className="text-sm text-green-700">应收余额</p>
                        <p className="text-xl font-bold text-green-600">{formatAmount(dashboard.total_receivable)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <ArrowUpCircle className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-orange-700">应付余额</p>
                        <p className="text-xl font-bold text-orange-600">{formatAmount(dashboard.total_payable)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                        <p className="text-sm text-slate-600">净往来</p>
                        <p className={`text-xl font-bold ${dashboard.total_receivable - dashboard.total_payable >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
                          {formatAmount(dashboard.total_receivable - dashboard.total_payable)}
                        </p>
                      </div>
                    </div>
                  </div>
            </div>
              </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// 获取问候语
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了';
}

// 统计卡片组件
function StatCard({ 
  icon, 
  iconBg, 
  iconColor, 
  label, 
  value, 
  subValue,
  valueColor = 'text-slate-900'
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon ${iconBg}`}>
        <div className={iconColor}>{icon}</div>
      </div>
      <p className="stat-card-label">{label}</p>
      <p className={`stat-card-value ${valueColor}`}>{value}</p>
      {subValue && <p className="stat-card-sub">{subValue}</p>}
    </div>
  );
}
