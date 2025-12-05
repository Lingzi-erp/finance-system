'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Save, Plus, ChevronRight, Loader2, FolderTree, Ruler, Scale } from 'lucide-react';
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
  Category,
  CategoryTreeNode,
  Specification,
  UnitGroup,
  Unit
} from '@/lib/api/v3';


export default function NewProductPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 数据
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  
  // 表单
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    specification_id: '',
    specification: '',  // 自定义规格（如果不选模板）
    unit_id: '',
    description: ''
  });
  
  // 选中的分类路径
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<Category[]>([]);
  
  useEffect(() => {
    loadBaseData();
  }, []);
  
  // 分类变化时加载对应规格
  useEffect(() => {
    if (formData.category_id) {
      loadSpecifications(parseInt(formData.category_id));
    }
  }, [formData.category_id]);
  
  
  
  const loadBaseData = async () => {
    try {
      const [treeRes, groupsRes, unitsRes] = await Promise.all([
        categoriesApi.tree(true),
        unitsApi.listGroups(true),
        unitsApi.list({ is_active: true })
      ]);
      setCategoryTree(treeRes);
      setUnitGroups(groupsRes.data);
      setUnits(unitsRes);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    }
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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: '请输入商品名称', variant: 'destructive' });
      return;
    }
    
    // 必须选择基础单位
    if (!formData.unit_id) {
      toast({ title: '请选择计量单位', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      // 获取单位显示名
      const selectedUnit = units.find(u => u.id === parseInt(formData.unit_id));
      const unitDisplay = selectedUnit?.name || '个';
      
      const newProduct = await productsApi.create({
        name: formData.name.trim(),
        category: selectedCategoryPath.length > 0 ? selectedCategoryPath.map(c => c.name).join(' > ') : undefined,
        specification: formData.specification_id 
          ? specifications.find(s => s.id === parseInt(formData.specification_id))?.name 
          : formData.specification || undefined,
        unit: unitDisplay,
        unit_id: parseInt(formData.unit_id),
        description: formData.description || undefined
      });
      
      toast({ 
        title: '创建成功', 
        description: '正在跳转到编辑页面，您可以添加包装规格...'
      });
      // 跳转到编辑页面添加包装规格
      router.push(`/products/${newProduct.id}/edit`);
    } catch (err: any) {
      toast({ title: '创建失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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
  
  return (
    <div className="min-h-screen bg-paper-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/products" className="text-ink-light hover:text-ink-dark">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-green-600" />
            <div>
              <h1 className="text-2xl font-bold text-ink-black">新建商品</h1>
              <p className="text-sm text-ink-medium">添加新的商品到系统</p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本信息 */}
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              基本信息
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  商品名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入商品名称"
                  className="max-w-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  商品描述
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="可选，输入商品描述信息"
                  rows={3}
                  className="max-w-md"
                />
              </div>
            </div>
          </div>
          
          {/* 分类选择 */}
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
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
            
            <div className="border border-ink-light/50 rounded-lg p-4 max-h-64 overflow-y-auto bg-white">
              {categoryTree.length > 0 ? (
                renderCategoryTree(categoryTree)
              ) : (
                <div className="text-center text-ink-light py-4">
                  <FolderTree className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>暂无分类</p>
                  <Link href="/products" className="text-amber-600 text-sm hover:underline">
                    去创建分类
                  </Link>
                </div>
              )}
            </div>
          </div>
          
          {/* 规格选择 */}
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
              <Ruler className="w-5 h-5" />
              商品规格
            </h2>
            
            <div className="space-y-4">
              {specifications.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-ink-dark mb-1">
                    选择预设规格
                  </label>
                  <Select
                    value={formData.specification_id}
                    onValueChange={(value) => setFormData({ ...formData, specification_id: value, specification: '' })}
                  >
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="选择规格模板..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不选择</SelectItem>
                      {specifications.map(spec => (
                        <SelectItem key={spec.id} value={spec.id.toString()}>
                          {spec.name}
                          {spec.category_name && <span className="text-ink-light ml-2">({spec.category_name})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  自定义规格 {specifications.length > 0 && <span className="text-ink-light text-xs">（或在上方选择）</span>}
                </label>
                <Input
                  value={formData.specification}
                  onChange={(e) => setFormData({ ...formData, specification: e.target.value, specification_id: '' })}
                  placeholder="如：500g、大号、红色等"
                  className="max-w-md"
                  disabled={!!formData.specification_id}
                />
              </div>
            </div>
          </div>
          
          {/* 单位选择 */}
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-black mb-4 flex items-center gap-2">
              <Scale className="w-5 h-5" />
              计量单位 <span className="text-red-500">*</span>
            </h2>
            
            <div className="space-y-4">
              {/* 基础单位选择 */}
              <div>
                <label className="block text-sm font-medium text-ink-dark mb-1">
                  选择单位
                </label>
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
              
              <div className="text-sm text-ink-light bg-blue-50 p-3 rounded-lg">
                <p>💡 提示：商品创建后，可在商品详情页添加<strong>包装规格</strong>（如：大件、小件），实现按件计价换算。</p>
              </div>
            </div>
          </div>
          
          {/* 提交按钮 */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.push('/products')}>
              取消
            </Button>
            <Button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-700">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存商品
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

