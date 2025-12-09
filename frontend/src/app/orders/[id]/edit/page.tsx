'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

import { entitiesApi, productsApi, ordersApi, Entity, Product, BusinessOrder } from '@/lib/api/v3';
import { FileText, Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface OrderItemForm {
  _id: string;  // 唯一标识，用于 React key
  id?: number;
  product_id: number;
  product_name: string;
  product_unit: string;
  quantity: number;
  unit_price: number;
  notes: string;
  // 商品规格
  spec_id?: number;
  spec_name?: string;
  // 包装换算信息
  container_name?: string;
  unit_quantity?: number;
  base_unit_symbol?: string;
  // 计价方式：'container'=按件计价, 'weight'=按重量计价
  pricing_mode?: 'container' | 'weight';
}

// 生成唯一ID
let editItemIdCounter = 0;
const generateEditItemId = () => `edit_item_${Date.now()}_${++editItemIdCounter}`;

const ORDER_TYPE_LABELS: Record<string, string> = {
  loading: '装货单',
  unloading: '卸货单',
  purchase: '采购单',
  sale: '销售单',
  return_in: '客户退货单',
  return_out: '退供应商单',
};

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const orderId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<BusinessOrder | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceId, setSourceId] = useState<number>(0);
  const [targetId, setTargetId] = useState<number>(0);
  const [totalShipping, setTotalShipping] = useState(0);
  const [totalStorageFee, setTotalStorageFee] = useState(0);
  const [otherFee, setOtherFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([]);

  useEffect(() => {
    loadData();
  }, [orderId]);

  const loadData = async () => {
    try {
      const [orderData, entitiesRes] = await Promise.all([
        ordersApi.get(orderId),
        entitiesApi.list({ limit: 100 }),
      ]);

      if (!orderData) {
        toast({ title: '业务单不存在', variant: 'destructive' });
        router.push('/orders');
        return;
      }

      if (orderData.status !== 'draft') {
        toast({ title: '只能编辑草稿状态的业务单', variant: 'destructive' });
        router.push(`/orders/${orderId}`);
        return;
      }

      // 分页获取所有商品（后端限制单次最多100条）
      let allProducts: Product[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await productsApi.list({ page, limit: 100 });
        allProducts = [...allProducts, ...res.data];
        hasMore = res.data.length === 100;
        page++;
      }

      setOrder(orderData);
      setEntities(entitiesRes.data);
      setProducts(allProducts);
      setSourceId(orderData.source_id);
      setTargetId(orderData.target_id);
      setTotalShipping(orderData.total_shipping || 0);
      setTotalStorageFee(orderData.total_storage_fee || 0);
      setOtherFee(orderData.other_fee || 0);
      setNotes(orderData.notes || '');
      setItems(
        orderData.items.map((item) => ({
          _id: generateEditItemId(),  // 唯一标识
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_unit: item.product_unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: '',
          // 商品规格
          spec_id: item.spec_id,
          spec_name: item.spec_name,
          // 包装换算信息
          container_name: item.container_name,
          unit_quantity: item.unit_quantity,
          base_unit_symbol: item.base_unit_symbol,
          // 根据订单类型推断计价方式：装货单默认按件，卸货单默认按重量
          pricing_mode: item.unit_quantity && item.unit_quantity > 1
            ? (['purchase', 'loading'].includes(orderData.order_type) ? 'container' : 'weight') 
            : 'weight',
        }))
      );
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        _id: generateEditItemId(),  // 唯一标识
        product_id: 0,
        product_name: '',
        product_unit: '',
        quantity: 1,
        unit_price: 0,
        notes: '',
      },
    ]);
  };

  const updateItem = (index: number, field: keyof OrderItemForm, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index].product_name = product.name;
        newItems[index].product_unit = product.unit;
        // 从商品规格获取包装信息（选择第一个规格）
        const defaultSpec = product.specs?.find(s => s.is_default) || product.specs?.[0];
        if (defaultSpec) {
          newItems[index].spec_id = defaultSpec.id;
          newItems[index].spec_name = defaultSpec.name;
          newItems[index].container_name = defaultSpec.container_name;
          newItems[index].unit_quantity = defaultSpec.quantity;
          newItems[index].base_unit_symbol = defaultSpec.unit_symbol;
          newItems[index].pricing_mode = defaultSpec.quantity > 1
            ? (['purchase', 'loading'].includes(order?.order_type || '') ? 'container' : 'weight')
            : 'weight';
        } else {
          newItems[index].pricing_mode = 'weight';
        }
      }
    }
    // 切换计价方式时重置数量和单价
    if (field === 'pricing_mode') {
      newItems[index].quantity = 1;
      newItems[index].unit_price = 0;
    }
    setItems(newItems);
  };
  
  // 判断是否有包装规格
  const hasSpec = (item: OrderItemForm) => {
    return !!item.unit_quantity && item.unit_quantity > 1;
  };
  // 兼容旧名
  const hasCompositeUnit = hasSpec;

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateItemSubtotal = (item: OrderItemForm) =>
    item.quantity * item.unit_price;

  const calculateTotals = () => {
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    return { totalAmount, finalAmount: totalAmount + totalShipping + totalStorageFee + otherFee };
  };

  const handleSubmit = async () => {
    if (!sourceId || !targetId) {
      toast({ title: '请选择来源和目标', variant: 'destructive' });
      return;
    }
    if (items.length === 0 || items.some((item) => !item.product_id)) {
      toast({ title: '请添加商品', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        source_id: sourceId,
        target_id: targetId,
        total_shipping: totalShipping,
        total_storage_fee: totalStorageFee,
        other_fee: otherFee,
        notes: notes || undefined,
        items: items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: item.notes || undefined,
          // === 商品规格 ===
          spec_id: item.spec_id || undefined,
          spec_name: item.spec_name || undefined,
          // === 包装换算信息 ===
          container_name: item.container_name || undefined,
          unit_quantity: item.unit_quantity || undefined,
          base_unit_symbol: item.base_unit_symbol || undefined,
          // === 计价方式 ===
          pricing_mode: item.pricing_mode || 'weight',
          container_count: item.pricing_mode === 'container' ? item.quantity : (item.unit_quantity ? item.quantity / item.unit_quantity : undefined),
        })),
      };
      await ordersApi.update(orderId, payload);
      toast({ title: '保存成功' });
      router.push(`/orders/${orderId}`);
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <p>加载中...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>业务单不存在</p>
      </div>
    );
  }

  const totals = calculateTotals();
  // 退货单不允许修改来源/目标和商品
  const isReturnOrder = order.order_type.startsWith('return');
  // 判断是否是新版订单类型
  const isNewOrderType = ['loading', 'unloading'].includes(order.order_type);

  return (
    <div className="min-h-screen bg-paper-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-ink-black">
                编辑{ORDER_TYPE_LABELS[order.order_type] || '业务单'}
              </h1>
              <p className="text-sm text-ink-medium">单号：{order.order_no}</p>
            </div>
          </div>
          <Link href={`/orders/${orderId}`}>
            <Button variant="outline">取消</Button>
          </Link>
        </div>

        {/* 来源与目标 - 退货单不允许修改 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-ink-black mb-4">来源与目标</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm text-ink-dark block mb-1">来源 *</label>
              {isReturnOrder ? (
                <div className="h-10 flex items-center px-3 bg-gray-50 border border-ink-light rounded-md text-ink-dark">
                  {order.source_name}
                </div>
              ) : (
                <Select value={sourceId.toString()} onValueChange={(v) => setSourceId(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id.toString()}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <ArrowRight className="w-6 h-6 text-ink-medium mt-6" />
            <div className="flex-1">
              <label className="text-sm text-ink-dark block mb-1">目标 *</label>
              {isReturnOrder ? (
                <div className="h-10 flex items-center px-3 bg-gray-50 border border-ink-light rounded-md text-ink-dark">
                  {order.target_name}
                </div>
              ) : (
                <Select value={targetId.toString()} onValueChange={(v) => setTargetId(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id.toString()}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* 商品明细 */}
        <div className="bg-paper-light border border-ink-light rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-ink-black">商品明细</h2>
            {!isReturnOrder && (
              <Button size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                添加商品
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="text-center py-8 text-ink-medium">
              <p>请添加商品</p>
              <Button className="mt-2" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                添加第一个商品
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item._id} className="border border-ink-light rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-medium text-ink-dark">商品 #{index + 1}</span>
                    {!isReturnOrder && (
                      <button onClick={() => removeItem(index)} className="text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-ink-medium block mb-1">选择商品 *</label>
                      {isReturnOrder ? (
                        <div className="h-10 flex items-center px-3 bg-gray-50 border border-ink-light rounded-md text-ink-dark text-sm">
                          <span>{item.product_name}</span>
                          {item.spec_name && (
                            <span className="ml-2 text-xs text-amber-600">{item.spec_name}</span>
                          )}
                        </div>
                      ) : (
                        <Select
                          value={item.product_id.toString()}
                          onValueChange={(v) => updateItem(index, 'product_id', parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择商品" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name}
                                {p.specification && (
                                  <span className="ml-1 text-xs text-blue-600">[{p.specification}]</span>
                                )}
                                {p.specs && p.specs.length > 0 && (
                                  <span className="ml-2 text-xs text-amber-600">{p.unit}</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {/* 显示包装规格信息和计价方式选择 */}
                      {hasSpec(item) && item.product_id > 0 && (
                        <>
                          <p className="text-xs text-amber-600 mt-1">
                            包装规格：{item.spec_name} (1{item.container_name} = {item.unit_quantity}{item.base_unit_symbol})
                          </p>
                          {!isReturnOrder && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-ink-medium">计价方式:</span>
                              <button
                                type="button"
                                onClick={() => updateItem(index, 'pricing_mode', 'container')}
                                className={`text-xs px-2 py-1 rounded ${item.pricing_mode === 'container' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              >
                                按{item.container_name || '件'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateItem(index, 'pricing_mode', 'weight')}
                                className={`text-xs px-2 py-1 rounded ${item.pricing_mode === 'weight' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              >
                                按{item.base_unit_symbol || 'kg'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-ink-medium block mb-1">
                        {hasCompositeUnit(item) 
                          ? (item.pricing_mode === 'container'
                              ? `数量 (${item.container_name || '件'}) *`
                              : `数量 (${item.base_unit_symbol || 'kg'}) *`)
                          : `数量 (${item.product_unit || '个'}) *`
                        }
                      </label>
                      <Input
                        type="number"
                        min="0.01"
                        step={hasCompositeUnit(item) && item.pricing_mode === 'container' ? "1" : "0.01"}
                        value={item.quantity || ''}
                        onChange={(e) =>
                          updateItem(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))
                        }
                        onBlur={(e) => {
                          if (!e.target.value || parseFloat(e.target.value) < 0) updateItem(index, 'quantity', 1);
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                      {/* 复式单位：显示换算信息 */}
                      {hasCompositeUnit(item) && item.pricing_mode === 'container' && item.quantity > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          = {(item.quantity * (item.unit_quantity || 0)).toLocaleString()} {item.base_unit_symbol || 'kg'}
                        </p>
                      )}
                      {hasCompositeUnit(item) && item.pricing_mode === 'weight' && item.quantity > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          ≈ {(item.quantity / (item.unit_quantity || 1)).toFixed(1)} {item.container_name || '件'}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-ink-medium block mb-1">
                        单价 {hasCompositeUnit(item) && (item.pricing_mode === 'container' 
                          ? `(元/${item.container_name || '件'})` 
                          : `(元/${item.base_unit_symbol || 'kg'})`)} *
                      </label>
                      {isReturnOrder ? (
                        <div className="h-10 flex items-center px-3 bg-gray-50 border border-ink-light rounded-md text-ink-dark text-sm">
                          {formatAmount(item.unit_price)}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price || ''}
                          onChange={(e) =>
                            updateItem(index, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))
                          }
                          onBlur={(e) => {
                            if (!e.target.value) updateItem(index, 'unit_price', 0);
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-ink-medium block mb-1">小计</label>
                      <div className="h-10 flex items-center font-medium text-ink-black">
                        {formatAmount(calculateItemSubtotal(item))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 备注和金额汇总 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-paper-light border border-ink-light rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ink-black mb-4">备注</h2>
            <textarea
              className="w-full h-24 p-3 border border-ink-light rounded-lg resize-none"
              placeholder="输入备注信息..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-800 mb-4">金额汇总</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-medium">商品金额：</span>
                <span className="text-ink-dark">{formatAmount(totals.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-ink-medium">运费：</span>
                <div className="flex items-center gap-2">
                  <span>+</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 h-8"
                    value={totalShipping || ''}
                    onChange={(e) => setTotalShipping(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    onBlur={(e) => {
                      if (!e.target.value) setTotalShipping(0);
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-ink-medium">冷藏费：</span>
                <div className="flex items-center gap-2">
                  <span>+</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 h-8"
                    value={totalStorageFee || ''}
                    onChange={(e) => setTotalStorageFee(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    onBlur={(e) => {
                      if (!e.target.value) setTotalStorageFee(0);
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-ink-medium">其他费用：</span>
                <div className="flex items-center gap-2">
                  <span>+</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 h-8"
                    value={otherFee || ''}
                    onChange={(e) => setOtherFee(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    onBlur={(e) => {
                      if (!e.target.value) setOtherFee(0);
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>
              <div className="border-t border-amber-200 pt-2 mt-2">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-amber-800">最终金额：</span>
                  <span className="text-amber-600">{formatAmount(totals.finalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-4">
          <Link href={`/orders/${orderId}`}>
            <Button variant="outline" size="lg">
              取消
            </Button>
          </Link>
          <Button size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              '保存修改'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

