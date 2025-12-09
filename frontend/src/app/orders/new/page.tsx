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
  const [orderType, setOrderType] = useState(searchParams.get('type') || 'loading');
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
  
  // 业务日期（装货单=装货日期，卸货单=卸货日期）
  const [orderDate, setOrderDate] = useState<string>('');
  
  // 自动计算冷藏费状态
  const [storageFee, setStorageFeeValue] = useState<number>(0);
  
  // 判断来源实体类型
  const sourceEntity = useMemo(() => entities.find(e => e.id === sourceId), [entities, sourceId]);
  const targetEntity = useMemo(() => entities.find(e => e.id === targetId), [entities, targetId]);
  const isSourceWarehouse = sourceEntity?.entity_type.includes('warehouse') && !sourceEntity?.entity_type.includes('transit');
  const isTargetWarehouse = targetEntity?.entity_type.includes('warehouse') && !targetEntity?.entity_type.includes('transit');
  
  // 自动计算冷藏费 - 使用 useEffect 确保依赖项变化时重新计算
  // 装货单(X→D)：如果X是仓库(B)，计算 出库费+存储费
  // 卸货单(D→Y)：如果Y是仓库(B)，只计算 入库费
  useEffect(() => {
    if (!calculateStorageFee) {
      setStorageFeeValue(0);
      return;
    }
    
    const baseRatePerTon = 15;  // 出入库费：15元/吨
    const storageCostPerTonPerDay = 1.5;  // 存储费：1.5元/吨/天
    
    const totalWeight = items.reduce((sum, item) => {
      if (!item.spec_id || !item.unit_quantity) return sum + item.quantity;
      if (item.pricing_mode === 'container') return sum + item.quantity * item.unit_quantity;
      return sum + item.quantity;
    }, 0);
    const weightTons = totalWeight / 1000;
    
    if (orderType === 'unloading' && isTargetWarehouse) {
      // 卸货单，目标是仓库：只计算入库费
      setStorageFeeValue(Math.round(weightTons * baseRatePerTon * 100) / 100);
    } else if (orderType === 'loading' && isSourceWarehouse) {
      // 装货单，来源是仓库：计算出库费 + 存储费
      if (!orderDate) {
        setStorageFeeValue(0);
        return;
      }
      
      let totalStorageFee = 0;
      
      items.forEach(item => {
        if (!item.product_id) return;
        
        let itemWeight = item.quantity;
        if (item.spec_id && item.unit_quantity && item.pricing_mode === 'container') {
          itemWeight = item.quantity * item.unit_quantity;
        }
        const itemWeightTons = itemWeight / 1000;
        const baseFee = itemWeightTons * baseRatePerTon;
        
        // 获取批次入库日期：优先用户选择的批次，否则从可用批次列表获取
        let receivedAtStr: string | undefined = item.batch_allocations?.[0]?.received_at;
        if (!receivedAtStr) {
          const batchCacheKey = item.product_id.toString();
          const availableBatches = productBatches[batchCacheKey] || [];
          if (availableBatches.length > 0 && availableBatches[0].received_at) {
            receivedAtStr = availableBatches[0].received_at;
          }
        }
        
        let storageDays = 0;
        if (receivedAtStr) {
          const businessDate = new Date(orderDate);
          const receivedDate = new Date(receivedAtStr);
          businessDate.setHours(0, 0, 0, 0);
          receivedDate.setHours(0, 0, 0, 0);
          const diffTime = businessDate.getTime() - receivedDate.getTime();
          storageDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
        }
        
        const storageCost = itemWeightTons * storageDays * storageCostPerTonPerDay;
        totalStorageFee += baseFee + storageCost;
      });
      
      setStorageFeeValue(Math.round(totalStorageFee * 100) / 100);
    } else {
      // 其他情况（非仓库相关）不计算冷藏费
      setStorageFeeValue(0);
    }
  }, [calculateStorageFee, orderType, items, orderDate, productBatches, isSourceWarehouse, isTargetWarehouse]);
  
  // 判断包装规格是否为散装（按基础单位计价）
  const isItemSpecBulk = (item: OrderItemForm) => {
    return (item.unit_quantity === 1 && item.spec_name?.includes('散装'));
  };
  
  // 获取批次缓存键（批次按商品分，不按包装规格分）
  const getBatchCacheKey = (item: OrderItemForm) => {
    return item.product_id.toString();
  };
  
  // 计算所有批次中最晚的入库日期（用于装货单从仓库出货时的日期校验）
  // 优先使用用户选择的批次，否则使用可用批次列表中最晚的
  const latestBatchReceivedDate = useMemo(() => {
    // 只有装货单且来源是仓库时才需要校验
    if (!(orderType === 'loading' && isSourceWarehouse)) return null;
    
    let latest: { date: Date; productName: string; batchNo: string; receivedAt: string } | null = null;
    
    for (const item of items) {
      if (!item.product_id) continue;
      
      // 优先使用用户选择的批次
      if (item.batch_allocations?.[0]?.received_at) {
        const batchDate = new Date(item.batch_allocations[0].received_at);
        batchDate.setHours(0, 0, 0, 0);
        if (!latest || batchDate > latest.date) {
          latest = {
            date: batchDate,
            productName: item.product_name || '',
            batchNo: item.batch_allocations[0].batch_no || '',
            receivedAt: item.batch_allocations[0].received_at.split('T')[0]
          };
        }
      } else {
        // 如果没有选择批次，从可用批次列表中找最晚的入库日期
        const batchCacheKey = getBatchCacheKey(item);
        const availableBatches = productBatches[batchCacheKey] || [];
        for (const batch of availableBatches) {
          if (batch.received_at) {
            const batchDate = new Date(batch.received_at);
            batchDate.setHours(0, 0, 0, 0);
            if (!latest || batchDate > latest.date) {
              latest = {
                date: batchDate,
                productName: item.product_name || '',
                batchNo: batch.batch_no || '',
                receivedAt: batch.received_at.split('T')[0]
              };
            }
          }
        }
      }
    }
    return latest;
  }, [orderType, items, productBatches, isSourceWarehouse]);
  
  // 物流公司列表
  const logisticsCompanies = entities.filter(e => e.entity_type.includes('logistics'));
  
  // 商品搜索
  const [productSearch, setProductSearch] = useState('');
  
  // 判断商品是否有包装规格
  const hasSpec = (item: OrderItemForm) => {
    return !!item.spec_id && !!item.unit_quantity;
  };
  
  // 判断规格是否为散装（按基础单位计价）- 原版保留给其他地方使用
  const isSpecBulk = (item: OrderItemForm) => {
    return isItemSpecBulk(item);
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
  
  // 当装货单来源是仓库时，加载该仓库的库存（用于出库选批次）
  useEffect(() => {
    if (orderType === 'loading' && sourceId && isSourceWarehouse) {
      loadWarehouseStocks(sourceId);
    } else {
      setWarehouseStocks([]);
    }
  }, [orderType, sourceId, isSourceWarehouse]);

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

  // 装货单：任意来源 → 在途仓
  // 卸货单：在途仓 → 任意目标
  const getSourceOptions = () => {
    switch (orderType) {
      case 'loading': 
        // 装货单来源：供应商(A)、仓库(B)、客户(C) - 不包含在途仓
        return entities.filter(e => !e.entity_type.includes('transit') && !e.entity_type.includes('logistics') && !e.entity_type.includes('other'));
      case 'unloading': 
        // 卸货单来源：在途仓
        return entities.filter(e => e.entity_type.includes('transit'));
      default: return entities;
    }
  };

  const getTargetOptions = () => {
    switch (orderType) {
      case 'loading': 
        // 装货单目标：在途仓
        return entities.filter(e => e.entity_type.includes('transit'));
      case 'unloading': 
        // 卸货单目标：仓库(B)、客户(C)、供应商(A) - 不包含在途仓
        return entities.filter(e => !e.entity_type.includes('transit') && !e.entity_type.includes('logistics') && !e.entity_type.includes('other'));
      default: return entities;
    }
  };

  const addItem = () => { 
    // 默认计价方式：统一按重量（可通过选择规格改变）
    setItems([...items, { 
      _id: generateItemId(),  // 唯一标识
      product_id: 0, product_name: '', product_unit: '', 
      pricing_mode: 'weight',
      quantity: 1, unit_price: 0, shipping_cost: 0, notes: '', 
      available_quantity: undefined, batch_allocations: [], unit_count: 1 
    }]); 
  }
  
  // 加载产品的可用批次（批次按商品分，不按包装规格分）
  const loadProductBatches = async (productId: number, warehouseId: number) => {
    const cacheKey = productId.toString();
    if (productBatches[cacheKey]) return; // 已加载过
    try {
      const res = await batchesApi.listByProduct(productId, warehouseId);
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
          // 规格决定计价方式：散装按重量，否则按件
          const isBulk = defaultSpec.quantity === 1 && defaultSpec.name?.includes('散装');
          newItems[index].pricing_mode = isBulk ? 'weight' : 'container';
        } else {
          // 无规格：使用基础单位，按重量计价
          newItems[index].pricing_mode = 'weight';
        }
        
        // 按重量计量的商品：净重初始为0，等待毛重计算（采购单和销售单都适用）
        const needsGrossWeight = (defaultSpec && defaultSpec.quantity === 1 && defaultSpec.name?.includes('散装')) 
          || (!defaultSpec && isWeightBasedUnit(product.unit));
        if (needsGrossWeight) {
          newItems[index].quantity = 0;
          newItems[index].gross_weight = undefined;
        }
      }
      // 如果是从仓库装货，查找库存信息并加载批次
      if (orderType === 'loading' && isSourceWarehouse) {
        const stock = warehouseStocks.find(s => s.product_id === value);
        newItems[index].available_quantity = stock?.available_quantity;
        // 清空之前的批次选择
        newItems[index].batch_allocations = [];
        // 加载该商品的可用批次（批次按商品分，不按包装规格分）
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
        
        // 包装规格变化不需要重新加载批次（批次按商品分，不按包装规格分）
        // 但保留已选批次，因为还是同一个商品的库存
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

  // 获取可选商品列表（从仓库出货时根据库存过滤，支持搜索过滤）
  const getAvailableProducts = () => {
    let result = products;
    
    // 从仓库装货时，仅返回有库存的商品
    if (orderType === 'loading' && isSourceWarehouse) {
      const stockProductIds = warehouseStocks.map(s => s.product_id);
      result = result.filter(p => stockProductIds.includes(p.id));
    }
    // 从供应商/客户装货时，可选择任意商品（不走库存）
    
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
  
  // 获取商品的可用库存（仅从仓库装货时有意义）
  const getProductAvailableQuantity = (productId: number): number | undefined => {
    if (!(orderType === 'loading' && isSourceWarehouse)) return undefined;
    const stock = warehouseStocks.find(s => s.product_id === productId);
    return stock?.available_quantity;
  };

  const handleSubmit = async () => {
    if (!sourceId || !targetId) { toast({ title: '请选择来源和目标', variant: 'destructive' }); return; }
    if (items.length === 0 || items.some(item => !item.product_id)) { toast({ title: '请添加商品', variant: 'destructive' }); return; }
    if (!logisticsCompanyId) { toast({ title: '请选择物流公司', variant: 'destructive' }); return; }
    const dateLabel = orderType === 'loading' ? '装货日期' : '卸货日期';
    if (!orderDate) { toast({ title: `请选择${dateLabel}`, variant: 'destructive' }); return; }
    
    // 校验库存（从仓库装货需要校验，其他不需要）
    if (orderType === 'loading' && isSourceWarehouse) {
      // 找出所有批次中最晚的入库日期
      let latestBatchDate: Date | null = null;
      let latestBatchInfo: { productName: string; batchNo: string; receivedAt: string } | null = null;
      
      for (const item of items) {
        if (!item.product_id) continue;
        
        const available = getProductAvailableQuantity(item.product_id);
        if (available !== undefined && item.quantity > available) {
          toast({ title: '库存不足', description: `${item.product_name} 可用库存仅 ${available}，需要 ${item.quantity}`, variant: 'destructive' });
          return;
        }
        // 收集所有批次的入库日期，找最晚的那个
        // 优先使用用户选择的批次
        if (item.batch_allocations?.[0]?.received_at) {
          const batchDate = new Date(item.batch_allocations[0].received_at);
          batchDate.setHours(0, 0, 0, 0);
          if (!latestBatchDate || batchDate > latestBatchDate) {
            latestBatchDate = batchDate;
            latestBatchInfo = {
              productName: item.product_name || '',
              batchNo: item.batch_allocations[0].batch_no || '',
              receivedAt: item.batch_allocations[0].received_at.split('T')[0]
            };
          }
        } else {
          // 如果没有选择批次，从可用批次列表中找最晚的入库日期
          const batchCacheKey = getBatchCacheKey(item);
          const availableBatches = productBatches[batchCacheKey] || [];
          for (const batch of availableBatches) {
            if (batch.received_at) {
              const batchDate = new Date(batch.received_at);
              batchDate.setHours(0, 0, 0, 0);
              if (!latestBatchDate || batchDate > latestBatchDate) {
                latestBatchDate = batchDate;
                latestBatchInfo = {
                  productName: item.product_name || '',
                  batchNo: batch.batch_no || '',
                  receivedAt: batch.received_at.split('T')[0]
                };
              }
            }
          }
        }
      }
      
      // 校验装货日期不能早于所有批次中最晚的入库日期
      if (latestBatchDate && orderDate) {
        const businessDate = new Date(orderDate);
        businessDate.setHours(0, 0, 0, 0);
        if (businessDate < latestBatchDate) {
          toast({ 
            title: '日期错误', 
            description: `装货日期(${orderDate})不能早于批次入库日期。最晚入库的批次是"${latestBatchInfo?.productName}"的${latestBatchInfo?.batchNo}，入库日期为${latestBatchInfo?.receivedAt}`, 
            variant: 'destructive' 
          });
          return;
        }
      }
    }
    
    setSubmitting(true);
    try {
      const data: OrderCreateData = { 
        order_type: orderType, 
        source_id: sourceId, 
        target_id: targetId,
        logistics_company_id: logisticsCompanyId || undefined,
        order_date: orderDate || undefined,  // 业务日期（装货单=装货日期，卸货单=卸货日期）
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
  const getTypeLabel = (type: string) => ({ loading: '装货单', unloading: '卸货单' }[type] || type);
  const getSourceLabel = () => orderType === 'loading' ? '来源' : '在途仓';
  const getTargetLabel = () => orderType === 'loading' ? '在途仓' : '目标';

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
              { value: 'loading', label: '装货单', color: 'bg-blue-500', desc: 'X → 在途仓' }, 
              { value: 'unloading', label: '卸货单', color: 'bg-green-500', desc: '在途仓 → Y' }
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
          <p className="text-xs text-slate-500 mt-3">
            装货单：从供应商/仓库/客户装货发往在途仓 | 卸货单：从在途仓卸货到仓库/客户/供应商
          </p>
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
              {orderType === 'loading' && isSourceWarehouse && !sourceId && (
                <p className="text-xs text-amber-600 mt-1">请先选择出库仓库</p>
              )}
              {orderType === 'loading' && isSourceWarehouse && sourceId > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {stocksLoading ? '加载库存中...' : warehouseStocks.length === 0 ? '该仓库暂无库存' : `可选 ${warehouseStocks.length} 种库存商品`}
                </p>
              )}
            </div>
            <Button size="sm" onClick={addItem} disabled={orderType === 'loading' && isSourceWarehouse && (sourceId === 0 || warehouseStocks.length === 0)}>
              <Plus className="w-4 h-4 mr-1" />添加商品
            </Button>
          </div>
          {items.length === 0 ? <div className="text-center py-8 text-slate-500"><p>请添加商品</p><Button className="mt-2" onClick={addItem} disabled={orderType === 'loading' && isSourceWarehouse && (sourceId === 0 || warehouseStocks.length === 0)}><Plus className="w-4 h-4 mr-1" />添加第一个商品</Button></div> : (
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
                        {/* 根据规格类型和单位类型显示标签 */}
                        {(() => {
                          // 按重量计量的商品，显示"净重"
                          const showNetWeight = (
                            (hasSpec(item) && isSpecBulk(item)) || 
                            (!hasSpec(item) && isWeightBasedUnit(item.product_unit))
                          );
                          if (showNetWeight) {
                            return `净重 (${getBaseUnit(item)})`;
                          }
                          // 有规格的商品
                          if (hasSpec(item)) {
                            return isSpecBulk(item)
                              ? `净重 (${getBaseUnit(item)})`
                              : `件数 (${getContainerName(item)})`;
                          }
                          // 从仓库装货，按重量计量
                          if (orderType === 'loading' && isSourceWarehouse && isWeightBasedUnit(item.product_unit)) {
                            return `数量 (${item.product_unit || 'kg'})`;
                          }
                          // 默认
                          return `数量 (${item.product_unit || '个'})`;
                        })()} *
                      </label>
                      <Input 
                        type="number" 
                        min={isSpecBulk(item) || isWeightBasedUnit(item.product_unit) ? "0" : "1"}
                        step={isSpecBulk(item) || isWeightBasedUnit(item.product_unit) ? "0.01" : "1"}
                        max={item.available_quantity} 
                        value={item.quantity || ''} 
                        onChange={e => {
                          // 如果是按重量计量且需要通过毛重计算，不允许直接修改
                          const needsGrossWeight = (isSpecBulk(item) || isWeightBasedUnit(item.product_unit));
                          if (needsGrossWeight) return;
                          updateItem(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value));
                        }} 
                        onBlur={e => { 
                          const needsGrossWeight = (isSpecBulk(item) || isWeightBasedUnit(item.product_unit));
                          if (needsGrossWeight) return;
                          const minVal = 1;
                          if (!e.target.value || parseFloat(e.target.value) < minVal) {
                            updateItem(index, 'quantity', minVal);
                          }
                        }}
                        onFocus={e => e.target.select()}
                        className={`${item.available_quantity !== undefined && item.quantity > item.available_quantity ? 'border-red-500' : ''} ${(isSpecBulk(item) || isWeightBasedUnit(item.product_unit)) ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                        readOnly={isSpecBulk(item) || isWeightBasedUnit(item.product_unit)}
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
                  
                  {/* 装货单从仓库出货：批次选择（必选）- 独立行，占满宽度 */}
                  {/* 同商品不同规格视为不同商品，批次需要按规格匹配 */}
                  {(() => {
                    // 计算批次缓存键（散装规格不按规格筛选）
                    const batchCacheKey = getBatchCacheKey(item);
                    const itemBatches = productBatches[batchCacheKey] || [];
                    
                    // 只有装货单且来源是仓库时才需要选批次
                    if (!(orderType === 'loading' && isSourceWarehouse) || item.product_id <= 0 || itemBatches.length === 0) return null;
                    
                    return (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600 block mb-1">
                        📦 选择出货批次 *
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
                          <SelectValue placeholder="请选择出货批次" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)]">
                          {itemBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id.toString()}>
                              {batch.batch_no} 
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
                    const batchCacheKey = getBatchCacheKey(item);
                    const itemBatches = productBatches[batchCacheKey];
                    // 只有装货单且来源是仓库时才显示无批次警告
                    if (!(orderType === 'loading' && isSourceWarehouse) || item.product_id <= 0 || !itemBatches || itemBatches.length > 0) return null;
                    return (
                      <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
                        ⚠️ 该商品{item.spec_name ? `【${item.spec_name}】规格` : ''}暂无可用库存批次
                      </div>
                    );
                  })()}
                  
                  {/* 毛重扣重区域：散装规格 或 无规格的重量商品 */}
                  {['purchase', 'sale', 'loading', 'unloading'].includes(orderType) && item.product_id > 0 && (
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
          
          {/* 业务日期 */}
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              业务日期
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="group">
                <label className="text-xs font-medium text-slate-600 block mb-1.5">
                  {orderType === 'loading' ? '装货日期' : '卸货日期'} <span className="text-amber-600">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Calendar className="w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                  </div>
                  <input 
                    type="date"
                    value={orderDate} 
                    onChange={e => setOrderDate(e.target.value)}
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
                <p className="text-xs text-slate-400 mt-1">
                  {orderType === 'loading' ? '货物从来源发出的日期' : '货物送达目标的日期'}
                </p>
              </div>
            </div>
            {/* 从仓库装货：装货日期不能早于最晚批次入库日期 */}
            {orderType === 'loading' && isSourceWarehouse && orderDate && latestBatchReceivedDate && (() => {
              const businessDate = new Date(orderDate);
              businessDate.setHours(0, 0, 0, 0);
              return businessDate < latestBatchReceivedDate.date;
            })() && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700">
                🚫 <strong>日期错误：</strong>装货日期({orderDate})不能早于批次入库日期。最晚入库的批次是"{latestBatchReceivedDate.productName}"的{latestBatchReceivedDate.batchNo}，入库日期为{latestBatchReceivedDate.receivedAt}
              </div>
            )}
          </div>
          
          {/* 运费与冷藏费 - 统一区域 */}
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700">运费与冷藏费</h3>
              {(isSourceWarehouse || isTargetWarehouse) && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={calculateStorageFee} 
                    onChange={e => setCalculateStorageFee(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-600">计算冷藏费</span>
                </label>
              )}
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
                  placeholder="运费"
                />
                <p className="text-xs text-slate-400 mt-1">💡 应付物流公司</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">冷藏费（元）</label>
                {(isSourceWarehouse || isTargetWarehouse) ? (
                  <>
                    <div className={`h-10 flex items-center text-sm font-medium rounded px-3 border ${calculateStorageFee ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-400 bg-slate-50 border-slate-200'}`}>
                      {calculateStorageFee 
                        ? (items.length > 0 ? `预估 ¥${storageFee.toFixed(2)}` : '添加商品后计算')
                        : '不计算'
                      }
                    </div>
                    {calculateStorageFee && (
                      <p className="text-xs text-slate-400 mt-1">
                        💡 {orderType === 'loading' && isSourceWarehouse ? '出库费+存储费' : '入库费：每吨15元'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-10 flex items-center text-sm text-slate-400 bg-slate-50 rounded px-3 border border-slate-200">
                    无需计算
                  </div>
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
              <div>
                <label className="text-xs text-slate-500 block mb-1">总毛重（参考）</label>
                <div className="h-10 flex items-center text-sm font-medium text-slate-900 bg-gray-50 rounded px-3">
                  {totalGrossWeight > 0 ? `${totalGrossWeight.toLocaleString()} kg` : '-'}
                </div>
              </div>
            </div>
          </div>
          
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

