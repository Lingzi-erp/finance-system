'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings, Database, Trash2, 
  PackageOpen, AlertTriangle, CheckCircle, Loader2,
  Info, RefreshCw, Download, Monitor, HardDrive, Cpu
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

// 版本信息
const APP_VERSION = '1.0.2';
const BUILD_DATE = '2024-12-06';
const CHANGELOG = [
  { version: '1.0.2', date: '2024-12-06', changes: ['新增系统信息和版本显示', '新增手动检查更新按钮', '新增更新日志展示', '修复备份文件被打包的问题'] },
  { version: '1.0.1', date: '2024-12-06', changes: ['修复卸载不完整的问题', '优化项目结构', '清理不必要的文件'] },
  { version: '1.0.0', date: '2024-12-06', changes: ['首个正式版本发布', '完整的商品、订单、库存、财务功能', '支持自动更新'] },
];

export default function SystemPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // 检查更新
  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    
    try {
      // 调用 Electron API 检查更新
      if (typeof window !== 'undefined' && (window as any).electronAPI?.checkForUpdates) {
        (window as any).electronAPI.checkForUpdates();
        setUpdateStatus('正在检查更新...');
        
        // 监听更新事件
        setTimeout(() => {
          setCheckingUpdate(false);
          if (updateStatus === '正在检查更新...') {
            setUpdateStatus('当前已是最新版本');
          }
        }, 5000);
      } else {
        // 非 Electron 环境，显示提示
        toast({
          title: '检查更新',
          description: '请在桌面应用中使用此功能',
        });
        setCheckingUpdate(false);
      }
    } catch (err) {
      setUpdateStatus('检查更新失败');
      setCheckingUpdate(false);
    }
  };

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

        {/* 系统信息与版本 */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-600" />
            系统信息
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 版本信息 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">当前版本</span>
                </div>
                <span className="font-mono font-semibold text-indigo-600">v{APP_VERSION}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">构建日期</span>
                </div>
                <span className="font-mono text-slate-700">{BUILD_DATE}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">运行环境</span>
                </div>
                <span className="text-sm text-slate-700">Windows x64</span>
              </div>
            </div>
            
            {/* 检查更新 */}
            <div className="flex flex-col justify-between">
              <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg">
                <Download className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-3">检查是否有新版本可用</p>
                <Button
                  onClick={checkForUpdates}
                  disabled={checkingUpdate}
                  className="bg-indigo-500 hover:bg-indigo-600"
                >
                  {checkingUpdate ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      检查中...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      检查更新
                    </>
                  )}
                </Button>
                {updateStatus && (
                  <p className="text-xs text-slate-500 mt-2">{updateStatus}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 更新日志 */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" />
            更新日志
          </h3>
          
          <div className="space-y-4">
            {CHANGELOG.map((release, idx) => (
              <div key={release.version} className={`border-l-2 pl-4 ${idx === 0 ? 'border-indigo-500' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono font-semibold ${idx === 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                    v{release.version}
                  </span>
                  {idx === 0 && (
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">最新</span>
                  )}
                  <span className="text-xs text-slate-400">{release.date}</span>
                </div>
                <ul className="text-sm text-slate-600 space-y-1">
                  {release.changes.map((change, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

