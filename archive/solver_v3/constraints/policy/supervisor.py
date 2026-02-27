"""
S7/S9: 主管策略约束 (Supervisor Policy)

S7: 主管少干活 - 除非万不得已，尽量少安排主管做一线操作
S9: 主管避免夜班 - 尽可能不安排主管上夜班

实现：检查员工角色，对主管的操作分配和夜班分配产生惩罚。
"""

from typing import TYPE_CHECKING, List, Dict, Set
from datetime import datetime

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


# 主管角色列表
SUPERVISOR_ROLES = {'GROUP_LEADER', 'TEAM_LEADER', 'SUPERVISOR', 'MANAGER'}


class SupervisorPolicy:
    """主管策略：限制主管参与一线操作和夜班"""
    
    # 默认惩罚分
    DEFAULT_OPERATION_PENALTY = 500   # S7: 主管干活惩罚
    DEFAULT_NIGHT_PENALTY = 2000      # S9: 主管夜班惩罚
    
    def __init__(
        self,
        operation_penalty: int = 500,
        night_penalty: int = 2000,
        supervisor_roles: Set[str] = None,
    ):
        """
        Args:
            operation_penalty: 主管参与一线操作的惩罚分
            night_penalty: 主管上夜班的惩罚分
            supervisor_roles: 被视为主管的角色集合
        """
        self.operation_penalty = operation_penalty
        self.night_penalty = night_penalty
        self.supervisor_roles = supervisor_roles or SUPERVISOR_ROLES
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> int:
        """
        应用主管策略
        
        Returns:
            添加的惩罚项数量
        """
        penalty_count = 0
        
        # 找出所有主管
        supervisor_ids = self._get_supervisor_ids(context)
        
        if not supervisor_ids:
            info("[S7/S9] 主管策略: 未发现主管角色员工，跳过")
            return 0
        
        for op in context.request.operations:
            is_night_op = self._is_night_operation(op)
            
            for pos in range(op.required_people):
                for sup_id in supervisor_ids:
                    var_key = (op.id, pos, sup_id)
                    if var_key not in context.assignment_vars:
                        continue
                    
                    assign_var = context.assignment_vars[var_key]
                    
                    # S7: 主管参与操作惩罚
                    if self.operation_penalty > 0:
                        op_penalty_var = model.NewIntVar(
                            0, self.operation_penalty,
                            f"sup_op_penalty_{op.id}_{pos}_{sup_id}"
                        )
                        model.Add(op_penalty_var == self.operation_penalty * assign_var)
                        
                        builder.add_soft_penalty(
                            op_penalty_var,
                            weight=1,
                            description=f"S7 主管干活: {op.operation_name}"
                        )
                        penalty_count += 1
                    
                    # S9: 主管夜班惩罚
                    if is_night_op and self.night_penalty > 0:
                        night_penalty_var = model.NewIntVar(
                            0, self.night_penalty,
                            f"sup_night_penalty_{op.id}_{pos}_{sup_id}"
                        )
                        model.Add(night_penalty_var == self.night_penalty * assign_var)
                        
                        builder.add_soft_penalty(
                            night_penalty_var,
                            weight=1,
                            description=f"S9 主管夜班: {op.operation_name}"
                        )
                        penalty_count += 1
        
        info(f"[S7/S9] 主管策略: {len(supervisor_ids)} 名主管, {penalty_count} 个惩罚项")
        return penalty_count
    
    def _get_supervisor_ids(self, context: 'SolverContext') -> Set[int]:
        """获取主管员工ID集合"""
        supervisor_ids = set()
        
        for emp in context.request.employees:
            role = getattr(emp, 'role', '').upper()
            if role in self.supervisor_roles:
                supervisor_ids.add(emp.id)
        
        return supervisor_ids
    
    def _is_night_operation(self, op) -> bool:
        """判断是否是夜班操作"""
        try:
            if isinstance(op.planned_start, datetime):
                hour = op.planned_start.hour
            elif isinstance(op.planned_start, str):
                dt = datetime.fromisoformat(op.planned_start.replace('Z', '+00:00'))
                hour = dt.hour
            else:
                return False
            
            return hour >= 20 or hour < 6
        except:
            return False


# 别名
SupervisorNightPenalty = SupervisorPolicy
