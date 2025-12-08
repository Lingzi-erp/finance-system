'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { entitiesApi, productsApi, ordersApi, stocksApi, batchesApi, deductionFormulasApi, Entity, Product, OrderCreateData, WarehouseStock, StockBatch, DeductionFormula } from '@/lib/api/v3';
import { FileText, Plus, Trash2, ArrowRight, AlertTriangle, Truck, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ProductSpec } from '@/lib/api/v3/products';

// 批次分配
interface BatchAllocation {
  batch_id: number;
  batch_no: string;
  quantity: number;
  available: number;
  cost_price: number;
  received_at?: string;  // 批次入库日期，用于计算冷藏费
}

interface OrderItemForm { 
  _id: string;  // 唯一标识，用于 React key（解决输入框失焦问题）
  product_id: number; 
  product_name: string; 
  product_unit: string;
  // 商品可用的规格列表（从 ProductSpec 获取）
  product_specs?: ProductSpec[];
  // 选中的规格
  spec_id?: number;
  spec_name?: string;
  // 包装换算信息（从选中的 ProductSpec 获取）
  container_name?: string;        // 容器名称：件、箱
  unit_quantity?: number;         // 每件数量：15
  base_unit_symbol?: string;      // 基础单位：kg
  // 计价方式：'container'=按件计价, 'weight'=按重量计价
  pricing_mode?: 'container' | 'weight';
  quantity: number;  // 根据计价方式：按件时是件数，按重量时是kg数
  unit_price: number;  // 根据计价方式：按件时是元/件，按重量时是元/kg
  shipping_cost: number; 
  notes: string; 
  available_quantity?: number;
  // 运输信息
  plate_number?: string;
  driver_phone?: string;
  logistics_company?: string;
  invoice_no?: string;
  // 采购单用
  gross_weight?: number;
  deduction_formula_id?: number;
  unit_count?: number;  // 件数（按件扣重时使用）
  storage_rate?: number;
  // 销售单用
  batch_allocations?: BatchAllocation[];
}

// 生成唯一ID
let itemIdCounter = 0;
const generateItemId = () => `item_${Date.now()}_${++itemIdCounter}`;

export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderType, setOrderType] = useState(searchParams.get('type') || 'purchase');
  const [sourceId, setSourceId] = useState<number>(0);
  const [targetId, setTargetId] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [formulas, setFormulas] = useState<DeductionFormula[]>([]);
  const [productBatches, setProductBatches] = useState<Record<number, StockBatch[]>>({});
  const [showBatchSelector, setShowBatchSelector] = useState<number | null>(null); // 当前正在选择批次的明细索引
  
  // 单据级别的运输信息
  const [logisticsCompanyId, setLogisticsCompanyId] = useState<number>(0);
  const [plateNumber, setPlateNumber] = useState('');  // 车牌号（手动填写）
  const [driverPhone, setDriverPhone] = useState('');  // 司机电话（每次运输可能不同）
  const [invoiceNo, setInvoiceNo] = useState('');
  const [shippingCost, setShippingCost] = useState<number>(0); // 运费（手动输入）
  const [otherFee, setOtherFee] = useState<number>(0); // 其他费用（手动输入）
  const [calculateStorageFee, setCalculateStorageFee] = useState<boolean>(true); // 是否计算冷藏费
  
  // 装卸货日期
  const [loadingDate, setLoadingDate] = useState<string>('');
  const [unloadingDate, setUnloadingDate] = useState<string>('');
  
  // 自动计算冷藏费 - 直接计算，每次渲染都重新计算
  // 采购单：每吨15元（入库费）
  // 销售单：每吨15元（出库费）+ 每吨每天1.5元（存储费）
  // 存储天数 = 装货日期 - 批次入库日期
  const calculateStorageFeeNow = (): number => {
    if (!calculateStorageFee) return 0;
    
    const baseRatePerTon = 15;
    const storageCostPerTonPerDay = 1.5;
    
    if (orderType === 'purchase') {
      const totalWeight = items.reduce((sum, item) => {
        if (!item.spec_id || !item.unit_quantity) return sum + item.quantity;
        if (item.pricing_mode === 'container') return sum + item.quantity * item.unit_quantity;
        return sum + item.quantity;
      }, 0);
      const weightTons = totalWeight / 1000;
      return Math.round(weightTons * baseRatePerTon * 100) / 100;
    } else if (orderType === 'sale') {
      if (!loadingDate) return 0;
      
      let totalStorageFee = 0;
      
      items.forEach(item => {
        if (!item.product_id) return;
        
        let itemWeight = item.quantity;
        if (item.spec_id && item.unit_quantity && item.pricing_mode === 'container') {
          itemWeight = item.quantity * item.unit_quantity;
        }
        const itemWeightTons = itemWeight / 1000;
        const baseFee = itemWeightTons * baseRatePerTon;
        
        let storageDays = 0;
        if (item.batch_allocations?.[0]?.received_at) {
          const loadDate = new Date(loadingDate);
          const receivedDate = new Date(item.batch_allocations[0].received_at);
          loadDate.setHours(0, 0, 0, 0);
          receivedDate.setHours(0, 0, 0, 0);
          const diffTime = loadDate.getTime() - receivedDate.getTime();
          // 存储天数 = 装货日期 - 入库日期 + 1（入库当天算一天）
          storageDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
        }
        
        const storageCost = itemWeightTons * storageDays * storageCostPerTonPerDay;
        totalStorageFee += baseFee + storageCost;
      });
      
      return Math.round(totalStorageFee * 100) / 100;
    }
    return 0;
  };
  
  // 每次渲染时计算冷藏费
  const storageFee = calculateStorageFeeNow();
  
  // 物流公司列表
  const logisticsCompanies = entities.filter(e => e.entity_type.includes('logistics'));
  
  // 商品搜索
  const [productSearch, setProductSearch] = useState('');
  
  // 判断商品是否有包装规格
  const hasSpec = (item: OrderItemForm) => {
    return !!item.spec_id && !!item.unit_quantity;
  };
  
  // 判断规格是否为散装（按基础单位计价）
  const isSpecBulk = (item: OrderItemForm) => {
    // 如果每单位数量是1且名称包含"散装"，视为散装
    return (item.unit_quantity === 1 && item.spec_name?.includes('散装'));
  };
  
  // 获取当前规格的容器名称（件、箱等）
  const getContainerName = (item: OrderItemForm) => {
    if (!hasSpec(item)) return '';
    return item.container_name || '件';
  };
  
  // 获取基础单位符号（kg等）
  const getBaseUnit = (item: OrderItemForm) => {
    return item.base_unit_symbol || item.product_unit || 'kg';
  };
  
  // 兼容旧的 hasCompositeUnit 函数
  const hasCompositeUnit = (item: OrderItemForm) => hasSpec(item);
  
  // 计算商品的实际毛重（用于运费计算等）
  const getItemWeight = (item: OrderItemForm) => {
    // 优先使用录入的毛重
    if (item.gross_weight) {
      return item.gross_weight;
    }
    if (!hasSpec(item)) {
      return item.quantity;
    }
    if (isSpecBulk(item)) {
      // 散装：直接是重量
      return item.quantity;
    }
    // 按件：件数 × 每件重量
    return item.quantity * (item.unit_quantity || 0);
  };
  
  // 计算总毛重（汇总所有商品的重量，仅用于参考显示）
  const totalGrossWeight = items.reduce((sum, item) => {
    return sum + getItemWeight(item);
  }, 0);

  useEffect(() => { loadBaseData(); }, []);
  
  // 当销售来源是仓库时，加载该仓库的库存
  useEffect(() => {
    if (orderType === 'sale' && sourceId) {
      loadWarehouseStocks(sourceId);
    } else {
      setWarehouseStocks([]);
    }
  }, [orderType, sourceId]);

  const loadBaseData = async () => {
    try {
      const [entitiesRes, formulasRes] = await Promise.all([
        entitiesApi.list({ limit: 100 }), 
        deductionFormulasApi.list({ is_active: true, limit: 100 }),
      ]);
      setEntities(entitiesRes.data);
      setFormulas(formulasRes.data);
      
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
      setProducts(allProducts);
    } catch (err: any) { toast({ title: '加载失败', description: err.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  
  const loadWarehouseStocks = async (warehouseId: number) => {
    setStocksLoading(true);
    try {
      const stocks = await stocksApi.getByWarehouse(warehouseId, true); // 仅获取有可用库存的
      setWarehouseStocks(stocks);
    } catch (err) {
      console.error('Failed to load warehouse stocks:', err);
      setWarehouseStocks([]);
    } finally {
      setStocksLoading(false);
    }
  };

  const getSourceOptions = () => {
    switch (orderType) {
      case 'purchase': return entities.filter(e => e.entity_type.includes('supplier'));
      case 'sale': return entities.filter(e => e.entity_type.includes('warehouse'));
      default: return entities;
    }
  };

  const getTargetOptions = () => {
    switch (orderType) {
      case 'purchase': return entities.filter(e => e.entity_type.includes('warehouse'));
      case 'sale': return entities.filter(e => e.entity_type.includes('customer'));
      default: return entities;
    }
  };

  const addItem = () => { 
    // 默认计价方式：采购按件，销售按重量
    const defaultPricingMode = orderType === 'purchase' ? 'container' : 'weight';
    setItems([...items, { 
      _id: generateItemId(),  // 唯一标识
      product_id: 0, product_name: '', product_unit: '', 
      pricing_mode: defaultPricingMode,
      quantity: 1, unit_price: 0, shipping_cost: 0, notes: '', 
      available_quantity: undefined, batch_allocations: [], unit_count: 1 
    }]); 
  }
  
  // 加载产品的可用批次（按规格筛选）
  const loadProductBatches = async (productId: number, warehouseId: number, specId?: number) => {
    // 使用 productId + specId 作为缓存键，因为同商品不同规格视为不同商品
    const cacheKey = specId ? `${productId}_${specId}` : productId.toString();
    if (productBatches[cacheKey]) return; // 已加载过
    try {
      const res = await batchesApi.listByProduct(productId, warehouseId, specId);
      setProductBatches(prev => ({ ...prev, [cacheKey]: res.data }));
    } catch (err) {
      console.error('Failed to load batches:', err);
    }
  };
  
  // 计算商品净重（商品级别）- 使用函数式更新避免竞态条件
  const calculateItemNetWeight = async (index: number, gw?: number, fId?: number, units?: number) => {
    // 获取当前值（传入的参数优先）
    const currentItem = items[index];
    const weight = gw ?? currentItem?.gross_weight;
    const formulaId = fId ?? currentItem?.deduction_formula_id;
    const unitCount = units ?? currentItem?.unit_count ?? 1;
    
    if (!weight) return;
    
    let netWeight = weight;
    
    // 如果有扣重公式，调用 API 计算
    if (formulaId) {
      try {
        const result = await deductionFormulasApi.calculate(weight, formulaId, unitCount);
        netWeight = result.net_weight;
      } catch (err) {
        console.error('Failed to calculate net weight:', err);
        // 计算失败时，默认净重=毛重
      }
    }
    
    // 使用函数式更新确保基于最新状态
    setItems(prevItems => {
      const newItems = [...prevItems];
      if (newItems[index]) {
        newItems[index] = { 
          ...newItems[index], 
          quantity: netWeight,
          // 确保毛重也保持更新
          gross_weight: gw ?? newItems[index].gross_weight
        };
      }
      return newItems;
    });
  };
  
  // 判断公式是否需要件数
  const formulaNeedsUnitCount = (formulaId?: number) => {
    if (!formulaId) return false;
    const formula = formulas.find(f => f.id === formulaId);
    return formula?.formula_type === 'fixed_per_unit';
  };
  
  // 判断商品是否按重量计量（需要毛重/净重转换）
  const isWeightBasedUnit = (unit?: string) => {
    if (!unit) return false;
    const weightUnits = ['kg', 'g', '斤', '公斤', '千克', '吨', 'KG', 'Kg'];
    return weightUnits.some(w => unit.includes(w));
  };
  
  const updateItem = (index: number, field: keyof OrderItemForm, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].product_name = product.name;
        newItems[index].product_unit = product.unit;
        // 保存商品的规格列表
        newItems[index].product_specs = product.specs || [];
        
        // 如果商品有规格，自动选择默认规格
        const defaultSpec = product.specs?.find(s => s.is_default) || product.specs?.[0];
        if (defaultSpec) {
          newItems[index].spec_id = defaultSpec.id;
          newItems[index].spec_name = defaultSpec.name;
          newItems[index].container_name = defaultSpec.container_name;
          newItems[index].unit_quantity = defaultSpec.quantity;
          newItems[index].base_unit_symbol = defaultSpec.unit_symbol;
          newItems[index].pricing_mode = orderType === 'purchase' ? 'container' : 'weight';
        } else {
          // 无规格：使用基础单位
          newItems[index].pricing_mode = 'weight';
        }
      }
      // 如果是销售，查找库存信息并加载批次
      if (orderType === 'sale') {
        const stock = warehouseStocks.find(s => s.product_id === value);
        newItems[index].available_quantity = stock?.available_quantity;
        // 清空之前的批次选择
        newItems[index].batch_allocations = [];
        // 加载该商品的可用批次
        if (sourceId > 0) {
          loadProductBatches(value, sourceId);
        }
      }
    }
    // 切换规格时更新包装信息和计价方式
    if (field === 'spec_id') {
      const item = newItems[index];
      const spec = item.product_specs?.find(s => s.id === value);
      if (spec) {
        newItems[index].spec_name = spec.name;
        newItems[index].container_name = spec.container_name;
        newItems[index].unit_quantity = spec.quantity;
        newItems[index].base_unit_symbol = spec.unit_symbol;
        
        // 规格决定计价方式：散装(quantity=1)按重量，其他按件
        const isBulk = spec.quantity === 1 && spec.name?.includes('散装');
        newItems[index].pricing_mode = isBulk ? 'weight' : 'container';
        
        // 重置数量、单价和毛重
        newItems[index].quantity = isBulk ? 0 : 1;
        newItems[index].unit_price = 0;
        newItems[index].gross_weight = undefined;
        newItems[index].deduction_formula_id = undefined;
        
        // 销售时：规格变化，重新加载该规格的批次（同商品不同规格视为不同商品）
        if (orderType === 'sale' && sourceId > 0 && item.product_id) {
          newItems[index].batch_allocations = [];  // 清空批次选择
          loadProductBatches(item.product_id, sourceId, value);
        }
      }
    }
    setItems(newItems);
  };
  
  // 获取商品的计价单位显示
  const getPricingUnitLabel = (item: OrderItemForm) => {
    if (!hasSpec(item)) {
      return item.product_unit || '个';
    }
    if (item.pricing_mode === 'container') {
      return item.container_name || '件';
    }
    return item.base_unit_symbol || 'kg';
  };
  
  // 计算商品明细的实际重量（用于库存和运费）
  const getItemActualWeight = (item: OrderItemForm) => {
    if (!hasSpec(item)) {
      return item.quantity; // 无规格直接返回数量
    }
    if (item.pricing_mode === 'container') {
      // 按件计价：件数 × 每件重量
      return item.quantity * (item.unit_quantity || 0);
    }
    // 按重量计价：直接是重量
    return item.quantity;
  };
  
  // 计算商品明细的件数（用于显示）
  const getItemContainerCount = (item: OrderItemForm) => {
    if (!hasSpec(item) || !item.unit_quantity) return null;
    if (item.pricing_mode === 'container') {
      return item.quantity; // 按件计价直接是件数
    }
    // 按重量计价：重量 / 每件重量
    return item.quantity / item.unit_quantity;
  };
  const removeItem = (index: number) => { setItems(items.filter((_, i) => i !== index)); };
  const calculateItemSubtotal = (item: OrderItemForm) => item.quantity * item.unit_price + item.shipping_cost;
  const calculateTotals = () => {
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    // 运费、冷藏费和其他费用
    return { 
      totalAmount, 
      totalShipping: shippingCost, 
      totalStorageFee: storageFee,
      totalOtherFee: otherFee,
      finalAmount: totalAmount + shippingCost + storageFee + otherFee
    };
  };

  // 获取可选商品列表（销售时根据库存过滤，支持搜索过滤）
  const getAvailableProducts = () => {
    let result = products;
    
    // 销售时，仅返回有库存的商品
    if (orderType === 'sale') {
      const stockProductIds = warehouseStocks.map(s => s.product_id);
      result = result.filter(p => stockProductIds.includes(p.id));
    }
    // 直销从供应商发货，可选择任意商品（不走库存）
    
    // 搜索过滤
    if (productSearch.trim()) {
      const search = productSearch.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.code.toLowerCase().includes(search) ||
        (p.specification && p.specification.toLowerCase().includes(search)) ||
        (p.category && p.category.toLowerCase().includes(search))
      );
    }
    
    return result;
  };
  
  // 格式化商品显示名称（包含规格）
  const formatProductName = (p: Product) => {
    if (p.specification) {
      return `${p.name} (${p.specification})`;
    }
    return p.name;
  };
  
  // 获取商品的可用库存（仅销售单有意义）
  const getProductAvailableQuantity = (productId: number): number | undefined => {
    if (orderType !== 'sale') return undefined;
    const stock = warehouseStocks.find(s => s.product_id === productId);
    return stock?.available_quantity;
  };

  const handleSubmit = async () => {
    if (!sourceId || !targetId) { toast({ title: '请选择来源和目标', variant: 'destructive' }); return; }
    if (items.length === 0 || items.some(item => !item.product_id)) { toast({ title: '请添加商品', variant: 'destructive' }); return; }
    if (!logisticsCompanyId) { toast({ title: '请选择物流公司', variant: 'destructive' }); return; }
    if (!loadingDate) { toast({ title: '请选择装货日期', variant: 'destructive' }); return; }
    if (!unloadingDate) { toast({ title: '请选择卸货日期', variant: 'destructive' }); return; }
    // 校验卸货日期不能早于装货日期
    if (loadingDate && unloadingDate) {
      const loadDate = new Date(loadingDate);
      const unloadDate = new Date(unloadingDate);
      loadDate.setHours(0, 0, 0, 0);
      unloadDate.setHours(0, 0, 0, 0);
      if (unloadDate < loadDate) {
        toast({ title: '日期错误', description: '卸货日期不能早于装货日期', variant: 'destructive' });
        return;
      }
    }
    
    // 校验库存（销售单需要校验，直销不需要）
    if (orderType === 'sale') {
      for (const item of items) {
        const available = getProductAvailableQuantity(item.product_id);
        if (available !== undefined && item.quantity > available) {
          toast({ title: '库存不足', description: `${item.product_name} 可用库存仅 ${available}，需要 ${item.quantity}`, variant: 'destructive' });
          return;
        }
        // 校验装货日期不能早于批次入库日期
        if (item.batch_allocations?.[0]?.received_at && loadingDate) {
          const batchReceivedDate = new Date(item.batch_allocations[0].received_at);
          const orderLoadingDate = new Date(loadingDate);
          // 只比较日期部分
          batchReceivedDate.setHours(0, 0, 0, 0);
          orderLoadingDate.setHours(0, 0, 0, 0);
          if (orderLoadingDate < batchReceivedDate) {
            toast({ 
              title: '日期错误', 
              description: `${item.product_name} 的装货日期(${loadingDate})不能早于批次入库日期(${item.batch_allocations[0].received_at?.split('T')[0]})`, 
              variant: 'destructive' 
            });
            return;
          }
        }
      }
    }
    
    setSubmitting(true);
    try {
      const data: OrderCreateData = { 
        order_type: orderType, 
        source_id: sourceId, 
        target_id: targetId, 
        loading_date: loadingDate || undefined,
        unloading_date: unloadingDate || undefined,
        total_shipping: shippingCost || undefined,
        total_storage_fee: storageFee || undefined,
        other_fee: otherFee || undefined,
        calculate_storage_fee: calculateStorageFee,
        notes: notes || undefined, 
        items: items.map((item, idx) => ({ 
          product_id: item.product_id, 
          quantity: item.quantity, 
          unit_price: item.unit_price, 
          notes: item.notes || undefined,
          // === 规格快照（从 ProductSpec 获取）===
          spec_id: item.spec_id || undefined,
          spec_name: item.spec_name || undefined,
          // === 包装换算信息 ===
          container_name: item.container_name || undefined,
          unit_quantity: item.unit_quantity || undefined,
          base_unit_symbol: item.base_unit_symbol || undefined,
          // === 计价方式 ===
          pricing_mode: item.pricing_mode || 'weight',
          container_count: item.pricing_mode === 'container' ? item.quantity : (item.unit_quantity ? item.quantity / item.unit_quantity : undefined),
          // 单据级别运输信息应用到每个 item（用于生成分离的账单）
          logistics_company_id: logisticsCompanyId || undefined,
          plate_number: plateNumber || undefined,
          driver_phone: driverPhone || undefined,
          logistics_company: logisticsCompanyId ? logisticsCompanies.find(e => e.id === logisticsCompanyId)?.name : undefined,
          invoice_no: invoiceNo || undefined,
          // 采购相关：每个商品保存自己的毛重和扣重公式
          gross_weight: item.gross_weight || undefined,
          deduction_formula_id: item.deduction_formula_id || undefined,
        })) 
      };
      const result = await ordersApi.create(data);
      toast({ title: '创建成功', description: `业务单号：${result.order_no}` });
      router.push(`/orders/${result.id}`);
    } catch (err: any) { toast({ title: '创建失败', description: err.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  const formatAmount = (amount: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const getTypeLabel = (type: string) => ({ purchase: '采购单', sale: '销售单' }[type] || type);
  const getSourceLabel = () => ({ purchase: '供应商', sale: '出库仓库' }[orderType] || '来源');
  const getTargetLabel = () => ({ purchase: '入库仓库', sale: '客户' }[orderType] || '目标');

  if (loading) return <div className="flex justify-center items-center h-screen"><p>加载中...</p></div>;
  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3"><FileText className="w-8 h-8 text-amber-600" /><div><h1 className="text-2xl font-bold text-slate-900">新建{getTypeLabel(orderType)}</h1><p className="text-sm text-slate-500">来源 → 商品 → 目标</p></div></div>
          <Link href="/orders"><Button variant="outline">取消</Button></Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">业务类型</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { value: 'purchase', label: '采购', color: 'bg-blue-500', desc: '供应商→仓库' }, 
              { value: 'sale', label: '销售', color: 'bg-green-500', desc: '仓库→客户' }
            ].map(type => (
              <button 
                key={type.value} 
                onClick={() => { setOrderType(type.value); setSourceId(0); setTargetId(0); setItems([]); }} 
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex flex-col items-center ${orderType === type.value ? `${type.color} text-white` : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <span>{type.label}</span>
                <span className={`text-xs ${orderType === type.value ? 'text-white/80' : 'text-gray-500'}`}>{type.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">来源与目标</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm text-slate-700 block mb-1">{getSourceLabel()} *</label>
              <Select value={sourceId.toString()} onValueChange={v => { setSourceId(parseInt(v)); setItems([]); }}>
                <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                <SelectContent>
                  {getSourceOptions().map(e => (
                    <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="w-6 h-6 text-slate-500 mt-6" />
            <div className="flex-1"><label className="text-sm text-slate-700 block mb-1">{getTargetLabel()} *</label><Select value={targetId.toString()} onValueChange={v => setTargetId(parseInt(v))}><SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{getTargetOptions().map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">商品明细</h2>
              {orderType === 'sale' && !sourceId && (
                <p className="text-xs text-amber-600 mt-1">请先选择出库仓库</p>
              )}
              {orderType === 'sale' && sourceId > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {stocksLoading ? '加载库存中...' : warehouseStocks.length === 0 ? '该仓库暂无库存' : `可选 ${warehouseStocks.length} 种库存商品`}
                </p>
              )}
            </div>
            <Button size="sm" onClick={addItem} disabled={orderType === 'sale' && (sourceId === 0 || warehouseStocks.length === 0)}>
              <Plus className="w-4 h-4 mr-1" />添加商品
            </Button>
          </div>
          {items.length === 0 ? <div className="text-center py-8 text-slate-500"><p>请添加商品</p><Button className="mt-2" onClick={addItem} disabled={orderType === 'sale' && (sourceId === 0 || warehouseStocks.length === 0)}><Plus className="w-4 h-4 mr-1" />添加第一个商品</Button></div> : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item._id} className="border border-slate-200 rounded-lg p-4 bg-white">
                  <div className="flex justify-between items-start mb-3"><span className="text-sm font-medium text-slate-700">商品 #{index + 1}</span><button onClick={() => removeItem(index)} className="text-red-500"><Trash2 className="w-4 h-4" /></button></div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">选择商品 *</label>
                      {/* 商品搜索框 */}
                      <div className="mb-2">
                        <Input
                          placeholder="搜索商品名称、编码或分类..."
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Select value={item.product_id.toString()} onValueChange={v => updateItem(index, 'product_id', parseInt(v))}>
                        <SelectTrigger><SelectValue placeholder="选择商品" /></SelectTrigger>
                        <SelectContent>
                          {getAvailableProducts().length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-500">未找到匹配商品</div>
                          ) : (
                            getAvailableProducts().map(p => {
                              const available = getProductAvailableQuantity(p.id);
                              return (
                                <SelectItem key={p.id} value={p.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <span>{formatProductName(p)}</span>
                                    {p.category && <span className="text-xs text-slate-400">[{p.category}]</span>}
                                    {available !== undefined && <span className="text-xs text-green-600">(库存:{available})</span>}
                                  </div>
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      {item.available_quantity !== undefined && (
                        <div className="text-xs text-green-600 mt-1">可用库存: {item.available_quantity} {item.base_unit_symbol || item.product_unit}</div>
                      )}
                      {/* 规格选择（如果商品有多个规格） */}
                      {item.product_specs && item.product_specs.length > 0 && (
                        <div className="mt-2">
                          <label className="text-xs text-slate-500 block mb-1">包装规格</label>
                          <Select value={item.spec_id?.toString() || ''} onValueChange={v => updateItem(index, 'spec_id', parseInt(v))}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="选择规格" />
                            </SelectTrigger>
                            <SelectContent>
                              {item.product_specs.map(spec => (
                                <SelectItem key={spec.id} value={spec.id.toString()}>
                                  {spec.display_name || spec.name}
                                  {spec.is_default && <span className="ml-1 text-amber-600">(默认)</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        {/* 根据规格类型显示标签 */}
                        {hasSpec(item)
                          ? (isSpecBulk(item)
                              ? `净重 (${getBaseUnit(item)})`  // 散装：显示净重
                              : `件数 (${getContainerName(item)})`)  // 按件：显示件数
                          : `数量 (${item.product_unit || '个'})`
                        } *
                      </label>
                      <Input 
                        type="number" 
                        min={isSpecBulk(item) ? "0" : "1"}
                        step={isSpecBulk(item) ? "0.01" : "1"}
                        max={item.available_quantity} 
                        value={item.quantity || ''} 
                        onChange={e => updateItem(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))} 
                        onBlur={e => { 
                          const minVal = isSpecBulk(item) ? 0 : 1;
                          if (!e.target.value || parseFloat(e.target.value) < minVal) {
                            updateItem(index, 'quantity', minVal);
                          }
                        }}
                        onFocus={e => e.target.select()}
                        className={`${item.available_quantity !== undefined && item.quantity > item.available_quantity ? 'border-red-500' : ''}`}
                        readOnly={isSpecBulk(item) && !!item.gross_weight}  // 散装且有毛重时只读
                      />
                      {/* 按件时显示换算重量 */}
                      {hasSpec(item) && !isSpecBulk(item) && item.quantity > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          = {(item.quantity * (item.unit_quantity || 0)).toLocaleString()} {getBaseUnit(item)}
                        </div>
                      )}
                      {item.available_quantity !== undefined && item.quantity > item.available_quantity && (
                        <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> 超出库存
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        单价 {hasSpec(item) && (isSpecBulk(item)
                          ? `(元/${getBaseUnit(item)})`
                          : `(元/${getContainerName(item)})`)} *
                      </label>
                      <Input type="number" step="0.01" min="0" value={item.unit_price || ''} onChange={e => updateItem(index, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))} onBlur={e => { if (!e.target.value) updateItem(index, 'unit_price', 0); }} onFocus={e => e.target.select()} />
                    </div>
                    <div><label className="text-xs text-slate-500 block mb-1">小计</label><div className="h-10 flex items-center font-medium text-slate-900">{formatAmount(item.quantity * item.unit_price)}</div></div>
                  </div>
                  
                  {/* 销售单：批次选择（必选）- 独立行，占满宽度 */}
                  {/* 同商品不同规格视为不同商品，批次需要按规格匹配 */}
                  {(() => {
                    // 计算批次缓存键
                    const batchCacheKey = item.spec_id ? `${item.product_id}_${item.spec_id}` : item.product_id.toString();
                    const itemBatches = productBatches[batchCacheKey] || [];
                    
                    if (orderType !== 'sale' || item.product_id <= 0 || itemBatches.length === 0) return null;
                    
                    return (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600 block mb-1">
                        📦 选择出货批次 *
                        {item.spec_name && <span className="ml-1 text-purple-600">({item.spec_name})</span>}
                      </label>
                      <Select 
                        value={item.batch_allocations?.[0]?.batch_id?.toString() || ''} 
                        onValueChange={v => {
                          const batch = itemBatches.find(b => b.id === parseInt(v));
                          if (batch) {
                            updateItem(index, 'batch_allocations', [{
                              batch_id: batch.id,
                              batch_no: batch.batch_no,
                              quantity: item.quantity,
                              available: batch.available_quantity,
                              cost_price: batch.cost_price,
                              received_at: batch.received_at
                            }]);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue placeholder="请选择批次（先进先出）" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)]">
                          {itemBatches.map((batch, idx) => (
                            <SelectItem key={batch.id} value={batch.id.toString()}>
                              {idx === 0 ? '🔸 ' : ''}{batch.batch_no} 
                              {batch.spec_name && <span className="text-purple-500 ml-1">[{batch.spec_name}]</span>}
                              {' | '}{batch.received_at ? new Date(batch.received_at).toLocaleDateString('zh-CN') : '-'} | 库存:{Number(batch.available_quantity).toLocaleString()}{item.product_unit} | ¥{Number(batch.cost_price).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.batch_allocations?.[0] && (
                        <>
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <span className="text-green-600">✓ 已选批次:</span>
                            <span className="font-medium text-slate-700">{item.batch_allocations[0].batch_no}</span>
                            <span className="text-slate-400">|</span>
                            <span className="text-slate-500">
                              入库 {item.batch_allocations[0].received_at ? new Date(item.batch_allocations[0].received_at).toLocaleDateString('zh-CN') : '-'}
                            </span>
                          </div>
                          {/* 日期校验警告 */}
                          {loadingDate && item.batch_allocations[0].received_at && (() => {
                            const batchDate = new Date(item.batch_allocations[0].received_at);
                            const loadDate = new Date(loadingDate);
                            batchDate.setHours(0, 0, 0, 0);
                            loadDate.setHours(0, 0, 0, 0);
                            return loadDate < batchDate;
                          })() && (
                            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
                              🚫 <strong>日期错误：</strong>装货日期({loadingDate})不能早于批次入库日期({item.batch_allocations[0].received_at?.split('T')[0]})
                            </div>
                          )}
                        </>
                      )}
                      {!item.batch_allocations?.[0] && (
                        <div className="text-xs text-amber-600 mt-2">⚠️ 请选择批次以计算准确的冷藏费</div>
                      )}
                    </div>
                    );
                  })()}
                  {/* 批次加载中或无批次 */}
                  {(() => {
                    const batchCacheKey = item.spec_id ? `${item.product_id}_${item.spec_id}` : item.product_id.toString();
                    const itemBatches = productBatches[batchCacheKey];
                    if (orderType !== 'sale' || item.product_id <= 0 || !itemBatches || itemBatches.length > 0) return null;
                    return (
                      <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                        ⚠️ 该商品{item.spec_name ? `【${item.spec_name}】规格` : ''}暂无可用库存批次
                      </div>
                    );
                  })()}
                  
                  {/* 毛重扣重区域：散装规格 或 无规格的重量商品（采购/销售通用） */}
                  {['purchase', 'sale'].includes(orderType) && item.product_id > 0 && (
                    (hasSpec(item) && isSpecBulk(item)) || (!hasSpec(item) && isWeightBasedUnit(item.product_unit))
                  ) && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50 bg-amber-50/50 -mx-4 px-4 pb-3 rounded-b-lg">
                      <div className={`grid gap-3 ${formulaNeedsUnitCount(item.deduction_formula_id) ? 'grid-cols-[1fr_1fr_80px_1.5fr]' : 'grid-cols-[1fr_1fr_2fr]'}`}>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">
                            毛重 ({getBaseUnit(item)}) <span className="text-amber-600">*</span>
                          </label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            value={item.gross_weight || ''} 
                            onChange={e => {
                              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                              updateItem(index, 'gross_weight', val);
                              // 实时计算净重
                              if (val) {
                                calculateItemNetWeight(index, val, item.deduction_formula_id, item.unit_count);
                              }
                            }}
                            placeholder="过磅重量"
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">扣重公式</label>
                          <Select 
                            value={item.deduction_formula_id?.toString() || 'none'} 
                            onValueChange={v => {
                              const fId = v && v !== 'none' ? parseInt(v) : undefined;
                              updateItem(index, 'deduction_formula_id', fId);
                              if (item.gross_weight) {
                                calculateItemNetWeight(index, item.gross_weight, fId, item.unit_count);
                              }
                            }}
                          >
                            <SelectTrigger className="bg-white"><SelectValue placeholder="选择公式" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不扣重</SelectItem>
                              {formulas.filter(f => f.name !== '不扣重').map(f => (
                                <SelectItem key={f.id} value={f.id.toString()}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* 件数输入框 - 仅在选择"每件扣X"类型公式时显示 */}
                        {formulaNeedsUnitCount(item.deduction_formula_id) && (
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">件数 *</label>
                            <Input 
                              type="number" 
                              min="1"
                              step="1"
                              value={item.unit_count ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                updateItem(index, 'unit_count', val);
                                if (item.gross_weight && val) {
                                  calculateItemNetWeight(index, item.gross_weight, item.deduction_formula_id, val);
                                }
                              }}
                              onBlur={e => {
                                // 失去焦点时，如果为空或小于1，恢复为1
                                const val = parseInt(e.target.value);
                                if (!val || val < 1) {
                                  updateItem(index, 'unit_count', 1);
                                  if (item.gross_weight) {
                                    calculateItemNetWeight(index, item.gross_weight, item.deduction_formula_id, 1);
                                  }
                                }
                              }}
                              placeholder="件数"
                              className="bg-white"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">净重（自动计算）</label>
                          <div className="h-10 flex items-center text-sm bg-white rounded px-3 border border-slate-200">
                            {item.gross_weight ? (
                              <span className="whitespace-nowrap">
                                毛重 {item.gross_weight} {getBaseUnit(item)} → 净重 <span className="font-bold text-green-600">{item.quantity}</span> {getBaseUnit(item)}
                              </span>
                            ) : (
                              <span className="text-slate-500">输入毛重后自动计算净重</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 运输信息（单据级别） */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" />
            运输信息
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* 物流公司 */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">物流公司 <span className="text-amber-600">*</span></label>
              <Select 
                value={logisticsCompanyId > 0 ? logisticsCompanyId.toString() : ''} 
                onValueChange={v => setLogisticsCompanyId(parseInt(v) || 0)}
              >
                <SelectTrigger><SelectValue placeholder="选择物流公司" /></SelectTrigger>
                <SelectContent>
                  {logisticsCompanies.length === 0 ? (
                    <SelectItem value="none" disabled>暂无物流公司</SelectItem>
                  ) : (
                    logisticsCompanies.map(e => (
                      <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {logisticsCompanies.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  <Link href="/entities?type=logistics" className="underline">去创建物流公司</Link>
                </p>
              )}
            </div>
            
            {/* 车牌号（手动填写，选填） */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">车牌号</label>
              <Input 
                value={plateNumber} 
                onChange={e => setPlateNumber(e.target.value)}
                placeholder="如：鲁B12345"
              />
            </div>
            
            {/* 司机电话（可选，每次运输可能不同） */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">司机电话</label>
              <Input 
                value={driverPhone} 
                onChange={e => setDriverPhone(e.target.value)}
                placeholder="本次运输的司机联系方式"
              />
            </div>
            
            {/* 发票号 */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">发票号</label>
              <Input 
                value={invoiceNo} 
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="发票号码"
              />
            </div>
          </div>
          
          {/* 装卸货日期 */}
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              装卸货日期
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="group">
                <label className="text-xs font-medium text-slate-600 block mb-1.5">
                  装货日期 <span className="text-amber-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Calendar className="w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  </div>
                  <input 
                    type="date"
                    value={loadingDate} 
                    onChange={e => setLoadingDate(e.target.value)}
                    required
                    className="w-full h-10 pl-10 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700
                      shadow-sm transition-all duration-200
                      hover:border-amber-300 hover:shadow
                      focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                      [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute 
                      [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full 
                      [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="group">
                <label className="text-xs font-medium text-slate-600 block mb-1.5">
                  卸货日期 <span className="text-amber-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Calendar className="w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  </div>
                  <input 
                    type="date"
                    value={unloadingDate} 
                    onChange={e => setUnloadingDate(e.target.value)}
                    required
                    className={`w-full h-10 pl-10 pr-3 rounded-lg border bg-white text-sm text-slate-700
                      shadow-sm transition-all duration-200
                      [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute 
                      [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full 
                      [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer
                      ${loadingDate && unloadingDate && new Date(unloadingDate) < new Date(loadingDate) 
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100' 
                        : 'border-slate-200 hover:border-amber-300 hover:shadow focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100'}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            {/* 日期校验警告 */}
            {loadingDate && unloadingDate && new Date(unloadingDate) < new Date(loadingDate) && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700">
                🚫 <strong>日期错误：</strong>卸货日期不能早于装货日期
              </div>
            )}
          </div>
          
          {/* 采购单：运费和冷藏费 */}
          {orderType === 'purchase' && (
            <div className="mt-4 pt-4 border-t border-slate-200/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-700">运费与冷藏费</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={calculateStorageFee} 
                    onChange={e => setCalculateStorageFee(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-600">计算冷藏费</span>
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">总毛重（参考）</label>
                  <div className="h-10 flex items-center text-sm font-medium text-slate-900 bg-gray-50 rounded px-3">
                    {totalGrossWeight > 0 ? `${totalGrossWeight.toLocaleString()} kg` : '-'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">运费（元）</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={shippingCost || ''} 
                    onChange={e => setShippingCost(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    placeholder="物流公司账单金额"
                  />
                  <p className="text-xs text-slate-400 mt-1">💡 应付物流公司</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">冷藏费（元）</label>
                  <div className={`h-10 flex items-center text-sm font-medium rounded px-3 border ${calculateStorageFee ? 'text-green-600 bg-green-50 border-green-200' : 'text-slate-400 bg-slate-50 border-slate-200'}`}>
                    {calculateStorageFee ? `¥${storageFee.toFixed(2)}` : '不计算'}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">💡 每吨15元，应付冷库</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">其他费用（元）</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={otherFee || ''} 
                    onChange={e => setOtherFee(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    placeholder="杂费支出"
                  />
                  <p className="text-xs text-slate-400 mt-1">💡 装卸费、过磅费等</p>
                </div>
              </div>
            </div>
          )}
          
          {/* 销售单：运费和冷藏费 */}
          {orderType === 'sale' && (
            <div className="mt-4 pt-4 border-t border-slate-200/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-700">运费与冷藏费</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={calculateStorageFee} 
                    onChange={e => setCalculateStorageFee(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-600">计算冷藏费</span>
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">运费（元）</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={shippingCost || ''} 
                    onChange={e => setShippingCost(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    placeholder="送货运费"
                  />
                  <p className="text-xs text-slate-400 mt-1">💡 应付物流公司（如有）</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">冷藏费（元）</label>
                  <div className={`h-10 flex items-center text-sm font-medium rounded px-3 border ${calculateStorageFee ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-400 bg-slate-50 border-slate-200'}`}>
                    {calculateStorageFee 
                      ? (items.length > 0 ? `预估 ¥${storageFee.toFixed(2)}` : '添加商品后计算')
                      : '不计算'
                    }
                  </div>
                  {calculateStorageFee && (
                    <p className="text-xs text-slate-400 mt-1">💡 每吨15元 + 存储费</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">其他费用（元）</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={otherFee || ''} 
                    onChange={e => setOtherFee(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    placeholder="杂费支出"
                  />
                  <p className="text-xs text-slate-400 mt-1">💡 装卸费、过磅费等</p>
                </div>
              </div>
            </div>
          )}
          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-900 mb-4">备注</h2><textarea className="w-full h-24 p-3 border border-slate-200 rounded-lg resize-none" placeholder="输入备注信息..." value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-800 mb-4">金额汇总</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">商品金额：</span><span className="text-slate-700">{formatAmount(totals.totalAmount)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">运费合计：</span><span className="text-slate-700">+{formatAmount(totals.totalShipping)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">冷藏费：</span><span className="text-slate-700">+{formatAmount(totals.totalStorageFee)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">其他费用：</span><span className="text-slate-700">+{formatAmount(totals.totalOtherFee)}</span></div>
              <div className="border-t border-amber-200 pt-2 mt-2"><div className="flex justify-between text-lg font-bold"><span className="text-amber-800">最终金额：</span><span className="text-amber-600">{formatAmount(totals.finalAmount)}</span></div></div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4"><Link href="/orders"><Button variant="outline" size="lg">取消</Button></Link><Button size="lg" onClick={handleSubmit} disabled={submitting}>{submitting ? '创建中...' : '创建业务单'}</Button></div>
      </div>
    </div>
  );
}

