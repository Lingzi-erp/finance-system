'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Save, Plus, Trash2, Loader2, Check, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { 
  productsApi, 
  unitsApi,
  Product,
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
  const [units, setUnits] = useState<Unit[]>([]);
  
  // 基本信息表单
  const [formData, setFormData] = useState({
    name: '',
    specification: '',
    unit: '',
    category: '',
    description: ''
  });
  
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
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [productData, unitsData] = await Promise.all([
        productsApi.get(productId),
        unitsApi.list({ is_active: true })
      ]);
      
      setProduct(productData);
      setUnits(unitsData);
      
      setFormData({
        name: productData.name,
        specification: productData.specification || '',
        unit: productData.unit,
        category: productData.category || '',
        description: productData.description || ''
      });
      
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
  
  const handleSaveBasicInfo = async () => {
    if (!formData.name.trim()) {
      toast({ title: '请输入商品名称', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      await productsApi.update(productId, {
        name: formData.name.trim(),
        specification: formData.specification || undefined,
        unit: formData.unit,
        category: formData.category || undefined,
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
    
    // 如果是散装（数量=1且没填容器名），容器名使用基础单位符号
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
      await loadData(); // 重新加载
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
              <h1 className="text-2xl font-bold text-ink-black">编辑商品</h1>
              <p className="text-sm text-ink-medium">{product.code} · {product.name}</p>
            </div>
          </div>
        </div>
        
        {/* 基本信息卡片 */}
        <div className="card-base p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            基本信息
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">商品名称 *</label>
              <Input 
                value={formData.name} 
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} 
                placeholder="输入商品名称" 
              />
            </div>
            <div>
              <label className="form-label">规格型号</label>
              <Input 
                value={formData.specification} 
                onChange={e => setFormData(p => ({ ...p, specification: e.target.value }))} 
                placeholder="如：大号、500g" 
              />
            </div>
            <div>
              <label className="form-label">计量单位</label>
              <Input 
                value={formData.unit} 
                onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))} 
                placeholder="如：kg、个" 
              />
            </div>
            <div>
              <label className="form-label">分类</label>
              <Input 
                value={formData.category} 
                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} 
                placeholder="商品分类" 
              />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">描述</label>
              <Textarea 
                value={formData.description} 
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} 
                placeholder="商品描述（可选）" 
                rows={2}
              />
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveBasicInfo} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              保存基本信息
            </Button>
          </div>
        </div>
        
        {/* 包装规格卡片 */}
        <div className="card-base p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              包装规格
              <span className="text-sm font-normal text-slate-500">
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
            <div className="text-center py-8 text-slate-400">
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

