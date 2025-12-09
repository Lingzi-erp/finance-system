'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Save, Plus, Trash2, Loader2, Check, X, Settings, FolderTree, Ruler, Scale, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { 
  productsApi, 
  categoriesApi,
  specificationsApi,
  unitsApi,
  Product,
  Category,
  CategoryTreeNode,
  Specification,
  UnitGroup,
  Unit
} from '@/lib/api/v3';
import { ProductSpec } from '@/lib/api/v3/products';

interface SpecForm {
  id?: number;
  name: string;
  container_name: string;
  quantity: number;
  unit_id: number;
  is_default: boolean;
  isNew?: boolean;
  isEditing?: boolean;
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  
  // 基础数据
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  
  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    specification_id: '',
    specification: '',
    unit_id: '',
    description: ''
  });
  
  // 选中的分类路径
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<Category[]>([]);
  
  // 包装规格列表
  const [specs, setSpecs] = useState<SpecForm[]>([]);
  const [showNewSpec, setShowNewSpec] = useState(false);
  const [newSpec, setNewSpec] = useState<SpecForm>({
    name: '',
    container_name: '',
    quantity: 1,
    unit_id: 0,
    is_default: false,
    isNew: true
  });
  
  useEffect(() => {
    loadData();
  }, [productId]);
  
  // 分类变化时加载对应规格
  useEffect(() => {
    if (formData.category_id) {
      loadSpecifications(parseInt(formData.category_id));
    }
  }, [formData.category_id]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [productData, treeRes, groupsRes, unitsRes] = await Promise.all([
        productsApi.get(productId),
        categoriesApi.tree(true),
        unitsApi.listGroups(true),
        unitsApi.list({ is_active: true })
      ]);
      
      setProduct(productData);
      setCategoryTree(treeRes);
      setUnitGroups(groupsRes.data);
      setUnits(unitsRes);
      
      // 设置表单数据
      setFormData({
        name: productData.name,
        category_id: '', // 需要从分类树中查找
        specification_id: '',
        specification: productData.specification || '',
        unit_id: productData.unit_id?.toString() || '',
        description: productData.description || ''
      });
      
      // 根据分类名称查找分类ID和路径
      if (productData.category) {
        const categoryPath = findCategoryByName(treeRes, productData.category);
        if (categoryPath.length > 0) {
          const lastCategory = categoryPath[categoryPath.length - 1];
          setFormData(prev => ({ ...prev, category_id: lastCategory.id.toString() }));
          setSelectedCategoryPath(categoryPath);
        }
      }
      
      // 加载包装规格
      if (productData.specs) {
        setSpecs(productData.specs.map(s => ({
          id: s.id,
          name: s.name,
          container_name: s.container_name || '',
          quantity: s.quantity,
          unit_id: s.unit_id,
          is_default: s.is_default || false,
          isNew: false,
          isEditing: false
        })));
      }
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  // 根据分类名称路径查找分类
  const findCategoryByName = (nodes: CategoryTreeNode[], categoryName: string): Category[] => {
    const parts = categoryName.split(' > ');
    let currentNodes = nodes;
    const path: Category[] = [];
    
    for (const part of parts) {
      const found = currentNodes.find(n => n.name === part);
      if (found) {
        path.push(found);
        currentNodes = found.children;
      } else {
        break;
      }
    }
    return path;
  };
  
  const loadSpecifications = async (categoryId: number) => {
    try {
      const res = await specificationsApi.list({ category_id: categoryId, is_active: true, limit: 100 });
      setSpecifications(res.data);
    } catch (err) {
      console.error('Failed to load specifications:', err);
    }
  };
  
  const handleCategorySelect = (category: Category, path: Category[]) => {
    setFormData({ ...formData, category_id: category.id.toString() });
    setSelectedCategoryPath([...path, category]);
  };
  
  const handleSaveBasicInfo = async () => {
    if (!formData.name.trim()) {
      toast({ title: '请输入商品名称', variant: 'destructive' });
      return;
    }
    
    if (!formData.unit_id) {
      toast({ title: '请选择计量单位', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      const selectedUnit = units.find(u => u.id === parseInt(formData.unit_id));
      const unitDisplay = selectedUnit?.name || '个';
      
      await productsApi.update(productId, {
        name: formData.name.trim(),
        category: selectedCategoryPath.length > 0 ? selectedCategoryPath.map(c => c.name).join(' > ') : undefined,
        specification: formData.specification_id 
          ? specifications.find(s => s.id === parseInt(formData.specification_id))?.name 
          : formData.specification || undefined,
        unit: unitDisplay,
        unit_id: parseInt(formData.unit_id),
        description: formData.description || undefined
      });
      toast({ title: '保存成功' });
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleAddSpec = async () => {
    if (!newSpec.name.trim()) {
      toast({ title: '请输入规格名称', variant: 'destructive' });
      return;
    }
    if (!newSpec.unit_id) {
      toast({ title: '请选择基础单位', variant: 'destructive' });
      return;
    }
    if (newSpec.quantity <= 0) {
      toast({ title: '数量必须大于0', variant: 'destructive' });
      return;
    }
    
    const containerName = newSpec.container_name.trim() || getUnitSymbol(newSpec.unit_id);
    
    setSaving(true);
    try {
      await productsApi.addSpec(productId, {
        name: newSpec.name.trim(),
        container_name: containerName,
        quantity: newSpec.quantity,
        unit_id: newSpec.unit_id,
        is_default: newSpec.is_default
      });
      toast({ title: '添加成功' });
      setShowNewSpec(false);
      setNewSpec({
        name: '',
        container_name: '',
        quantity: 1,
        unit_id: 0,
        is_default: false,
        isNew: true
      });
      await loadData();
    } catch (err: any) {
      toast({ title: '添加失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleDeleteSpec = async (specId: number) => {
    if (!confirm('确定要删除这个包装规格吗？')) return;
    
    try {
      await productsApi.deleteSpec(productId, specId);
      toast({ title: '删除成功' });
      await loadData();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };
  
  const handleSetDefault = async (specId: number) => {
    try {
      await productsApi.updateSpec(productId, specId, { is_default: true });
      toast({ title: '已设为默认' });
      await loadData();
    } catch (err: any) {
      toast({ title: '设置失败', description: err.message, variant: 'destructive' });
    }
  };
  
  const getUnitSymbol = (unitId: number) => {
    const unit = units.find(u => u.id === unitId);
    return unit?.symbol || '';
  };
  
  // 递归渲染分类树
  const renderCategoryTree = (nodes: CategoryTreeNode[], path: Category[] = [], level = 0) => {
    return nodes.map(node => (
      <div key={node.id} className={level > 0 ? 'ml-4' : ''}>
        <div
          onClick={() => handleCategorySelect(node, path)}
          className={`
            flex items-center justify-between p-2 rounded cursor-pointer transition-colors
            ${formData.category_id === node.id.toString() 
              ? 'bg-amber-100 text-amber-800' 
              : 'hover:bg-paper-light'
            }
          `}
        >
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-ink-light" />
            <span>{node.name}</span>
            {node.products_count > 0 && (
              <span className="text-xs text-ink-light">({node.products_count})</span>
            )}
          </div>
          {node.children.length > 0 && (
            <ChevronRight className="w-4 h-4 text-ink-light" />
          )}
        </div>
        {node.children.length > 0 && (
          <div className="border-l border-ink-light/30 ml-2">
            {renderCategoryTree(node.children, [...path, node], level + 1)}
          </div>
        )}
      </div>
    ));
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-paper-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-amber-600" />
          <p className="text-ink-medium">加载中...</p>
        </div>
      </div>
    );
  }
  
  if (!product) {
    return (
      <div className="min-h-screen bg-paper-white flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p className="text-ink-medium">商品不存在</p>
          <Link href="/products">
            <Button variant="outline" className="mt-4">返回列表</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-paper-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/products" className="text-ink-light hover:text-ink-dark">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-ink-black">编辑商品信息</h1>
              <p className="text-sm text-ink-medium">{product.code} · {product.name}</p>
            </div>
          </div>
        </div>
        
        {/* 基本信息卡片 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            基本信息
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  商品名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入商品名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  规格型号
                </label>
                <Input
                  value={formData.specification}
                  onChange={(e) => setFormData({ ...formData, specification: e.target.value, specification_id: '' })}
                  placeholder="如：大号、500g"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-ink-dark mb-1">
                商品描述
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="商品描述（可选）"
                rows={2}
              />
            </div>
          </div>
        </div>
        
        {/* 分类选择 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            商品分类
          </h2>
          
          {selectedCategoryPath.length > 0 && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className="text-ink-light">已选：</span>
              {selectedCategoryPath.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-ink-light" />}
                  <span className="text-amber-600">{c.name}</span>
                </React.Fragment>
              ))}
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, category_id: '' });
                  setSelectedCategoryPath([]);
                }}
                className="ml-2 text-xs text-ink-light hover:text-red-500"
              >
                清除
              </button>
            </div>
          )}
          
          <div className="border border-ink-light/50 rounded-lg p-4 max-h-48 overflow-y-auto bg-white">
            {categoryTree.length > 0 ? (
              renderCategoryTree(categoryTree)
            ) : (
              <div className="text-center text-ink-light py-4">
                <FolderTree className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无分类</p>
              </div>
            )}
          </div>
        </div>
        
        {/* 单位选择 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5" />
            计量单位 <span className="text-red-500">*</span>
          </h2>
          
          <Select
            value={formData.unit_id || 'none'}
            onValueChange={(value) => setFormData({ ...formData, unit_id: value === 'none' ? '' : value })}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="请选择计量单位..." />
            </SelectTrigger>
            <SelectContent>
              {unitGroups.map(group => (
                <React.Fragment key={group.id}>
                  <div className="px-2 py-1 text-xs font-semibold text-ink-light bg-paper-light">
                    {group.name}
                  </div>
                  {group.units.map(unit => (
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name} ({unit.symbol})
                      {unit.is_base && <span className="ml-1 text-xs text-amber-600">基准</span>}
                      {!unit.is_base && <span className="ml-1 text-xs text-ink-light">= {unit.conversion_rate} {group.base_unit}</span>}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* 保存基本信息按钮 */}
        <div className="flex justify-end mb-6">
          <Button onClick={handleSaveBasicInfo} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            保存基本信息
          </Button>
        </div>
        
        {/* 包装规格卡片 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-ink-black flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              包装规格
              <span className="text-sm font-normal text-ink-medium">
                （用于按件计价和重量换算）
              </span>
            </h2>
            <Button size="sm" onClick={() => setShowNewSpec(true)} disabled={showNewSpec}>
              <Plus className="w-4 h-4 mr-1" />
              添加规格
            </Button>
          </div>
          
          {/* 新增规格表单 */}
          {showNewSpec && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-blue-800">新增包装规格</h3>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-xs"
                    onClick={() => setNewSpec(p => ({ ...p, name: '散装', container_name: '', quantity: 1 }))}
                  >
                    快速添加散装
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-slate-600 block mb-1">规格名称 *</label>
                  <Input 
                    value={newSpec.name}
                    onChange={e => setNewSpec(p => ({ ...p, name: e.target.value }))}
                    placeholder="散装"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1">容器名称</label>
                  <Input 
                    value={newSpec.container_name}
                    onChange={e => setNewSpec(p => ({ ...p, container_name: e.target.value }))}
                    placeholder="如：件、箱"
                    className="h-9"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">不填则使用基础单位</p>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1">每件数量 *</label>
                  <Input 
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newSpec.quantity}
                    onChange={e => setNewSpec(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1">基础单位 *</label>
                  <Select 
                    value={newSpec.unit_id?.toString() || ''} 
                    onValueChange={v => setNewSpec(p => ({ ...p, unit_id: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="选择..." />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.name} ({u.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button size="sm" onClick={handleAddSpec} disabled={saving} className="h-9">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewSpec(false)} className="h-9">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {newSpec.name && newSpec.unit_id > 0 && (
                <div className="mt-2 text-sm text-blue-700">
                  预览：<strong>{newSpec.name}</strong> = 1{newSpec.container_name || getUnitSymbol(newSpec.unit_id)} × {newSpec.quantity}{getUnitSymbol(newSpec.unit_id)}
                </div>
              )}
            </div>
          )}
          
          {/* 规格列表 */}
          {specs.length > 0 ? (
            <div className="space-y-2">
              {specs.map(spec => (
                <div 
                  key={spec.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    spec.is_default ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-medium text-slate-900">{spec.name}</span>
                      {spec.is_default && (
                        <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">
                      1 {spec.container_name} = {spec.quantity} {getUnitSymbol(spec.unit_id)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!spec.is_default && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleSetDefault(spec.id!)}
                        className="text-amber-600 hover:text-amber-700"
                      >
                        设为默认
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleDeleteSpec(spec.id!)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-ink-light">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>暂无包装规格</p>
              <p className="text-xs mt-1">添加包装规格后，采购时可按件计价并自动换算重量</p>
            </div>
          )}
        </div>
        
        {/* 底部操作 */}
        <div className="flex justify-between items-center mt-6">
          <Link href="/products">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回列表
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
