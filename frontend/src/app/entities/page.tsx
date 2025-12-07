'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { entitiesApi, Entity } from '@/lib/api/v3';
import { Building2, Plus, Search, Edit, Trash2, X, Warehouse, Users, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function EntitiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '', entity_type: 'warehouse', contact_name: '', phone: '', address: '', notes: ''
  });

  const canCreate = true;
  const canEdit = true;
  const canDelete = true;

  useEffect(() => { loadEntities(); }, [page, search, typeFilter]);

  const loadEntities = async () => {
    try {
      setLoading(true);
      const res = await entitiesApi.list({ page, limit: 20, search: search || undefined, entity_type: typeFilter || undefined });
      setEntities(res.data);
      setTotal(res.total);
    } catch (err: any) {
      if (err.message?.includes('403')) {
        toast({ title: '权限不足', description: '您没有查看实体的权限', variant: 'destructive' });
      } else {
        toast({ title: '加载失败', description: err.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({ title: '请填写名称', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        await entitiesApi.update(editingId, formData);
        toast({ title: '更新成功' });
      } else {
        await entitiesApi.create(formData);
        toast({ title: '创建成功' });
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      loadEntities();
    } catch (err: any) {
      toast({ title: '操作失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (entity: Entity) => {
    setEditingId(entity.id);
    setFormData({
      name: entity.name, entity_type: entity.entity_type, contact_name: entity.contact_name || '',
      phone: entity.phone || '', address: entity.address || '', notes: entity.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除吗？')) return;
    try {
      await entitiesApi.delete(id);
      toast({ title: '删除成功' });
      loadEntities();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', entity_type: 'warehouse', contact_name: '', phone: '', address: '', notes: '' });
  };

  const getEntityIcon = (type: string) => {
    if (type.includes('warehouse')) return <Warehouse className="w-5 h-5 text-blue-600" />;
    if (type.includes('logistics')) return <Truck className="w-5 h-5 text-purple-600" />;
    if (type.includes('supplier')) return <Truck className="w-5 h-5 text-orange-600" />;
    if (type.includes('customer')) return <Users className="w-5 h-5 text-green-600" />;
    return <Building2 className="w-5 h-5 text-slate-600" />;
  };

  const getTypeLabel = (type: string) => {
    const labels: string[] = [];
    if (type.includes('warehouse')) labels.push('仓库');
    if (type.includes('logistics')) labels.push('物流');
    if (type.includes('supplier')) labels.push('供应商');
    if (type.includes('customer')) labels.push('客户');
    return labels.join('/') || type;
  };

  const getTypeColor = (type: string) => {
    if (type.includes('warehouse')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (type.includes('logistics')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (type.includes('supplier')) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (type.includes('customer')) return 'bg-green-50 text-green-700 border-green-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  if (loading && entities.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner mb-4"></div>
        <p className="text-slate-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">客商管理</h1>
              <p className="text-sm text-slate-500">统一管理供应商、客户、仓库信息</p>
            </div>
          </div>
          <div className="flex gap-2">
            {canCreate && (
              <Button onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }}>
                <Plus className="w-4 h-4 mr-2" />新建客商
              </Button>
            )}
          </div>
        </div>

        {/* 编辑/新建表单 */}
        {showForm && (canCreate || (editingId && canEdit)) && (
          <div className="card-base p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{editingId ? '编辑' : '新建'}客商</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">名称 *</label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="客商名称" />
              </div>
              <div>
                <label className="form-label">类型</label>
                <Select value={formData.entity_type} onValueChange={v => setFormData(p => ({ ...p, entity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">🏭 仓库</SelectItem>
                    <SelectItem value="supplier">🚚 供应商</SelectItem>
                    <SelectItem value="customer">👤 客户</SelectItem>
                    <SelectItem value="logistics">🚛 物流公司</SelectItem>
                    <SelectItem value="supplier,customer">🔄 供应商+客户</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="form-label">联系人</label>
                <Input value={formData.contact_name} onChange={e => setFormData(p => ({ ...p, contact_name: e.target.value }))} placeholder="联系人姓名" />
              </div>
              <div>
                <label className="form-label">电话</label>
                <Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="联系电话" />
              </div>
              <div>
                <label className="form-label">地址</label>
                <Input value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} placeholder="详细地址" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit}>{editingId ? '更新' : '创建'}</Button>
            </div>
          </div>
        )}

        {/* 筛选栏 */}
        <div className="filter-panel">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="搜索名称或编码..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
              </div>
            </div>
            <div className="w-40">
              <label className="form-label">类型</label>
              <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="warehouse">仓库</SelectItem>
                  <SelectItem value="supplier">供应商</SelectItem>
                  <SelectItem value="customer">客户</SelectItem>
                  <SelectItem value="logistics">物流公司</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-slate-500">共 {total} 条</div>
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map(entity => (
            <div key={entity.id} className="card-base p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center">
                    {getEntityIcon(entity.entity_type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{entity.name}</h3>
                    <p className="text-xs text-slate-400">{entity.code}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-xs rounded-md border ${getTypeColor(entity.entity_type)}`}>
                  {getTypeLabel(entity.entity_type)}
                </span>
              </div>
              
              <div className="space-y-1.5 text-sm">
                {entity.contact_name && (
                  <p className="text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">联系人</span>
                    {entity.contact_name}
                  </p>
                )}
                {entity.phone && (
                  <p className="text-slate-600 flex items-center gap-2">
                    <span className="text-slate-400">电话</span>
                    {entity.phone}
                  </p>
                )}
                {entity.address && (
                  <p className="text-slate-500 truncate flex items-center gap-2">
                    <span className="text-slate-400">地址</span>
                    {entity.address}
                  </p>
                )}
              </div>
              
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                {entity.is_system ? (
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">系统内置</span>
                ) : (
                  <span></span>
                )}
                <div className="flex gap-1">
                  {canEdit && !entity.is_system && (
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(entity)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                  {canDelete && !entity.is_system && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(entity.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {entities.length === 0 && !loading && (
          <div className="empty-state">
            <Building2 className="empty-state-icon" />
            <p className="empty-state-text">暂无客商</p>
            {canCreate && (
              <Button className="mt-4" onClick={() => { setShowForm(true); resetForm(); }}>
                <Plus className="w-4 h-4 mr-2" />创建第一个
              </Button>
            )}
          </div>
        )}
        
        {/* 分页 */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <span className="px-4 py-2 text-sm text-slate-500">
              第 {page} 页 / 共 {Math.ceil(total / 20)} 页
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
