-- ============================================================
-- 单位系统改革迁移脚本
-- 改革内容：
-- 1. Stock 表 quantity 从 INTEGER 改为 DECIMAL(12,2)
-- 2. OrderItem 表添加复式单位快照字段和计价方式
-- ============================================================

-- ============ 1. 修改 Stock 表字段类型 ============
-- 将 quantity、reserved_quantity、safety_stock 改为 DECIMAL 类型

ALTER TABLE v3_stocks 
  MODIFY COLUMN quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT '当前库存数量';

ALTER TABLE v3_stocks 
  MODIFY COLUMN reserved_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT '预留数量';

ALTER TABLE v3_stocks 
  MODIFY COLUMN safety_stock DECIMAL(12, 2) DEFAULT 0.00 COMMENT '安全库存';

-- ============ 2. 修改 StockFlow 表字段类型 ============

ALTER TABLE v3_stock_flows 
  MODIFY COLUMN quantity_change DECIMAL(12, 2) NOT NULL COMMENT '变动数量';

ALTER TABLE v3_stock_flows 
  MODIFY COLUMN quantity_before DECIMAL(12, 2) NOT NULL COMMENT '变动前数量';

ALTER TABLE v3_stock_flows 
  MODIFY COLUMN quantity_after DECIMAL(12, 2) NOT NULL COMMENT '变动后数量';

-- ============ 3. OrderItem 表添加复式单位快照字段 ============

-- 复式单位ID
ALTER TABLE v3_order_items 
  ADD COLUMN composite_unit_id INT NULL COMMENT '复式单位ID',
  ADD CONSTRAINT fk_order_item_composite_unit 
    FOREIGN KEY (composite_unit_id) REFERENCES v3_composite_units(id);

-- 复式单位名称快照
ALTER TABLE v3_order_items 
  ADD COLUMN composite_unit_name VARCHAR(50) NULL COMMENT '复式单位名称快照，如：件(20kg)';

-- 容器名称快照
ALTER TABLE v3_order_items 
  ADD COLUMN container_name VARCHAR(20) NULL COMMENT '容器名称快照，如：件、箱';

-- 每件数量快照
ALTER TABLE v3_order_items 
  ADD COLUMN unit_quantity FLOAT NULL COMMENT '每件数量快照，如：20';

-- 基础单位符号快照
ALTER TABLE v3_order_items 
  ADD COLUMN base_unit_symbol VARCHAR(10) NULL COMMENT '基础单位符号快照，如：kg';

-- ============ 4. OrderItem 表添加计价方式字段 ============

-- 计价方式
ALTER TABLE v3_order_items 
  ADD COLUMN pricing_mode VARCHAR(20) DEFAULT 'weight' COMMENT '计价方式: container(按件)/weight(按重量)';

-- 件数
ALTER TABLE v3_order_items 
  ADD COLUMN container_count DECIMAL(12, 2) NULL COMMENT '件数（复式单位时）';

-- ============ 完成提示 ============
SELECT '单位系统改革迁移完成！' AS message;
SELECT '新增字段: composite_unit_id, composite_unit_name, container_name, unit_quantity, base_unit_symbol, pricing_mode, container_count' AS new_columns;

