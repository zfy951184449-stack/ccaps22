"""
F1-F4: 公平性目标函数

F1: 夜班数量方差最小化
F2: 长白班数量方差最小化
F3: 工时方差最小化
F4: 极差最小化 (max - min)

实现方式: 使用目标区间惩罚法代替 AddMaxEquality
"""

from typing import TYPE_CHECKING, List, Dict, Set, Tuple

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class FairnessObjective:
    """
    公平性目标函数
    
    最小化员工之间的工作量差异。
    """
    
    # 权重配置
    NIGHT_SHIFT_WEIGHT = 100    # 夜班公平权重
    DAY_SHIFT_WEIGHT = 50       # 长白班公平权重
    HOURS_WEIGHT = 10           # 工时公平权重
    RANGE_PENALTY = 200         # 极差惩罚 (每单位极差)
    
    TARGET_MAX_RANGE = 3        # 目标极差上限
    
    def __init__(
        self,
        night_shift_weight: int = 100,
        day_shift_weight: int = 50,
        hours_weight: int = 10,
        range_penalty: int = 200,
        target_max_range: int = 3,
    ):
        self.night_shift_weight = night_shift_weight
        self.day_shift_weight = day_shift_weight
        self.hours_weight = hours_weight
        self.range_penalty = range_penalty
        self.target_max_range = target_max_range
        
        # 用于统计
        self.night_shift_counts: Dict[int, any] = {}  # emp_id -> IntVar
        self.day_shift_counts: Dict[int, any] = {}
        self.hours_counts: Dict[int, any] = {}
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用所有公平性约束"""
        self._apply_shift_fairness(model, context, builder)
        self._apply_hours_fairness(model, context, builder)
        self._apply_range_penalty(model, context, builder)
    
    def _apply_shift_fairness(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """F1-F2: 班次公平性"""
        employees = list(context.employee_by_id.keys())
        if len(employees) < 2:
            return
        
        # 为每个员工计算夜班和长白班数量
        for emp_id in employees:
            night_count_terms = []
            day_count_terms = []
            
            for op in context.request.operations:
                for pos in range(op.required_people):
                    var_key = (op.id, pos, emp_id)
                    if var_key not in context.assignment_vars:
                        continue
                    
                    assign_var = context.assignment_vars[var_key]
                    
                    # 检查操作对应的班次类型
                    # 使用 Context 中的班次分类结果
                    shift_id = context.get_op_shift_type(op.id)
                    
                    if shift_id and shift_id in context.night_shift_ids:
                        night_count_terms.append(assign_var)
                    elif shift_id and shift_id in context.day_shift_ids:
                        day_count_terms.append(assign_var)
            
            # 创建夜班计数变量
            max_nights = len(context.request.operations)
            night_var = model.NewIntVar(0, max_nights, f"night_count_{emp_id}")
            if night_count_terms:
                model.Add(night_var == sum(night_count_terms))
            else:
                model.Add(night_var == 0)
            self.night_shift_counts[emp_id] = night_var
            
            # 创建长白班计数变量
            day_var = model.NewIntVar(0, max_nights, f"day_count_{emp_id}")
            if day_count_terms:
                model.Add(day_var == sum(day_count_terms))
            else:
                model.Add(day_var == 0)
            self.day_shift_counts[emp_id] = day_var
        
        # 计算平均值并添加偏差惩罚
        self._add_variance_penalty(
            model, builder, 
            list(self.night_shift_counts.values()),
            self.night_shift_weight,
            "夜班公平"
        )
        
        self._add_variance_penalty(
            model, builder,
            list(self.day_shift_counts.values()),
            self.day_shift_weight,
            "长白班公平"
        )
        
        info(f"[F1-F2] 班次公平: 添加 {len(employees)} 个员工的公平性约束")
    
    def _apply_hours_fairness(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """F3: 工时公平性"""
        employees = list(context.employee_by_id.keys())
        if len(employees) < 2:
            return
        
        # 计算每个员工的总操作工时
        for emp_id in employees:
            hours_terms = []  # [(coefficient_scaled, var), ...]
            
            for op in context.request.operations:
                hours_scaled = int(op.duration_minutes / 60 * 10)  # 0.1h 精度
                
                for pos in range(op.required_people):
                    var_key = (op.id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        hours_terms.append((hours_scaled, context.assignment_vars[var_key]))
            
            # 创建工时变量
            max_hours = sum(op.duration_minutes for op in context.request.operations) // 60 * 10
            hours_var = model.NewIntVar(0, max_hours, f"hours_{emp_id}")
            
            if hours_terms:
                model.Add(hours_var == sum(coef * var for coef, var in hours_terms))
            else:
                model.Add(hours_var == 0)
            
            self.hours_counts[emp_id] = hours_var
        
        # 添加工时方差惩罚
        self._add_variance_penalty(
            model, builder,
            list(self.hours_counts.values()),
            self.hours_weight,
            "工时公平"
        )
        
        info(f"[F3] 工时公平: 添加 {len(employees)} 个员工的工时公平约束")
    
    def _apply_range_penalty(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """F4: 极差惩罚"""
        # 对夜班数量添加极差惩罚
        if len(self.night_shift_counts) >= 2:
            counts = list(self.night_shift_counts.values())
            max_val = model.NewIntVar(0, 100, "max_night")
            min_val = model.NewIntVar(0, 100, "min_night")
            
            model.AddMaxEquality(max_val, counts)
            model.AddMinEquality(min_val, counts)
            
            # 极差变量
            range_var = model.NewIntVar(0, 100, "night_range")
            model.Add(range_var == max_val - min_val)
            
            # 超过目标极差的惩罚
            excess = model.NewIntVar(0, 100, "night_excess")
            model.AddMaxEquality(excess, [range_var - self.target_max_range, 0])
            
            builder.add_fairness_penalty(
                excess,
                weight=self.range_penalty,
                description="夜班极差惩罚"
            )
        
        info(f"[F4] 极差惩罚: 目标极差 ≤ {self.target_max_range}")
    
    def _add_variance_penalty(
        self,
        model: 'cp_model.CpModel',
        builder: 'ObjectiveBuilder',
        count_vars: List,
        weight: int,
        description: str,
    ) -> None:
        """
        添加方差惩罚 (使用目标区间法)
        
        对每个员工的计数与平均值的偏差进行惩罚。
        """
        if len(count_vars) < 2:
            return
        
        n = len(count_vars)
        
        # 计算总和
        total = model.NewIntVar(0, 10000, f"total_{description}")
        model.Add(total == sum(count_vars))
        
        # 对于每个员工，计算与平均的偏差
        # 由于平均值可能不是整数，我们使用: n * count - total 的绝对值
        for i, count_var in enumerate(count_vars):
            # deviation = abs(n * count - total)
            scaled_count = model.NewIntVar(-10000, 10000, f"scaled_{description}_{i}")
            model.Add(scaled_count == n * count_var - total)
            
            # 绝对值偏差
            abs_dev = model.NewIntVar(0, 10000, f"abs_dev_{description}_{i}")
            model.AddAbsEquality(abs_dev, scaled_count)
            
            # 添加惩罚
            builder.add_fairness_penalty(
                abs_dev,
                weight=weight // n,  # 平均权重
                description=f"{description}_{i}"
            )
    

