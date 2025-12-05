'use client';

import React from 'react';
import Link from 'next/link';
import { 
  BarChart3, History, TrendingUp, TrendingDown, Users, Package,
  Receipt, Clock, AlertTriangle, Boxes, ChevronRight, Sparkles,
  PieChart, Activity, Target, Zap
} from 'lucide-react';

/**
 * 数据中心 - 模块化数据分析平台
 * 
 * 架构说明：
 * - 采用插件式架构，每个分析模块独立配置
 * - 模块可以通过 dataModules 数组轻松添加或移除
 * - available: true 表示模块已实现，false 表示规划中
 * - 每个模块都是独立的页面，可以单独开发和维护
 */

// 数据模块配置 - 可插拔式设计
const dataModules = [
  {
    category: '财务分析',
    description: '资金往来与账款追踪',
    items: [
      {
        id: 'accounts-overview',
        title: '往来账款',
        description: '应收账款 · 应付账款 · 往来对账',
        icon: Receipt,
        href: '/statistics/accounts-overview',
        gradient: 'from-emerald-500 to-teal-600',
        bgLight: 'bg-emerald-50',
        textColor: 'text-emerald-600',
        available: true
      },
    ]
  },
  {
    category: '交易分析',
    description: '客户供货与供应商采购统计',
    items: [
      {
        id: 'entity-trading',
        title: '客商交易分析',
        description: '供货量 · 采购量 · 金额 · 利润',
        icon: TrendingUp,
        href: '/statistics/entity-trading',
        gradient: 'from-blue-500 to-indigo-600',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-600',
        available: true
      },
    ]
  },
  {
    category: '库存查询',
    description: '库存状态与变动追踪',
    items: [
      {
        id: 'flows',
        title: '库存流水',
        description: '查询所有仓库的入库、出库、调整记录',
        icon: History,
        href: '/statistics/flows',
        gradient: 'from-violet-500 to-purple-600',
        bgLight: 'bg-violet-50',
        textColor: 'text-violet-600',
        available: true
      },
    ]
  }
];

// 规划中的模块 - 展示未来路线图
const plannedModules = [
  { title: '经营仪表盘', description: '核心指标一目了然', icon: Activity },
  { title: '利润分析', description: '毛利率、净利率追踪', icon: Target },
  { title: '库存预警', description: '低库存、滞销预警', icon: AlertTriangle },
  { title: '客商画像', description: '客户/供应商深度分析', icon: Users },
];

export default function DataCenterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30">
      {/* 页面头部 */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">数据中心</h1>
              <p className="text-amber-100 mt-1">数据分析与报表平台</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* 模块分类 */}
        <div className="space-y-10">
          {dataModules.map((category) => (
            <section key={category.category}>
              {/* 分类标题 */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{category.category}</h2>
                  <p className="text-sm text-slate-500">{category.description}</p>
                </div>
              </div>
              
              {/* 模块卡片网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {category.items.map((module) => {
                  const Icon = module.icon;
                  
                  return (
                    <Link
                      key={module.id}
                      href={module.href}
                      className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 transition-all duration-300 overflow-hidden"
                    >
                      {/* 装饰背景 */}
                      <div className={`absolute top-0 right-0 w-32 h-32 ${module.bgLight} rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 group-hover:opacity-80 transition-opacity`} />
                      
                      {/* 图标 */}
                      <div className={`relative w-12 h-12 bg-gradient-to-br ${module.gradient} rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      
                      {/* 内容 */}
                      <div className="relative">
                        <h3 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2 group-hover:text-amber-600 transition-colors">
                          {module.title}
                          <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </h3>
                        <p className="text-sm text-slate-500 leading-relaxed">
                          {module.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* 规划中的功能 */}
        <section className="mt-12">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-6 bg-gradient-to-b from-slate-300 to-slate-400 rounded-full" />
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-slate-800">规划中</h2>
              <span className="text-sm text-slate-400">Coming Soon</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {plannedModules.map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.title}
                  className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-5 opacity-60"
                >
                  <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-600 mb-1">{module.title}</h3>
                  <p className="text-xs text-slate-400">{module.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 模块化说明 */}
        <div className="mt-10 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-800 mb-1">模块化架构</h3>
              <p className="text-sm text-amber-700 leading-relaxed">
                数据中心采用插件式设计，每个分析模块独立开发、独立部署。
                您可以根据实际需求启用或禁用特定模块，也可以自定义开发新的分析功能。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
