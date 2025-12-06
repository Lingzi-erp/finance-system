'use client';

import React from 'react';
import Link from 'next/link';
import { 
  BarChart3, History, TrendingUp, Package,
  Receipt, ChevronRight
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
        title: '快捷对账',
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
      {
        id: 'product-trading',
        title: '商品进销统计',
        description: '采购 · 销售 · 库存 · 毛利',
        icon: Package,
        href: '/statistics/product-trading',
        gradient: 'from-indigo-500 to-cyan-600',
        bgLight: 'bg-indigo-50',
        textColor: 'text-indigo-600',
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

      </div>
    </div>
  );
}
