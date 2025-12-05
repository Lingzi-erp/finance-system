'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, Plus, RefreshCw, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { deductionFormulasApi, DeductionFormula } from '@/lib/api/v3';


export default function FormulasPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [formulas, setFormulas] = useState<DeductionFormula[]>([]);
  const [loading, setLoading] = useState(false);
  // 添加公式
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFormula, setNewFormula] = useState({
    name: '',
    formula_type: 'percentage',
    parameter: '',
    description: '',
  });
  
  useEffect(() => {
    loadFormulas();
  }, []);
  
  const loadFormulas = async () => {
    setLoading(true);
    try {
      const res = await deductionFormulasApi.list({ limit: 100 });
      setFormulas(res.data);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleInitDefaults = async () => {
    setSaving(true);
    try {
      const result = await deductionFormulasApi.initDefaults();
      toast({ title: '初始化完成', description: `创建了 ${result.created} 个公式` });
      loadFormulas();
    } catch (err: any) {
      toast({ title: '初始化失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleAdd = async () => {
    if (!newFormula.name || !newFormula.formula_type) {
      toast({ title: '请填写必填项', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      await deductionFormulasApi.create({
        name: newFormula.name,
        formula_type: newFormula.formula_type,
        parameter: newFormula.parameter ? parseFloat(newFormula.parameter) : undefined,
        description: newFormula.description || undefined,
      });
      toast({ title: '添加成功' });
      setShowAdd(false);
      setNewFormula({ name: '', formula_type: 'percentage', parameter: '', description: '' });
      loadFormulas();
    } catch (err: any) {
      toast({ title: '添加失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定删除公式「${name}」？`)) return;
    
    try {
      await deductionFormulasApi.delete(id);
      toast({ title: '删除成功' });
      loadFormulas();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };
  
  const formulaTypeLabels: Record<string, { label: string; desc: string }> = {
    none: { label: '无扣重', desc: '净重 = 毛重' },
    percentage: { label: '按比例', desc: '净重 = 毛重 × 参数' },
    fixed: { label: '固定扣重', desc: '净重 = 毛重 - 参数' },
    fixed_per_unit: { label: '按件扣重', desc: '净重 = 毛重 - 件数 × 参数' },
  };
  
  return (
    <div className="page-container">
      <div className="container mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Scale className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">扣重公式</h1>
              <p className="text-sm text-slate-500">管理毛重到净重的换算规则</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadFormulas} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />
              添加公式
            </Button>
          </div>
        </div>
        
        {/* 说明卡片 */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 mt-0.5" />
            <div className="text-sm text-indigo-800">
              <p className="font-medium mb-1">扣重公式用于采购入库时计算净重</p>
              <p className="text-indigo-600">
                例如：采购冷冻水产时，毛重100kg，使用"99扣重"公式，净重 = 100 × 0.99 = 99kg
              </p>
            </div>
          </div>
        </div>
        
        {/* 添加表单 */}
        {showAdd && (
          <div className="card-base p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">添加扣重公式</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">名称 *</label>
                <Input
                  value={newFormula.name}
                  onChange={(e) => setNewFormula({...newFormula, name: e.target.value})}
                  placeholder="如：99扣重"
                />
              </div>
              <div>
                <label className="form-label">类型 *</label>
                <Select 
                  value={newFormula.formula_type}
                  onValueChange={(v) => setNewFormula({...newFormula, formula_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无扣重</SelectItem>
                    <SelectItem value="percentage">按比例</SelectItem>
                    <SelectItem value="fixed">固定扣重</SelectItem>
                    <SelectItem value="fixed_per_unit">按件扣重</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="form-label">参数</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={newFormula.parameter}
                  onChange={(e) => setNewFormula({...newFormula, parameter: e.target.value})}
                  placeholder={newFormula.formula_type === 'percentage' ? '如 0.99' : '如 10'}
                />
              </div>
              <div>
                <label className="form-label">描述</label>
                <Input
                  value={newFormula.description}
                  onChange={(e) => setNewFormula({...newFormula, description: e.target.value})}
                  placeholder="可选说明"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? '保存中...' : '确认添加'}
              </Button>
            </div>
          </div>
        )}
        
        {/* 公式列表 */}
        <div className="card-base overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              加载中...
            </div>
          ) : formulas.length === 0 ? (
            <div className="empty-state py-16">
              <Scale className="empty-state-icon" />
              <p className="empty-state-text mb-2">暂无扣重公式</p>
              <p className="text-sm text-slate-400 mb-4">点击下方按钮快速初始化常用公式</p>
              <Button onClick={handleInitDefaults} disabled={saving}>
                {saving ? '初始化中...' : '初始化默认公式'}
              </Button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>参数</th>
                  <th>计算公式</th>
                  <th>描述</th>
                  <th className="w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {formulas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="font-medium text-slate-900">{f.name}</span>
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {formulaTypeLabels[f.formula_type]?.label || f.formula_type}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-slate-600">
                        {f.parameter !== undefined && f.parameter !== null ? f.parameter : '-'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">
                        {formulaTypeLabels[f.formula_type]?.desc || '-'}
                      </span>
                    </td>
                    <td>
                      <span className="text-slate-500">{f.description || '-'}</span>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(f.id, f.name)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* 底部提示 */}
        {formulas.length > 0 && (
          <div className="mt-4 flex justify-between items-center text-sm text-slate-500">
            <span>共 {formulas.length} 个公式</span>
            <Button variant="outline" size="sm" onClick={handleInitDefaults} disabled={saving}>
              补充默认公式
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

