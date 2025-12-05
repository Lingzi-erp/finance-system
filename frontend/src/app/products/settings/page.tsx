'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Settings, FolderTree, Scale, Plus, Edit, Trash2, 
  ChevronRight, ChevronDown, Loader2, X, Check, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { 
  categoriesApi, unitsApi,
  Category, CategoryTreeNode, UnitGroup, Unit
} from '@/lib/api/v3';


type Tab = 'categories' | 'units';

export default function ProductSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('categories');
  
  // 分类
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryData, setNewCategoryData] = useState({ name: '', parent_id: '', description: '' });
  const [showNewCategory, setShowNewCategory] = useState(false);
  
  
  // 单位
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupData, setNewGroupData] = useState({ name: '', base_unit: '', description: '' });
  const [newUnitData, setNewUnitData] = useState({ group_id: 0, name: '', symbol: '', conversion_rate: 1 });
  const [showNewUnit, setShowNewUnit] = useState<number | null>(null);
  
  const [saving, setSaving] = useState(false);
  
  const canEdit = true || true;
  
  
  
  useEffect(() => {
    loadData();
  }, [activeTab]);
  
  
  
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === 'categories') {
        const tree = await categoriesApi.tree();
        setCategoryTree(tree);
      } else if (activeTab === 'units') {
        // 加载单位组
        const res = await unitsApi.listGroups();
        setUnitGroups(res.data);
      }
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);
  
  // ===== 分类操作 =====
  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) {
      toast({ title: '请输入分类名称', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await categoriesApi.create({
        name: newCategoryData.name.trim(),
        parent_id: newCategoryData.parent_id ? parseInt(newCategoryData.parent_id) : undefined,
        description: newCategoryData.description || undefined
      });
      toast({ title: '创建成功' });
      setShowNewCategory(false);
      setNewCategoryData({ name: '', parent_id: '', description: '' });
      // 直接重新加载分类树
      const tree = await categoriesApi.tree();
      setCategoryTree(tree);
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleDeleteCategory = async (id: number) => {
    if (!confirm('确定要删除这个分类吗？')) return;
    try {
      await categoriesApi.delete(id);
      toast({ title: '删除成功' });
      // 直接重新加载分类树
      const tree = await categoriesApi.tree();
      setCategoryTree(tree);
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };
  
  // ===== 单位组操作 =====
  const reloadUnitData = async () => {
    const res = await unitsApi.listGroups();
    setUnitGroups(res.data);
  };
  
  const handleCreateGroup = async () => {
    if (!newGroupData.name.trim() || !newGroupData.base_unit.trim()) {
      toast({ title: '请输入单位组名称和基准单位', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await unitsApi.createGroup({
        name: newGroupData.name.trim(),
        base_unit: newGroupData.base_unit.trim(),
        description: newGroupData.description || undefined
      });
      toast({ title: '创建成功' });
      setShowNewGroup(false);
      setNewGroupData({ name: '', base_unit: '', description: '' });
      await reloadUnitData();
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleCreateUnit = async (groupId: number) => {
    if (!newUnitData.name.trim() || !newUnitData.symbol.trim()) {
      toast({ title: '请输入单位名称和符号', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await unitsApi.create({
        group_id: groupId,
        name: newUnitData.name.trim(),
        symbol: newUnitData.symbol.trim(),
        conversion_rate: newUnitData.conversion_rate
      });
      toast({ title: '创建成功' });
      setShowNewUnit(null);
      setNewUnitData({ group_id: 0, name: '', symbol: '', conversion_rate: 1 });
      await reloadUnitData();
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  
  // 递归渲染分类树
  const renderCategoryTree = (nodes: CategoryTreeNode[], level = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedCategories.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      
      return (
        <div key={node.id} className={level > 0 ? 'ml-6' : ''}>
          <div className="flex items-center justify-between p-2 hover:bg-paper-medium rounded group">
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button onClick={() => {
                  const newExpanded = new Set(expandedCategories);
                  if (isExpanded) newExpanded.delete(node.id);
                  else newExpanded.add(node.id);
                  setExpandedCategories(newExpanded);
                }}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <FolderTree className="w-4 h-4 text-amber-600" />
              <span className="font-medium">{node.name}</span>
              <span className="text-xs text-ink-light">{node.code}</span>
              {node.products_count > 0 && (
                <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{node.products_count}件</span>
              )}
            </div>
            {canEdit && (
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setNewCategoryData({ name: '', parent_id: node.id.toString(), description: '' });
                    setShowNewCategory(true);
                  }}
                >
                  <Plus className="w-3 h-3" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500"
                  onClick={() => handleDeleteCategory(node.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
          {hasChildren && isExpanded && renderCategoryTree(node.children, level + 1)}
        </div>
      );
    });
  };
  
  // 扁平化分类选项
  const flattenCategories = (nodes: CategoryTreeNode[], prefix = ''): { id: number; name: string }[] => {
    const result: { id: number; name: string }[] = [];
    nodes.forEach(node => {
      result.push({ id: node.id, name: prefix + node.name });
      if (node.children) {
        result.push(...flattenCategories(node.children, prefix + node.name + ' > '));
      }
    });
    return result;
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-paper-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }
  
  const flatCategories = flattenCategories(categoryTree);
  
  return (
    <div className="min-h-screen bg-paper-white">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/products" className="text-ink-light hover:text-ink-dark">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-ink-black">商品配置</h1>
              <p className="text-sm text-ink-medium">管理商品分类、计量单位</p>
            </div>
          </div>
        </div>
        
        {/* 标签页 */}
        <div className="flex gap-2 mb-6 border-b border-ink-light">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'categories' 
                ? 'border-amber-600 text-amber-600' 
                : 'border-transparent text-ink-medium hover:text-ink-dark'
            }`}
          >
            <FolderTree className="w-4 h-4 inline mr-2" />
            商品分类
          </button>
          <button
            onClick={() => setActiveTab('units')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'units' 
                ? 'border-amber-600 text-amber-600' 
                : 'border-transparent text-ink-medium hover:text-ink-dark'
            }`}
          >
            <Scale className="w-4 h-4 inline mr-2" />
            计量单位
          </button>
        </div>
        
        {/* 分类管理 */}
        {activeTab === 'categories' && (
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">商品分类</h2>
              {canEdit && (
                <Button onClick={() => { setNewCategoryData({ name: '', parent_id: '', description: '' }); setShowNewCategory(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  新建一级分类
                </Button>
              )}
            </div>
            
            {showNewCategory && (
              <div className="bg-white border border-ink-light rounded-lg p-4 mb-4">
                <h3 className="font-medium mb-3">
                  {newCategoryData.parent_id ? '新建子分类' : '新建一级分类'}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-ink-dark block mb-1">分类名称 *</label>
                    <Input
                      value={newCategoryData.name}
                      onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
                      placeholder="如：鱼类、番茄酱"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-ink-dark block mb-1">描述</label>
                    <Input
                      value={newCategoryData.description}
                      onChange={(e) => setNewCategoryData({ ...newCategoryData, description: e.target.value })}
                      placeholder="可选"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setShowNewCategory(false)}>取消</Button>
                  <Button onClick={handleCreateCategory} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    创建
                  </Button>
                </div>
              </div>
            )}
            
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-light" />
              </div>
            ) : categoryTree.length > 0 ? (
              <div className="space-y-1">
                {renderCategoryTree(categoryTree)}
              </div>
            ) : (
              <div className="text-center py-8 text-ink-light">
                <FolderTree className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无分类</p>
              </div>
            )}
          </div>
        )}
        
        {/* 单位管理 */}
        {activeTab === 'units' && (
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">计量单位</h2>
              {canEdit && (
                <Button onClick={() => setShowNewGroup(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  新建单位组
                </Button>
              )}
            </div>
            
            {showNewGroup && (
              <div className="bg-white border border-ink-light rounded-lg p-4 mb-4">
                <h3 className="font-medium mb-3">新建单位组</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-ink-dark block mb-1">单位组名称 *</label>
                    <Input
                      value={newGroupData.name}
                      onChange={(e) => setNewGroupData({ ...newGroupData, name: e.target.value })}
                      placeholder="如：重量、体积"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-ink-dark block mb-1">基准单位 *</label>
                    <Input
                      value={newGroupData.base_unit}
                      onChange={(e) => setNewGroupData({ ...newGroupData, base_unit: e.target.value })}
                      placeholder="如：kg、L"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-ink-dark block mb-1">描述</label>
                    <Input
                      value={newGroupData.description}
                      onChange={(e) => setNewGroupData({ ...newGroupData, description: e.target.value })}
                      placeholder="可选"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setShowNewGroup(false)}>取消</Button>
                  <Button onClick={handleCreateGroup} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    创建
                  </Button>
                </div>
              </div>
            )}
            
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-light" />
              </div>
            ) : unitGroups.length > 0 ? (
              <div className="space-y-4">
                {unitGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.id);
                  return (
                    <div key={group.id} className="bg-white border border-ink-light rounded-lg overflow-hidden">
                      <div 
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-paper-light"
                        onClick={() => {
                          const newExpanded = new Set(expandedGroups);
                          if (isExpanded) newExpanded.delete(group.id);
                          else newExpanded.add(group.id);
                          setExpandedGroups(newExpanded);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Scale className="w-5 h-5 text-blue-600" />
                          <div>
                            <span className="font-medium">{group.name}</span>
                            <span className="text-sm text-ink-light ml-2">（基准：{group.base_unit}）</span>
                          </div>
                        </div>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {group.units.length} 个单位
                        </span>
                      </div>
                      
                      {isExpanded && (
                        <div className="border-t border-ink-light/50 p-4 bg-paper-light/50">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            {group.units.map(unit => (
                              <div key={unit.id} className="bg-white border border-ink-light rounded p-2 text-center">
                                <div className="font-medium">{unit.name}</div>
                                <div className="text-xs text-ink-light">
                                  {unit.symbol} 
                                  {!unit.is_base && ` = ${unit.conversion_rate} ${group.base_unit}`}
                                  {unit.is_base && ' (基准)'}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {showNewUnit === group.id ? (
                            <div className="bg-white border border-ink-light rounded p-3">
                              <div className="grid grid-cols-3 gap-3">
                                <Input
                                  placeholder="单位名称"
                                  value={newUnitData.name}
                                  onChange={(e) => setNewUnitData({ ...newUnitData, name: e.target.value })}
                                />
                                <Input
                                  placeholder="符号"
                                  value={newUnitData.symbol}
                                  onChange={(e) => setNewUnitData({ ...newUnitData, symbol: e.target.value })}
                                />
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="换算率"
                                  value={newUnitData.conversion_rate}
                                  onChange={(e) => setNewUnitData({ ...newUnitData, conversion_rate: parseFloat(e.target.value) || 1 })}
                                />
                              </div>
                              <p className="text-xs text-ink-light mt-2">
                                换算率：1 {newUnitData.symbol || '新单位'} = {newUnitData.conversion_rate} {group.base_unit}
                              </p>
                              <div className="flex justify-end gap-2 mt-3">
                                <Button variant="outline" size="sm" onClick={() => setShowNewUnit(null)}>取消</Button>
                                <Button size="sm" onClick={() => handleCreateUnit(group.id)} disabled={saving}>
                                  {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                  添加
                                </Button>
                              </div>
                            </div>
                          ) : canEdit && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setNewUnitData({ group_id: group.id, name: '', symbol: '', conversion_rate: 1 });
                                setShowNewUnit(group.id);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              添加单位
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-ink-light">
                <Scale className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无单位组</p>
              </div>
            )}
            
            
            {/* 提示：包装规格在商品详情页管理 */}
            <div className="mt-8 pt-6 border-t border-ink-light">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-medium text-blue-800 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  关于包装规格
                </h3>
                <p className="text-sm text-blue-700 mt-2">
                  包装规格（如：大件=15kg、小件=10kg）现在在<strong>商品详情页</strong>单独管理。
                  <br />
                  每个商品可以设置多个包装规格，方便按件计价和换算。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

