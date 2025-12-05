'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { backupApi, BackupInfo } from '@/lib/api/v3';
import { Database, Trash2, RotateCcw, Plus, AlertTriangle, Shield, FolderOpen, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function BackupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [backupDir, setBackupDir] = useState<string>('');
  const [showPathDialog, setShowPathDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await backupApi.list();
      setBackups(res.backups);
      setBackupDir(res.backup_dir);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await backupApi.create();
      toast({ title: '备份成功', description: res.message });
      loadData();
    } catch (err: any) {
      toast({ title: '备份失败', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };


  const handleDelete = async (filename: string) => {
    if (!confirm(`确定要删除备份 ${filename} 吗？此操作不可恢复！`)) return;
    try {
      await backupApi.delete(filename);
      toast({ title: '删除成功' });
      loadData();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`⚠️ 危险操作！\n\n确定要恢复到备份 ${filename} 吗？\n\n当前数据将被覆盖，系统会先自动备份当前数据。`)) return;
    try {
      const res = await backupApi.restore(filename);
      toast({ title: '恢复成功', description: `${res.message}，恢复前备份: ${res.pre_restore_backup}` });
      loadData();
    } catch (err: any) {
      toast({ title: '恢复失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleOpenFolder = () => {
    setShowPathDialog(true);
    setCopied(false);
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(backupDir);
      setCopied(true);
      toast({ title: '已复制', description: '备份文件夹路径已复制到剪贴板' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: '复制失败', description: '请手动复制路径', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">数据备份</h1>
              <p className="text-sm text-gray-500">管理系统数据备份与恢复</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleOpenFolder} variant="outline">
              <FolderOpen className="w-4 h-4 mr-2" />
              在文件夹中打开
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="w-4 h-4 mr-2" />
              {creating ? '备份中...' : '创建备份'}
            </Button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">备份说明</p>
              <ul className="list-disc list-inside space-y-1 text-amber-700">
                <li>建议定期创建备份，防止数据丢失</li>
                <li>恢复备份会覆盖当前所有数据，请谨慎操作</li>
                <li>恢复前系统会自动创建当前数据的备份</li>
                <li>备份文件存储在服务器本地，建议下载到其他位置保存</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 备份列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="font-medium text-gray-900">备份列表</h3>
          </div>
          
          {backups.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {backups.map((backup, idx) => (
                <div key={idx} className="px-4 py-4 flex items-center justify-between hover:bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Database className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{backup.filename}</p>
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>{backup.size_display}</span>
                        <span>{new Date(backup.created_at).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleRestore(backup.filename)}
                      className="text-orange-600 border-orange-200 hover:bg-orange-50"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      恢复
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleDelete(backup.filename)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">暂无备份</p>
              <p className="text-sm text-gray-400 mt-1">点击"创建备份"开始备份数据</p>
            </div>
          )}
        </div>

        {/* 安全提示 */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">安全建议</p>
              <p>定期下载备份文件到本地或云存储，确保数据安全。建议每周至少备份一次，重要操作前也应创建备份。</p>
            </div>
          </div>
        </div>
      </div>

      {/* 路径对话框 */}
      {showPathDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPathDialog(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">备份文件夹路径</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-3">复制以下路径，然后在文件资源管理器中打开：</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                <code className="text-sm text-gray-800 break-all">{backupDir}</code>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowPathDialog(false)}>
                  关闭
                </Button>
                <Button onClick={handleCopyPath}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      复制路径
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

