'use client';

import Link from 'next/link';
import { 
  Plus, Package, FileText, Receipt, 
  Warehouse, Users, Settings, Sparkles,
  ArrowRight, Building2, Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  return (
    <div className="page-container">
      {/* 欢迎区域 */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
                <Sparkles className="w-4 h-4" />
                <span>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              <h1 className="text-3xl font-bold text-white">
                {getGreeting()}
              </h1>
              <p className="text-amber-100 text-sm mt-2">欢迎使用财务中心 v2.0</p>
            </div>
            <div className="hidden md:flex gap-2">
              <Link href="/orders/new?type=loading">
                <Button className="bg-white/20 hover:bg-white/30 text-white border-0">
                  <Plus className="w-4 h-4 mr-1" />
                  新建装货单
                </Button>
              </Link>
              <Link href="/orders/new?type=unloading">
                <Button className="bg-white hover:bg-white/90 text-amber-600 border-0">
                  <Plus className="w-4 h-4 mr-1" />
                  新建卸货单
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* 快速入口 */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">快速入口</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickLink 
              href="/orders"
              icon={<FileText className="w-6 h-6" />}
              label="业务单据"
              description="装货单、卸货单"
              color="bg-amber-500"
            />
            <QuickLink 
              href="/stocks"
              icon={<Boxes className="w-6 h-6" />}
              label="库存台账"
              description="库存管理与流水"
              color="bg-blue-500"
            />
            <QuickLink 
              href="/accounts"
              icon={<Receipt className="w-6 h-6" />}
              label="往来账款"
              description="应收应付管理"
              color="bg-green-500"
            />
            <QuickLink 
              href="/entities"
              icon={<Building2 className="w-6 h-6" />}
              label="客商管理"
              description="供应商、客户、仓库"
              color="bg-purple-500"
            />
          </div>
        </div>

        {/* 功能模块 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 基础资料 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-slate-500" />
              基础资料
            </h3>
            <div className="space-y-2">
              <ModuleLink href="/products" label="商品管理" description="商品信息、规格、分类" />
              <ModuleLink href="/entities" label="客商管理" description="供应商、客户、仓库、物流" />
              <ModuleLink href="/categories" label="商品分类" description="分类层级管理" />
              <ModuleLink href="/deduction-formulas" label="扣重公式" description="采购扣重规则" />
            </div>
          </div>

          {/* 业务处理 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              业务处理
            </h3>
            <div className="space-y-2">
              <ModuleLink href="/orders" label="业务单据" description="装货单、卸货单管理" />
              <ModuleLink href="/stocks" label="库存台账" description="库存查询与流水" />
              <ModuleLink href="/batches" label="批次追溯" description="批次出入库追踪" />
            </div>
          </div>

          {/* 财务管理 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-slate-500" />
              财务管理
            </h3>
            <div className="space-y-2">
              <ModuleLink href="/accounts" label="往来账款" description="应收应付余额" />
              <ModuleLink href="/payments" label="资金流水" description="收付款记录" />
              <ModuleLink href="/payment-methods" label="收付款方式" description="账户管理" />
            </div>
          </div>

          {/* 系统设置 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-500" />
              系统设置
            </h3>
            <div className="space-y-2">
              <ModuleLink href="/system" label="系统维护" description="数据初始化、升级" />
              <ModuleLink href="/backup" label="数据备份" description="备份与恢复" />
            </div>
          </div>
        </div>

        {/* 版本说明 */}
        <div className="mt-8 bg-gradient-to-br from-slate-50 to-amber-50 rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-3">🚀 v2.0 新架构</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <span className="text-amber-500">•</span>
              <span><strong>装货单/卸货单</strong>：全新X-D-Y业务模式，支持直销、转发等复杂场景</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500">•</span>
              <span><strong>在途仓</strong>：货物在途状态跟踪，解耦装卸时间</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500">•</span>
              <span><strong>分段账款</strong>：按装货(X→D)和卸货(D→Y)分别生成财务记录</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500">•</span>
              <span><strong>批次追溯</strong>：通过批次关联上下游订单</span>
            </div>
          </div>
        </div>
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

// 快速入口卡片
function QuickLink({ 
  href, 
  icon, 
  label, 
  description,
  color 
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string; 
  description: string;
  color: string;
}) {
  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all hover:border-slate-300">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-white mb-3`}>
          {icon}
        </div>
        <h3 className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors">{label}</h3>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
    </Link>
  );
}

// 模块链接
function ModuleLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group">
      <div>
        <span className="text-slate-900 group-hover:text-amber-600 transition-colors">{label}</span>
        <span className="text-slate-400 text-sm ml-2">{description}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
    </Link>
  );
}
