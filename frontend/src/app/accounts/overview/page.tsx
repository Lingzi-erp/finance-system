'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, Building2, TrendingUp, TrendingDown, 
  ArrowLeft, RefreshCw, Search, AlertTriangle, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { accountsApi, EntityAccountOverview } from '@/lib/api/v3';


export default function AccountsOverviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<EntityAccountOverview[]>([]);
  const [total, setTotal] = useState(0);
  
  // 筛选
  const [balanceType, setBalanceType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 30;
  
  
  
  useEffect(() => {
    loadOverviewData();
  }, [balanceType, page]);
  
  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (balanceType && balanceType !== 'all') {
        params.balance_type = balanceType;
      }
      const res = await accountsApi.overview(params);
      setOverviewData(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  };
  
  // 统计
  const totalReceivable = overviewData
    .filter(d => d.balance_type === 'receivable')
    .reduce((sum, d) => sum + d.balance, 0);
  const totalPayable = overviewData
    .filter(d => d.balance_type === 'payable')
    .reduce((sum, d) => sum + d.balance, 0);
  const totalOverdue = overviewData.reduce((sum, d) => sum + d.overdue_amount, 0);
  
  // 搜索过滤
  const filteredData = search 
    ? overviewData.filter(d => 
        d.entity_name.toLowerCase().includes(search.toLowerCase()) ||
        d.entity_code.toLowerCase().includes(search.toLowerCase())
      )
    : overviewData;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Link href="/accounts">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">往来汇总</h1>
                <p className="text-sm text-slate-400">按客户/供应商汇总应收应付</p>
              </div>
            </div>
          </div>
          <Button onClick={loadOverviewData} variant="outline" disabled={loading} className="border-slate-600 text-slate-300">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        
        {/* 汇总卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 backdrop-blur border border-emerald-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span className="text-sm text-emerald-300">应收余额</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(totalReceivable)}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-orange-600/20 to-orange-800/20 backdrop-blur border border-orange-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <TrendingDown className="w-5 h-5 text-orange-400" />
              <span className="text-sm text-orange-300">应付余额</span>
            </div>
            <div className="text-2xl font-bold text-orange-400">
              {formatCurrency(totalPayable)}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 backdrop-blur border border-blue-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-blue-300">净往来</span>
            </div>
            <div className={`text-2xl font-bold ${totalReceivable - totalPayable >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {formatCurrency(totalReceivable - totalPayable)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {totalReceivable - totalPayable >= 0 ? '他人欠我' : '我欠他人'}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-red-600/20 to-red-800/20 backdrop-blur border border-red-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-sm text-red-300">逾期总额</span>
            </div>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(totalOverdue)}
            </div>
          </div>
        </div>
        
        {/* 筛选栏 */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="搜索往来单位..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          
          <div className="w-40">
            <Select value={balanceType} onValueChange={(v) => { setBalanceType(v); setPage(1); }}>
              <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="receivable">应收</SelectItem>
                <SelectItem value="payable">应付</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Link href="/accounts/aging">
            <Button variant="outline" className="border-slate-600 text-slate-300">
              账龄分析
            </Button>
          </Link>
        </div>
        
        {/* 列表 */}
        <div className="bg-slate-800/30 backdrop-blur border border-slate-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center text-slate-400 py-20">
              <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin" />
              加载中...
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center text-slate-400 py-20">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              暂无往来数据
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-slate-400">往来单位</th>
                    <th className="text-center p-4 text-sm font-medium text-slate-400">类型</th>
                    <th className="text-right p-4 text-sm font-medium text-slate-400">发生总额</th>
                    <th className="text-right p-4 text-sm font-medium text-slate-400">已结算</th>
                    <th className="text-right p-4 text-sm font-medium text-slate-400">余额</th>
                    <th className="text-right p-4 text-sm font-medium text-slate-400">逾期</th>
                    <th className="text-center p-4 text-sm font-medium text-slate-400">单据数</th>
                    <th className="text-center p-4 text-sm font-medium text-slate-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, index) => (
                    <tr 
                      key={`${item.entity_id}-${item.balance_type}`}
                      className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            item.entity_type.includes('customer') 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-orange-500/20 text-orange-400'
                          }`}>
                            {item.entity_type.includes('customer') 
                              ? <Users className="w-4 h-4" />
                              : <Building2 className="w-4 h-4" />
                            }
                          </div>
                          <div>
                            <div className="font-medium text-white">{item.entity_name}</div>
                            <div className="text-xs text-slate-500">{item.entity_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.balance_type === 'receivable'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-orange-500/20 text-orange-400'
                        }`}>
                          {item.balance_type_display}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-300">
                        {formatCurrency(item.total_amount)}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-400">
                        {formatCurrency(item.paid_amount)}
                      </td>
                      <td className="p-4 text-right">
                        <span className={`font-mono font-semibold ${
                          item.balance_type === 'receivable' ? 'text-emerald-400' : 'text-orange-400'
                        }`}>
                          {formatCurrency(item.balance)}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {item.overdue_amount > 0 ? (
                          <span className="font-mono text-red-400 flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {formatCurrency(item.overdue_amount)}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center text-slate-400">
                        {item.order_count}
                      </td>
                      <td className="p-4 text-center">
                        <Link href={`/accounts?entity_id=${item.entity_id}`}>
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white">
                            查看明细
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* 分页 */}
          {total > limit && (
            <div className="flex items-center justify-between p-4 border-t border-slate-700">
              <div className="text-sm text-slate-500">
                共 {total} 条记录
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="border-slate-600 text-slate-300"
                >
                  上一页
                </Button>
                <span className="px-3 py-1 text-sm text-slate-400">
                  {page} / {Math.ceil(total / limit)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => setPage(page + 1)}
                  className="border-slate-600 text-slate-300"
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

