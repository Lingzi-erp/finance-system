'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Clock, TrendingUp, TrendingDown, AlertTriangle, 
  ArrowLeft, RefreshCw, Filter, Building2, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { accountsApi, AgingAnalysis, entitiesApi, Entity } from '@/lib/api/v3';


export default function AgingAnalysisPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'receivable' | 'payable'>('receivable');
  const [agingData, setAgingData] = useState<AgingAnalysis | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  
  // 切换应收/应付时重置选中的往来单位
  const handleTabChange = (tab: 'receivable' | 'payable') => {
    setActiveTab(tab);
    setSelectedEntity('all');
  };
  
  
  
  useEffect(() => {
    loadAgingData();
    loadEntities();
  }, []);
  
  useEffect(() => {
    loadAgingData();
  }, [activeTab, selectedEntity]);
  
  const loadEntities = async () => {
    try {
      const res = await entitiesApi.list({ limit: 100 });
      setEntities(res.data);
    } catch (err) {
      console.error('Failed to load entities:', err);
    }
  };
  
  const loadAgingData = async () => {
    setLoading(true);
    try {
      const params: any = { account_type: activeTab };
      if (selectedEntity && selectedEntity !== 'all') {
        params.entity_id = parseInt(selectedEntity);
      }
      const data = await accountsApi.aging(params);
      setAgingData(data);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
  };
  
  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'bg-emerald-500';
      case '1_30': return 'bg-yellow-500';
      case '31_60': return 'bg-orange-500';
      case '61_90': return 'bg-red-500';
      case 'over_90': return 'bg-red-700';
      default: return 'bg-gray-500';
    }
  };
  
  const totalAmount = agingData ? (activeTab === 'receivable' ? agingData.total_receivable : agingData.total_payable) || 0 : 0;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
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
              <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">账龄分析</h1>
                <p className="text-sm text-slate-400">分析应收应付账款的账龄分布</p>
              </div>
            </div>
          </div>
          <Button onClick={loadAgingData} variant="outline" disabled={loading} className="border-slate-600 text-slate-300">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        
        {/* 类型切换 & 筛选 */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => handleTabChange('receivable')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'receivable' 
                  ? 'bg-emerald-600 text-white' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              应收账龄
            </button>
            <button
              onClick={() => handleTabChange('payable')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'payable' 
                  ? 'bg-orange-600 text-white' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              应付账龄
            </button>
          </div>
          
          <div className="w-64">
            <Select value={selectedEntity} onValueChange={setSelectedEntity}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="全部往来单位" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部往来单位</SelectItem>
                {entities.filter(e => 
                  activeTab === 'receivable' 
                    ? e.entity_type.includes('customer')
                    : e.entity_type.includes('supplier')
                ).map((e) => (
                  <SelectItem key={e.id} value={e.id.toString()}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {loading ? (
          <div className="text-center text-slate-400 py-20">
            <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin" />
            加载中...
          </div>
        ) : agingData ? (
          <>
            {/* 汇总卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                <div className="text-sm text-slate-400 mb-2">
                  {activeTab === 'receivable' ? '应收总额' : '应付总额'}
                </div>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(totalAmount)}
                </div>
              </div>
              
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                <div className="text-sm text-slate-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  逾期金额
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {formatCurrency(agingData.total_overdue)}
                </div>
              </div>
              
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                <div className="text-sm text-slate-400 mb-2">逾期率</div>
                <div className="text-3xl font-bold text-amber-400">
                  {agingData.overdue_rate.toFixed(1)}%
                </div>
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full"
                    style={{ width: `${Math.min(agingData.overdue_rate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            {/* 账龄分布图表 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-6">账龄分布</h3>
              
              <div className="flex gap-2 mb-4">
                {Object.entries(agingData.summary).map(([key, bucket]) => {
                  const percentage = totalAmount > 0 ? (bucket.amount / totalAmount) * 100 : 0;
                  return (
                    <div 
                      key={key}
                      className={`${getAgingColor(key)} rounded-lg transition-all hover:opacity-80`}
                      style={{ 
                        width: `${Math.max(percentage, 2)}%`, 
                        minWidth: bucket.amount > 0 ? '60px' : '0'
                      }}
                    >
                      {bucket.amount > 0 && (
                        <div className="p-3 text-white text-center">
                          <div className="text-xs opacity-80">{bucket.label}</div>
                          <div className="text-sm font-semibold">{percentage.toFixed(1)}%</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="grid grid-cols-5 gap-4 mt-6">
                {Object.entries(agingData.summary).map(([key, bucket]) => (
                  <div key={key} className="text-center">
                    <div className={`w-3 h-3 ${getAgingColor(key)} rounded-full mx-auto mb-2`} />
                    <div className="text-xs text-slate-400">{bucket.label}</div>
                    <div className="text-sm font-semibold text-white mt-1">
                      {formatCurrency(bucket.amount)}
                    </div>
                    <div className="text-xs text-slate-500">{bucket.count} 笔</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 明细表格 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  {activeTab === 'receivable' ? <Users className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  {activeTab === 'receivable' ? '客户' : '供应商'}账龄明细
                </h3>
              </div>
              
              {agingData.details.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  暂无数据
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th className="text-left p-4 text-sm font-medium text-slate-400">往来单位</th>
                        <th className="text-right p-4 text-sm font-medium text-emerald-400">未到期</th>
                        <th className="text-right p-4 text-sm font-medium text-yellow-400">1-30天</th>
                        <th className="text-right p-4 text-sm font-medium text-orange-400">31-60天</th>
                        <th className="text-right p-4 text-sm font-medium text-red-400">61-90天</th>
                        <th className="text-right p-4 text-sm font-medium text-red-600">90天以上</th>
                        <th className="text-right p-4 text-sm font-medium text-white">合计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.details.map((detail) => (
                        <tr key={detail.entity_id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                          <td className="p-4">
                            <div className="font-medium text-white">{detail.entity_name}</div>
                            <div className="text-xs text-slate-500">{detail.entity_code}</div>
                          </td>
                          <td className="p-4 text-right font-mono text-emerald-400">
                            {detail.current > 0 ? formatCurrency(detail.current) : '-'}
                          </td>
                          <td className="p-4 text-right font-mono text-yellow-400">
                            {detail['1_30'] > 0 ? formatCurrency(detail['1_30']) : '-'}
                          </td>
                          <td className="p-4 text-right font-mono text-orange-400">
                            {detail['31_60'] > 0 ? formatCurrency(detail['31_60']) : '-'}
                          </td>
                          <td className="p-4 text-right font-mono text-red-400">
                            {detail['61_90'] > 0 ? formatCurrency(detail['61_90']) : '-'}
                          </td>
                          <td className="p-4 text-right font-mono text-red-600">
                            {detail.over_90 > 0 ? formatCurrency(detail.over_90) : '-'}
                          </td>
                          <td className="p-4 text-right font-mono font-semibold text-white">
                            {formatCurrency(detail.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-900/50 border-t border-slate-600">
                      <tr>
                        <td className="p-4 font-semibold text-white">合计</td>
                        <td className="p-4 text-right font-mono font-semibold text-emerald-400">
                          {formatCurrency(agingData.summary.current.amount)}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-yellow-400">
                          {formatCurrency(agingData.summary['1_30'].amount)}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-orange-400">
                          {formatCurrency(agingData.summary['31_60'].amount)}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-red-400">
                          {formatCurrency(agingData.summary['61_90'].amount)}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-red-600">
                          {formatCurrency(agingData.summary.over_90.amount)}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-white">
                          {formatCurrency(totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

