"""
扣重公式模型 - 用于计算净重
支持多种计算方式：
- 无扣重：净重 = 毛重
- 按比例扣：净重 = 毛重 × 比例（如0.99表示扣1%）
- 固定扣重：净重 = 毛重 - 固定值
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class DeductionFormula(Base):
    """扣重公式"""
    __tablename__ = "v3_deduction_formulas"

    id = Column(Integer, primary_key=True, index=True)
    
    # 公式名称（如"无扣重"、"扣1%"、"扣2%冰块"）
    name = Column(String(50), nullable=False, unique=True, comment="公式名称")
    
    # 公式类型
    # none: 无扣重，净重=毛重
    # percentage: 按比例，净重=毛重×比例
    # fixed: 固定扣重，净重=毛重-固定值
    # fixed_per_unit: 按件扣重，净重=毛重-（件数×每件扣重）
    formula_type = Column(String(20), nullable=False, default="none", comment="公式类型")
    
    # 公式参数
    # percentage类型：0.99表示净重=毛重×0.99（扣1%）
    # fixed类型：直接是扣除的重量（斤）
    # fixed_per_unit类型：每件扣除的重量
    value = Column(DECIMAL(10, 4), default=Decimal("1.00"), comment="公式参数值")
    
    # 描述/备注
    description = Column(String(200), comment="描述说明")
    
    # 是否为默认公式
    is_default = Column(Boolean, default=False, comment="是否默认")
    
    # 是否启用
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 排序
    sort_order = Column(Integer, default=0, comment="排序")
    
    # 审计字段
    created_by = Column(Integer, ForeignKey("sys_user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    creator = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<DeductionFormula {self.name}: {self.formula_type}={self.value}>"
    
    def calculate_net_weight(self, gross_weight: Decimal, unit_count: int = 1) -> Decimal:
        """
        根据公式计算净重
        
        Args:
            gross_weight: 毛重
            unit_count: 件数（仅 fixed_per_unit 类型使用）
        
        Returns:
            计算后的净重
        """
        if self.formula_type == "none":
            return gross_weight
        elif self.formula_type == "percentage":
            return gross_weight * self.value
        elif self.formula_type == "fixed":
            result = gross_weight - self.value
            return max(result, Decimal("0"))  # 防止负数
        elif self.formula_type == "fixed_per_unit":
            result = gross_weight - (Decimal(str(unit_count)) * self.value)
            return max(result, Decimal("0"))
        else:
            return gross_weight
    
    def calculate_tare_weight(self, gross_weight: Decimal, unit_count: int = 1) -> Decimal:
        """
        计算皮重（毛重 - 净重）
        """
        net = self.calculate_net_weight(gross_weight, unit_count)
        return gross_weight - net
    
    @property
    def formula_display(self) -> str:
        """公式显示"""
        if self.formula_type == "none":
            return "净重 = 毛重"
        elif self.formula_type == "percentage":
            pct = (Decimal("1") - self.value) * 100
            return f"净重 = 毛重 × {self.value}（扣{pct:.1f}%）"
        elif self.formula_type == "fixed":
            return f"净重 = 毛重 - {self.value}斤"
        elif self.formula_type == "fixed_per_unit":
            return f"净重 = 毛重 - (件数 × {self.value}斤/件)"
        return "未知公式"
    
    @property
    def type_display(self) -> str:
        """类型显示"""
        type_map = {
            "none": "无扣重",
            "percentage": "按比例",
            "fixed": "固定扣重",
            "fixed_per_unit": "按件扣重"
        }
        return type_map.get(self.formula_type, self.formula_type)

