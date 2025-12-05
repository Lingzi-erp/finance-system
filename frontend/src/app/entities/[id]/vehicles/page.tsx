'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Truck, Pencil, Trash2, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { entitiesApi, vehiclesApi, Entity, Vehicle } from '@/lib/api/v3';

export default function VehiclesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const entityId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  
  // 弹窗状态
  const [showDialog, setShowDialog] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    plate_number: '',
    vehicle_type: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [entityId]);

  const loadData = async () => {
    try {
      const [entityData, vehiclesData] = await Promise.all([
        entitiesApi.get(entityId),
        vehiclesApi.list({ logistics_company_id: entityId }),
      ]);
      
      if (!entityData || !entityData.entity_type.includes('logistics')) {
        toast({ title: '该实体不是物流公司', variant: 'destructive' });
        router.push('/entities');
        return;
      }
      
      setEntity(entityData);
      setVehicles(vehiclesData.data);
    } catch (err: any) {
      toast({ title: '加载失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingVehicle(null);
    setFormData({ plate_number: '', vehicle_type: '', notes: '' });
    setShowDialog(true);
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      plate_number: vehicle.plate_number,
      vehicle_type: vehicle.vehicle_type || '',
      notes: vehicle.notes || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.plate_number.trim()) {
      toast({ title: '请输入车牌号', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingVehicle) {
        await vehiclesApi.update(editingVehicle.id, {
          plate_number: formData.plate_number.trim(),
          vehicle_type: formData.vehicle_type.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        toast({ title: '更新成功' });
      } else {
        await vehiclesApi.create({
          plate_number: formData.plate_number.trim(),
          logistics_company_id: entityId,
          vehicle_type: formData.vehicle_type.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        toast({ title: '添加成功' });
      }
      setShowDialog(false);
      loadData();
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle: Vehicle) => {
    if (!confirm(`确定要删除车辆 ${vehicle.plate_number} 吗？`)) return;
    
    try {
      await vehiclesApi.delete(vehicle.id);
      toast({ title: '删除成功' });
      loadData();
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-ink-medium">加载中...</p>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-ink-medium">实体不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-white">
      <div className="container mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="mb-6">
          <Link href="/entities" className="text-ink-medium hover:text-ink-black flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> 返回实体管理
          </Link>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ink-black">{entity.name}</h1>
                <p className="text-sm text-ink-medium">车辆管理 · {vehicles.length} 辆车</p>
              </div>
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-2" /> 添加车辆
            </Button>
          </div>
        </div>

        {/* 车辆列表 */}
        <div className="bg-paper-light border border-ink-light rounded-xl">
          {vehicles.length === 0 ? (
            <div className="text-center py-12">
              <Car className="w-12 h-12 text-ink-light mx-auto mb-4" />
              <p className="text-ink-medium mb-4">暂无车辆</p>
              <Button onClick={openAddDialog}>
                <Plus className="w-4 h-4 mr-2" /> 添加第一辆车
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-ink-light">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Car className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-ink-black">{vehicle.plate_number}</div>
                      <div className="text-sm text-ink-medium">
                        {vehicle.vehicle_type || '普通货车'}
                        {vehicle.notes && <span className="ml-2">· {vehicle.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(vehicle)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(vehicle)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加/编辑弹窗 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingVehicle ? '编辑车辆' : '添加车辆'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-ink-dark block mb-1">
                  车牌号 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.plate_number}
                  onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                  placeholder="如：粤B12345"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-dark block mb-1">
                  车辆类型
                </label>
                <Input
                  value={formData.vehicle_type}
                  onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                  placeholder="如：冷藏车、普通货车"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-dark block mb-1">
                  备注
                </label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="可选备注信息"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

