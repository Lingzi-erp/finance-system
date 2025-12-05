'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { productsApi, Product, categoriesApi, CategoryTreeNode } from '@/lib/api/v3';
import { Package, Plus, Search, Edit, Trash2, X, FolderTree, ChevronRight, ChevronDown, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';

const UNITS = ['个', '件', '箱', '套', '台', '只', '把', '张', '瓶', '包', '卷', 'kg', 'g', 't', 'm', 'cm', 'L', 'mL'];

export default function ProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // 分类树
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  
  // 编辑表单（仅用于快速编辑）
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', specification: '', unit: '个', category: '', description: '' });

  const canCreate = true;
  const canEdit = true;
  const canDelete = true;

  useEffect(() => { 
    loadInitialData();
  }, []);
  
  useEffect(() => { 
    loadProducts(); 
  }, [page, search, categoryFilter]);

  const loadInitialData = async () => {
    try {
      // 加载分类树
      const tree = await categoriesApi.tree(true);
      setCategoryTree(tree);
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await productsApi.list({ 
        page, 
        limit: 20, 
        search: search || undefined,
        category: categoryFilter || undefined
      });
      setProducts(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) { toast.error('请填写品名'); return; }
    try {
      if (editingId) { 
        await productsApi.update(editingId, formData); 
        toast.success('更新成功'); 
      }
      setShowForm(false); 
      setEditingId(null); 
      resetForm(); 
      loadProducts();
    } catch (err: any) { 
      toast.error(`操作失败: ${err.message}`); 
    }
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData({ 
      name: product.name, 
      specification: product.specification || '', 
      unit: product.unit, 
      category: product.category || '', 
      description: product.description || '' 
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除吗？')) return;
    try { 
      await productsApi.delete(id); 
      toast.success('删除成功'); 
      loadProducts(); 
    } catch (err: any) { 
      toast.error(`删除失败: ${err.message}`); 
    }
  };

  const resetForm = () => { 
    setFormData({ name: '', specification: '', unit: '个', category: '', description: '' }); 
  };

  const toggleCategory = (id: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const selectCategory = (category: CategoryTreeNode, path: string[] = []) => {
    const fullPath = [...path, category.name].join(' > ');
    setCategoryFilter(fullPath);
    setPage(1);
  };

  // 递归渲染分类树
  const renderCategoryTree = (nodes: CategoryTreeNode[], path: string[] = [], level = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedCategories.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const fullPath = [...path, node.name].join(' > ');
      const isSelected = categoryFilter === fullPath;
      
      return (
        <div key={node.id} className={level > 0 ? 'ml-4' : ''}>
          <div
            className={`
              flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors
              ${isSelected ? 'bg-amber-100 text-amber-800' : 'hover:bg-slate-100'}
            `}
          >
            <div 
              className="flex items-center gap-2 flex-1"
              onClick={() => selectCategory(node, path)}
            >
              <FolderTree className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm">{node.name}</span>
              {node.products_count > 0 && (
                <span className="text-xs text-slate-400">({node.products_count})</span>
              )}
            </div>
            {hasChildren && (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleCategory(node.id); }}
                className="p-1 hover:bg-slate-200 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>
            )}
          </div>
          {hasChildren && isExpanded && (
            <div className="border-l border-slate-200 ml-3">
              {renderCategoryTree(node.children, [...path, node.name], level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading && products.length === 0) {
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
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">商品档案</h1>
              <p className="text-sm text-slate-500">管理商品基础信息，价格在交易时确定</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/products/settings">
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                分类/规格/单位
              </Button>
            </Link>
            {canCreate && (
              <Link href="/products/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  新建商品
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 编辑表单 */}
        {showForm && editingId && canEdit && (
          <div className="card-base p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-900">编辑商品</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="form-label">品名 *</label>
                <Input 
                  value={formData.name} 
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} 
                  placeholder="商品名称" 
                />
              </div>
              <div>
                <label className="form-label">规格型号</label>
                <Input 
                  value={formData.specification} 
                  onChange={e => setFormData(p => ({ ...p, specification: e.target.value }))} 
                  placeholder="如：100x50cm" 
                />
              </div>
              <div>
                <label className="form-label">计量单位</label>
                <Select value={formData.unit} onValueChange={v => setFormData(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="form-label">分类</label>
                <Input 
                  value={formData.category} 
                  onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} 
                  placeholder="商品分类" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit}>更新</Button>
            </div>
          </div>
        )}

        {/* 筛选栏 */}
        <div className="filter-panel">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="form-label">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="搜索品名或编码..." 
                  value={search} 
                  onChange={e => { setSearch(e.target.value); setPage(1); }} 
                  className="pl-10" 
                />
              </div>
            </div>
            
            <div className="min-w-[200px]">
              <label className="form-label">分类筛选</label>
              <div className="relative">
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => setShowCategoryPanel(!showCategoryPanel)}
                >
                  <span className={categoryFilter ? 'text-slate-900' : 'text-slate-400'}>
                    {categoryFilter || '选择分类...'}
                  </span>
                  <FolderTree className="w-4 h-4 ml-2" />
                </Button>
                
                {showCategoryPanel && (
                  <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
                    <div className="p-2 border-b border-slate-100">
                      <button
                        onClick={() => { setCategoryFilter(''); setShowCategoryPanel(false); setPage(1); }}
                        className="w-full text-left p-2 text-sm text-slate-500 hover:bg-slate-50 rounded-lg"
                      >
                        全部分类
                      </button>
                    </div>
                    <div className="p-2">
                      {categoryTree.length > 0 ? (
                        renderCategoryTree(categoryTree)
                      ) : (
                        <p className="text-center text-slate-400 py-4 text-sm">暂无分类</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {categoryFilter && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setCategoryFilter(''); setPage(1); }}
                className="text-slate-500"
              >
                <X className="w-4 h-4 mr-1" />
                清除筛选
              </Button>
            )}
            
            <div className="text-sm text-slate-500">
              共 {total} 条
            </div>
          </div>
        </div>

        {/* 商品列表 */}
        <div className="card-base overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>品名/编码</th>
                <th>规格型号</th>
                <th>计量单位</th>
                <th>分类</th>
                <th>包装规格</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id}>
                  <td>
                    <div className="font-medium text-slate-900">{product.name}</div>
                    <div className="text-xs text-slate-400">{product.code}</div>
                  </td>
                  <td className="text-slate-600">{product.specification || '-'}</td>
                  <td>
                    {/* 优先显示包装规格中的基础单位，否则显示商品单位 */}
                    <span className="badge badge-neutral">
                      {product.specs?.[0]?.unit_symbol || product.unit?.split('(')[0] || product.unit}
                    </span>
                  </td>
                  <td className="text-slate-600">{product.category || '-'}</td>
                  <td>
                    {product.specs && product.specs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {product.specs.slice(0, 3).map(spec => (
                          <span key={spec.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                            {spec.name}
                          </span>
                        ))}
                        {product.specs.length > 3 && (
                          <span className="text-xs text-slate-400">+{product.specs.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {canEdit && (
                        <Link href={`/products/${product.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {products.length === 0 && !loading && (
          <div className="empty-state">
            <Package className="empty-state-icon" />
            <p className="empty-state-text">暂无商品</p>
            {canCreate && (
              <Link href="/products/new">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  创建第一个
                </Button>
              </Link>
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
      
      {/* 点击其他区域关闭分类面板 */}
      {showCategoryPanel && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowCategoryPanel(false)}
        />
      )}
    </div>
  );
}
