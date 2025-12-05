'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings, Database, Trash2, 
  PackageOpen, AlertTriangle, CheckCircle, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v3';

function getAuthHeaders() {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export default function SystemPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const executeAction = async (
    action: string, 
    endpoint: string, 
    successMsg: string,
    confirmMsg: string
  ) => {
    if (!confirm(confirmMsg)) return;
    
    setLoading(action);
    try {
      const res = await fetch(`${API_BASE}${endpoint}?confirm=true`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || '操作失败');
      }
      
      const result = await res.json();
      toast({ 
        title: '操作成功', 
        description: result.message || successMsg,
      });
      
      // 如果是初始化演示数据，刷新页面
      if (action === 'init-demo') {
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err: any) {
      toast({ 
        title: '操作失败', 
        description: err.message, 
        variant: 'destructive' 
      });
    } finally {
      setLoading(null);
    }
  };

  const actions = [
    {
      id: 'init-demo',
      title: '初始化演示数据',
      description: '清除所有数据并创建完整的演示数据，包括供应商、客户、仓库、物流公司、商品、采购单和销售单。适合新用户快速了解系统功能。',
      icon: PackageOpen,
      color: 'bg-blue-500 hover:bg-blue-600',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      endpoint: '/system/init-demo-data',
      confirmMsg: '⚠️ 警告：此操作将清除所有现有业务数据！\n\n确定要初始化演示数据吗？',
      successMsg: '演示数据初始化完成'
    },
    {
      id: 'clear-demo',
      title: '清除演示数据',
      description: '清除所有业务数据（实体、商品、采购单、销售单、库存、账款等），保留系统配置。适合学习完成后开始正式使用。',
      icon: Trash2,
      color: 'bg-red-500 hover:bg-red-600',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      endpoint: '/system/clear-demo-data',
      confirmMsg: '⚠️ 警告：此操作将删除所有业务数据！\n\n包括：实体、商品、采购单、销售单、库存、账款等\n保留：系统配置\n\n确定要清除所有数据吗？',
      successMsg: '数据已清除，系统已重置为空白状态'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <Settings className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">系统维护</h1>
            <p className="text-sm text-gray-500">管理演示数据和系统维护操作</p>
          </div>
        </div>

        {/* 警告提示 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">注意事项</p>
              <p className="text-sm text-amber-700 mt-1">
                以下操作涉及数据修改，请谨慎执行。建议在操作前先进行数据备份。
              </p>
            </div>
          </div>
        </div>

        {/* 操作卡片 */}
        <div className="space-y-4">
          {actions.map(action => (
            <div 
              key={action.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${action.iconBg}`}>
                  <action.icon className={`w-6 h-6 ${action.iconColor}`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{action.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                </div>
                <Button
                  className={`${action.color} text-white min-w-[100px]`}
                  disabled={loading !== null}
                  onClick={() => executeAction(
                    action.id, 
                    action.endpoint, 
                    action.successMsg,
                    action.confirmMsg
                  )}
                >
                  {loading === action.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      执行中...
                    </>
                  ) : (
                    '执行'
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            使用说明
          </h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>新用户：</strong>点击「初始化演示数据」快速体验系统功能</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>正式使用：</strong>体验完成后点击「清除演示数据」开始正式录入</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
              <p><strong>数据安全：</strong>建议定期在「数据备份」中备份数据，以便需要时恢复</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

