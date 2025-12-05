'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, Package2, Pencil, RefreshCcw, Truck, UserCircle2, Warehouse, Store, DollarSign, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { BusinessOrder, ORDER_STATUS_MAP, ORDER_TYPE_MAP, ordersApi, entitiesApi, Entity } from '@/lib/api/v3';

import { Trash2 } from 'lucide-react';

type ActionKey = 'complete' | 'return';
const ACTION_LABELS: Record<ActionKey, string> = { complete: '确认完成', return: '发起退货' };
const ACTIONS_BY_STATUS: Partial<Record<BusinessOrder['status'], { action: ActionKey; label: string; variant?: 'outline' | 'ghost'; confirm?: boolean }[]>> = {
  draft: [{ action: 'complete', label: '确认完成' }],
  completed: [{ action: 'return', label: '发起退货流程', variant: 'outline' }],
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [order, setOrder] = useState<BusinessOrder | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [returnNotes, setReturnNotes] = useState('');
  const [returnShipping, setReturnShipping] = useState<string>('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [returnSelections, setReturnSelections] = useState<Record<number, number>>({});
  const orderId = useMemo(() => Number(Array.isArray(params.id) ? params.id[0] : params.id), [params.id]);

  useEffect(() => { loadOrder(); }, [orderId]);

  const loadOrder = async () => {
    if (!orderId || Number.isNaN(orderId)) return;
    try {
      setLoading(true);
      setError(null);
      
      const data = await ordersApi.get(orderId);
      setOrder(data);
      if (data) {
        setReturnTargetId(data.source_id);
      }
    }
    catch (err: any) { setError(err.message || '加载失败'); }
    finally { setLoading(false); }
  };

  const handleAction = async (action: ActionKey) => {
    if (!order) return;
    if (action === 'return') {
      await openReturnDialog();
      return;
    }
    // complete action - confirm before proceeding
    if (action === 'complete' && !confirm('确认完成该业务单？完成后将影响库存和账款。')) return;
    try { setActionLoading(action); const updated = await ordersApi.action(order.id, { action, description: ACTION_LABELS[action] }); setOrder(updated); toast({ title: '操作成功', description: ACTION_LABELS[action] }); }
    catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'destructive' }); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    if (!order) return;
    if (!confirm('确定要删除该业务单吗？此操作不可恢复，会回滚相关库存和账款变动。')) return;
    try {
      await ordersApi.delete(order.id);
      toast({ title: '删除成功' });
      router.push('/orders');
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  // 取消草稿单据（直接删除）
  const handleCancel = async () => {
    if (!order) return;
    if (!confirm('确定要取消该业务单吗？')) return;
    try {
      await ordersApi.delete(order.id);
      toast({ title: '已取消', description: '业务单已取消' });
      router.push('/orders');
    } catch (err: any) {
      toast({ title: '取消失败', description: err.message, variant: 'destructive' });
    }
  };

  const ensureEntitiesLoaded = async () => {
    if (entities.length > 0) return;
    try {
      setLoadingEntities(true);
      const res = await entitiesApi.list({ page: 1, limit: 100 });
      setEntities(res.data);
    } catch (err: any) {
      toast({ title: '加载实体失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingEntities(false);
    }
  };

  const selectableEntities = useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>();
    if (order) {
      map.set(order.source_id, { id: order.source_id, name: order.source_name, code: order.source_code });
      map.set(order.target_id, { id: order.target_id, name: order.target_name, code: order.target_code });
    }
    entities.forEach((entity) => {
      map.set(entity.id, { id: entity.id, name: entity.name, code: entity.code });
    });
    return Array.from(map.values());
  }, [entities, order]);

  const buildReturnSelections = (current: BusinessOrder) => {
    const defaults: Record<number, number> = {};
    current.items.forEach(item => {
      if (!item.original_item_id) {
        const available = item.returnable_quantity ?? 0;
        if (available > 0) {
          defaults[item.id] = available;
        }
      }
    });
    return defaults;
  };

  const openReturnDialog = async () => {
    if (!order) return;
    if (!isReturnableType) {
      toast({ title: '无法退货', description: '仅采购/销售单支持退货', variant: 'destructive' });
      return;
    }
    if (!hasReturnableItems) {
      toast({ title: '无法退货', description: '该单据已无可退数量', variant: 'destructive' });
      return;
    }
    await ensureEntitiesLoaded();
    setReturnSelections(buildReturnSelections(order));
    setShowReturnDialog(true);
  };

  const handleSubmitReturn = async () => {
    if (!order) return;
    try {
      if (!returnTargetId) {
        toast({ title: '请选择退货目标实体', variant: 'destructive' });
        return;
      }
      const shippingValue = parseFloat(returnShipping);
      if (isNaN(shippingValue) || shippingValue < 0) {
        toast({ title: '请输入退货运费', description: '运费不能为空', variant: 'destructive' });
        return;
      }
      const entries = Object.entries(returnSelections).filter(([, qty]) => qty > 0);
      if (entries.length === 0) {
        toast({ title: '请输入退货数量', description: '至少选择一件商品退货', variant: 'destructive' });
        return;
      }
      const itemMap = new Map(order.items.map(item => [item.id, item]));
      for (const [id, qty] of entries) {
        const item = itemMap.get(Number(id));
        const maxQty = item?.returnable_quantity ?? 0;
        if (!item || maxQty <= 0) {
          toast({ title: '退货失败', description: '存在不可退的商品', variant: 'destructive' });
          return;
        }
        if (qty > maxQty) {
          toast({ title: '退货数量超出', description: `${item.product_name} 最多可退 ${maxQty}`, variant: 'destructive' });
          return;
        }
      }
      setActionLoading('return');
      const payload = {
        action: 'return',
        description: ACTION_LABELS.return,
        notes: returnNotes || undefined,
        return_target_id: returnTargetId,
        return_date: returnDate ? new Date(returnDate).toISOString() : undefined,
        return_items: entries.map(([id, qty]) => ({ order_item_id: Number(id), quantity: qty })),
        return_shipping: shippingValue,
      };
      const updated = await ordersApi.action(order.id, payload);
      setOrder(updated);
      toast({ title: '已发起退货流程' });
      setShowReturnDialog(false);
      setReturnNotes('');
      setReturnShipping('');
      setReturnSelections({});
    } catch (err: any) {
      toast({ title: '退货失败', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount?: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount || 0);
  const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString('zh-CN') : '-';
  const rawActions = order ? ACTIONS_BY_STATUS[order.status] ?? [] : [];
  const isAdmin = true;
  const canDeleteOrder = order && (isAdmin || (order.status === 'draft' && true));
  const isReturnableType = order ? ['purchase', 'sale'].includes(order.order_type) : false;
  const hasReturnableItems = order ? order.items.some(item => !item.original_item_id && (item.returnable_quantity ?? 0) > 0) : false;
  const returnableItems = order ? order.items.filter(item => !item.original_item_id && (item.returnable_quantity ?? 0) > 0) : [];
  const totalReturnQty = Object.values(returnSelections).reduce((sum, qty) => sum + (qty || 0), 0);
  const availableActions = rawActions.filter(action => action.action !== 'return' || (isReturnableType && hasReturnableItems));

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-ink-medium"><Loader2 className="w-6 h-6 mr-2 animate-spin" />正在加载业务单...</div>;
  if (error || !order) return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><p className="text-ink-medium">{error || '未找到该业务单'}</p><div className="flex gap-2"><Button onClick={loadOrder} variant="outline"><RefreshCcw className="w-4 h-4 mr-2" />重试</Button><Link href="/orders"><Button variant="ghost">返回列表</Button></Link></div></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        {showReturnDialog && order && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 space-y-4 border border-ink-light">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-ink-black">发起退货流程</h3>
                <button
                  onClick={() => setShowReturnDialog(false)}
                  className="text-ink-medium hover:text-ink-black"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-ink-medium">
                系统会自动生成一张退货业务单，并关联当前单据（{order.order_no}）。
              </p>
              <div className="space-y-2">
                <label className="text-sm text-ink-dark">退货明细 *</label>
                {returnableItems.length === 0 ? (
                  <p className="text-sm text-red-500">该单据已无可退数量。</p>
                ) : (
                  <div className="border border-ink-light rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-paper-medium text-ink-medium">
                        <tr>
                          <th className="px-3 py-2 text-left">商品</th>
                          <th className="px-3 py-2 text-center">原数量</th>
                          <th className="px-3 py-2 text-center">已退</th>
                          <th className="px-3 py-2 text-center">可退</th>
                          <th className="px-3 py-2 text-center">本次退货</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnableItems.map(item => {
                          const available = item.returnable_quantity ?? 0;
                          const value = returnSelections[item.id] ?? 0;
                          return (
                            <tr key={item.id} className="border-t border-ink-light/50">
                              <td className="px-3 py-2">
                                <p className="font-medium text-ink-black">{item.product_name}</p>
                                <p className="text-xs text-ink-medium">{item.product_code} · {item.product_unit}</p>
                              </td>
                              <td className="px-3 py-2 text-center">{item.quantity}</td>
                              <td className="px-3 py-2 text-center text-amber-600">{item.returned_quantity ?? 0}</td>
                              <td className="px-3 py-2 text-center text-green-600 font-semibold">{available}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={available}
                                  value={value}
                                  onChange={(e) => {
                                    const next = Math.max(0, Math.min(Number(e.target.value) || 0, available));
                                    setReturnSelections((prev) => ({ ...prev, [item.id]: next }));
                                  }}
                                  className="w-24 border border-ink-light rounded px-2 py-1 text-center"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="text-xs text-ink-medium flex justify-between">
                  <span>最多可退 {returnableItems.reduce((sum, item) => sum + (item.returnable_quantity ?? 0), 0)} 件</span>
                  <span>已选择退货 {totalReturnQty} 件</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-ink-dark">退回目标实体 *</label>
                <select
                  className="w-full border border-ink-light rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={returnTargetId ?? ''}
                  onChange={(e) => setReturnTargetId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loadingEntities}
                >
                  <option value="">请选择实体</option>
                  {selectableEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}（{entity.code}）
                    </option>
                  ))}
                </select>
                {!loadingEntities && selectableEntities.length === 0 && (
                  <p className="text-xs text-ink-medium">暂无实体，请先在实体管理中创建。</p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-ink-dark">退货日期</label>
                  <input
                    type="date"
                    className="w-full border border-ink-light rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-ink-dark">退货运费 *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-medium">¥</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-full border border-ink-light rounded-md pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={returnShipping}
                      onChange={(e) => setReturnShipping(e.target.value)}
                      placeholder="请输入退货运费"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-ink-dark">备注（可选）</label>
                <textarea
                  className="w-full border border-ink-light rounded-md px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="填写退货原因、物流信息等"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowReturnDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmitReturn} disabled={actionLoading === 'return' || totalReturnQty === 0}>
                  {actionLoading === 'return' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  提交退货
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Button variant="ghost" className="w-fit px-0 text-ink-medium hover:text-ink-black" onClick={() => router.push('/orders')}><ArrowLeft className="w-4 h-4 mr-2" />返回业务单列表</Button>
            <div><div className="flex items-center gap-3 flex-wrap"><h1 className="text-2xl font-bold text-ink-black flex items-center gap-2"><FileText className="w-6 h-6 text-amber-600" />{order.order_no}</h1><span className={`text-xs px-2 py-1 rounded ${ORDER_TYPE_MAP[order.order_type]?.color || 'bg-gray-100'}`}>{order.type_display}</span><span className={`text-xs px-2 py-1 rounded ${ORDER_STATUS_MAP[order.status]?.color || 'bg-gray-100'}`}>{order.status_display}</span></div><p className="text-ink-medium mt-1">业务日期：{new Date(order.order_date).toLocaleDateString('zh-CN')}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* 管理员超删按钮 - 只有已完成的单据才显示 */}
            {canDeleteOrder && order.status === 'completed' && (
              <Button
                variant="outline"
                onClick={handleDelete}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />删除
              </Button>
            )}
            {/* 草稿状态：取消和编辑按钮 */}
            {order.status === 'draft' && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  取消
                </Button>
                <Link href={`/orders/${order.id}/edit`}>
                  <Button variant="outline">
                    <Pencil className="w-4 h-4 mr-2" />编辑
                  </Button>
                </Link>
              </>
            )}
            {availableActions.length > 0 && availableActions.map(item => (
              <Button
                key={item.action}
                variant={item.variant || 'default'}
                onClick={() => handleAction(item.action)}
                disabled={Boolean(actionLoading)}
              >
                {actionLoading === item.action ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 业务流向卡片 - 来源 → 目标 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-4">
            {/* 来源实体 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                {order.order_type === 'purchase' ? (
                  <><Store className="w-3.5 h-3.5" />供应商</>
                ) : order.order_type === 'sale' ? (
                  <><Warehouse className="w-3.5 h-3.5" />出库仓库</>
                ) : (
                  <><Warehouse className="w-3.5 h-3.5" />源仓库</>
                )}
              </div>
              <p className="text-lg font-semibold text-slate-900 truncate">{order.source_name}</p>
              <p className="text-xs text-slate-400">{order.source_code}</p>
            </div>
            
            {/* 流向箭头 */}
            <div className="flex items-center shrink-0 px-3">
              <div className="w-12 h-px bg-gradient-to-r from-slate-200 to-amber-300"></div>
              <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-1">
                <ArrowRight className="w-4 h-4 text-amber-500" />
              </div>
              <div className="w-12 h-px bg-gradient-to-r from-amber-300 to-slate-200"></div>
            </div>
            
            {/* 目标实体 */}
            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center justify-end gap-2 text-xs text-slate-400 mb-1">
                {order.order_type === 'purchase' ? (
                  <><Warehouse className="w-3.5 h-3.5" />入库仓库</>
                ) : order.order_type === 'sale' ? (
                  <><Store className="w-3.5 h-3.5" />客户</>
                ) : (
                  <><Warehouse className="w-3.5 h-3.5" />目标仓库</>
                )}
              </div>
              <p className="text-lg font-semibold text-slate-900 truncate">{order.target_name}</p>
              <p className="text-xs text-slate-400">{order.target_code}</p>
            </div>
          </div>
        </div>

        {/* 金额明细卡片 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-slate-900">金额明细</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-6">
              <div className="min-w-[120px]">
                <p className="text-sm text-slate-500 mb-1">商品金额</p>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(order.total_amount)}</p>
              </div>
              {order.total_shipping > 0 && (
                <div className="min-w-[100px]">
                  <p className="text-sm text-slate-500 mb-1">运费</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(order.total_shipping)}</p>
                </div>
              )}
              {order.total_storage_fee > 0 && (
                <div className="min-w-[100px]">
                  <p className="text-sm text-slate-500 mb-1">冷藏费</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(order.total_storage_fee)}</p>
                </div>
              )}
              <div className="ml-auto bg-gradient-to-br from-amber-50 to-orange-50 -m-3 p-3 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-700 mb-1 font-medium">应收/应付总额</p>
                <p className="text-2xl font-bold text-amber-700">{formatCurrency(order.final_amount)}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-sm text-slate-500">
              <span>业务日期：{new Date(order.order_date).toLocaleDateString('zh-CN')}</span>
              {order.loading_date && <span>装货：{new Date(order.loading_date).toLocaleDateString('zh-CN')}</span>}
              {order.unloading_date && <span>卸货：{new Date(order.unloading_date).toLocaleDateString('zh-CN')}</span>}
            </div>
          </div>
        </div>

        {order.related_order && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-slate-900">关联原始单据</h3>
              </div>
              <Link href={`/orders/${order.related_order.id}`} className="text-amber-600 text-sm hover:text-amber-700 font-medium">
                查看原单 →
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-slate-900 font-medium">{order.related_order.order_no}</span>
              <span className="text-slate-500">{order.related_order.type_display}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${ORDER_STATUS_MAP[order.related_order.status]?.color || 'bg-gray-100'}`}>
                {order.related_order.status_display}
              </span>
            </div>
          </div>
        )}

        {order.return_orders && order.return_orders.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-orange-500" />
                <h3 className="font-semibold text-slate-900">关联退货记录</h3>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">共 {order.return_orders.length} 条</span>
            </div>
            <div className="space-y-2">
              {order.return_orders.map(ret => (
                <Link 
                  key={ret.id} 
                  href={`/orders/${ret.id}`} 
                  className="flex justify-between items-center px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-amber-200 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900">{ret.order_no}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{ret.type_display} · {ret.status_display}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">数量 <span className="text-slate-900 font-medium">{ret.total_quantity}</span></p>
                    <p className="text-amber-600 font-semibold">{formatCurrency(ret.final_amount)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Package2 className="w-5 h-5 text-amber-600" />商品明细
            </h2>
            <span className="text-sm text-slate-500">共 {order.items.length} 项</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">商品</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">数量</th>
                  {order.items.some(item => item.gross_weight) && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">毛重/净重</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">单价</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">小计</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">{item.product_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.product_code}
                        {item.spec_name && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                            {item.spec_name}
                          </span>
                        )}
                        {item.unit_quantity && item.unit_quantity > 1 && (
                          <span className="ml-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
                            {item.container_name}({item.unit_quantity}{item.base_unit_symbol})
                          </span>
                        )}
                      </p>
                      {/* 退货状态标签 - 仅在有退货记录时显示 */}
                      {!item.original_item_id && (item.returned_quantity ?? 0) > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-xs">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                            已退 {item.returned_quantity}
                          </span>
                          {(item.returnable_quantity ?? 0) > 0 && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                              可退 {item.returnable_quantity}
                            </span>
                          )}
                        </div>
                      )}
                      {item.original_item_id && order.related_order && (
                        <Link 
                          href={`/orders/${order.related_order.id}`} 
                          className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          来自退货
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {item.unit_quantity && item.unit_quantity > 1 ? (
                        <div>
                          <div className="font-semibold text-slate-900">
                            {(item.quantity * item.unit_quantity).toLocaleString()} {item.base_unit_symbol}
                          </div>
                          <div className="text-xs text-slate-500">
                            ({item.quantity} {item.container_name})
                          </div>
                        </div>
                      ) : (
                        <span className="font-medium text-slate-900">
                          {item.quantity} <span className="text-slate-500 font-normal">{item.product_unit}</span>
                        </span>
                      )}
                    </td>
                    {order.items.some(i => i.gross_weight) && (
                      <td className="px-4 py-4 text-sm">
                        {item.gross_weight ? (
                          <div>
                            <p className="text-slate-900">毛重: <span className="font-medium">{item.gross_weight}</span> kg</p>
                            <p className="text-xs text-slate-500">净重: {item.quantity} kg</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-4 text-sm text-slate-700">{formatCurrency(item.unit_price)}</td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-900">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={order.items.some(i => i.gross_weight) ? 4 : 3} className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                    商品合计
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-slate-900">
                    {formatCurrency(order.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />流程记录
            </h3>
            <div className="space-y-4">
              {order.flows.length === 0 && <p className="text-slate-500 text-sm">暂无流程记录</p>}
              {order.flows.map((flow, index) => (
                <div key={flow.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="w-3 h-3 rounded-full bg-amber-500 mt-1.5" />
                    {index < order.flows.length - 1 && <span className="flex-1 w-px bg-slate-200 mt-1" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="font-medium text-slate-900">{flow.type_display}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{flow.operator_name || '系统'} · {formatDateTime(flow.operated_at)}</p>
                    {flow.description && <p className="text-sm text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1">备注：{flow.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-600" />单据信息
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">装货日期</span>
                <span className={order.loading_date ? 'text-slate-900' : 'text-slate-400'}>
                  {order.loading_date ? new Date(order.loading_date).toLocaleDateString('zh-CN') : '未设置'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">卸货日期</span>
                <span className={order.unloading_date ? 'text-slate-900' : 'text-slate-400'}>
                  {order.unloading_date ? new Date(order.unloading_date).toLocaleDateString('zh-CN') : '未设置'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">单据状态</span>
                <span className={order.completed_at ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                  {order.completed_at ? '已完成' : '草稿'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">备注</p>
              <p className="text-sm text-slate-600 min-h-[60px] bg-slate-50 border border-slate-200 rounded-lg p-3">
                {order.notes || '暂无备注'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

