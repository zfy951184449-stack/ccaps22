"""
冲突报告数据结构

定义约束冲突检测的结果格式。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any
from enum import Enum


class ConflictType(str, Enum):
    """冲突类型"""
    NO_CANDIDATES = "NO_CANDIDATES"           # 无候选人
    ALL_UNAVAILABLE = "ALL_UNAVAILABLE"       # 候选人全部不可用
    DEMAND_OVERFLOW = "DEMAND_OVERFLOW"       # 日期需求超出可用人数
    NIGHT_REST = "NIGHT_REST"                 # 夜班休息冲突


class ConflictSeverity(str, Enum):
    """冲突严重程度"""
    CRITICAL = "CRITICAL"   # 严重：必然无法分配
    WARNING = "WARNING"     # 警告：可能无法分配


@dataclass
class OperationConflict:
    """单个操作的冲突信息"""
    op_id: int                      # 操作计划ID
    op_name: str                    # 操作名称
    date: str                       # 操作日期
    conflict_type: str              # 冲突类型
    severity: str                   # 严重程度
    reason: str                     # 简短原因描述
    details: List[str] = field(default_factory=list)  # 详细信息
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "op_id": self.op_id,
            "op_name": self.op_name,
            "date": self.date,
            "conflict_type": self.conflict_type,
            "severity": self.severity,
            "reason": self.reason,
            "details": self.details,
        }


@dataclass
class ConflictReport:
    """冲突检测报告"""
    critical_conflicts: List[OperationConflict] = field(default_factory=list)
    warnings: List[OperationConflict] = field(default_factory=list)
    
    @property
    def has_critical(self) -> bool:
        """是否有严重冲突"""
        return len(self.critical_conflicts) > 0
    
    @property
    def has_warnings(self) -> bool:
        """是否有警告"""
        return len(self.warnings) > 0
    
    @property
    def total_count(self) -> int:
        """冲突总数"""
        return len(self.critical_conflicts) + len(self.warnings)
    
    def add_conflict(self, conflict: OperationConflict) -> None:
        """添加冲突"""
        if conflict.severity == ConflictSeverity.CRITICAL.value:
            self.critical_conflicts.append(conflict)
        else:
            self.warnings.append(conflict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "critical_conflicts": [c.to_dict() for c in self.critical_conflicts],
            "warnings": [w.to_dict() for w in self.warnings],
            "summary": self._generate_summary(),
        }
    
    def _generate_summary(self) -> str:
        """生成摘要"""
        if not self.has_critical and not self.has_warnings:
            return "未检测到约束冲突"
        
        parts = []
        if self.has_critical:
            parts.append(f"{len(self.critical_conflicts)} 个操作无法分配")
        if self.has_warnings:
            parts.append(f"{len(self.warnings)} 个警告")
        
        return "，".join(parts)
