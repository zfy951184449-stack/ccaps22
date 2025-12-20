"""
热启动初始解生成器

使用贪心算法生成初始解 Hint，加速 CP-SAT 求解器找到第一个可行解。

策略：
1. 按优先级排序操作（夜班优先、峰值日优先、候选人少优先）
2. 按负荷均衡选择员工（选择当日负荷最低的合格候选人）
3. 简化版约束检查（时间冲突、夜班休息）
"""

from __future__ import annotations
import logging
from typing import Dict, List, Set, Tuple, TYPE_CHECKING
from datetime import datetime, timedelta
from collections import defaultdict
import math

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from models.context import SolverContext
    from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class HintGenerator:
    """贪心初始解生成器
    
    为 CP-SAT 求解器生成初始解 Hint，加速找到第一个可行解。
    """
    
    def __init__(
        self, 
        context: "SolverContext", 
        variables: "ModelVariables"
    ):
        self.context = context
        self.variables = variables
        
        # 员工状态跟踪
        self._employee_load: Dict[int, float] = defaultdict(float)  # 员工累计工时（分钟）
        self._employee_day_assignments: Dict[Tuple[int, str], List[int]] = defaultdict(list)  # (emp_id, date) -> [op_ids]
        self._employee_last_night: Dict[int, str] = {}  # 员工最后一次夜班日期
        
        # 操作时间缓存
        self._operation_times: Dict[int, Tuple[datetime, datetime]] = {}
        self._operation_dates: Dict[int, str] = {}
        self._night_operations: Set[int] = set()
        
        # 分配结果
        self._hints: Dict[Tuple[int, int], int] = {}
        
    def generate(self) -> Dict[Tuple[int, int], int]:
        """生成初始解 Hint
        
        Returns:
            Dict[(op_id, emp_id), 0|1] - 建议的分配值
        """
        logger.info("[HintGenerator] 开始生成初始解 Hint...")
        
        # 1. 预处理：解析操作时间
        self._parse_operation_times()
        
        # 2. 按优先级排序操作
        sorted_ops = self._get_sorted_operations()
        
        # 3. 贪心分配
        assigned_count = 0
        skipped_count = 0
        
        for op_id in sorted_ops:
            op = self.context.operations.get(op_id)
            if not op:
                continue
            
            # 获取候选员工
            candidates = self.variables.operation_candidates.get(op_id, [])
            if not candidates:
                skipped_count += 1
                continue
            
            # 尝试为每个岗位分配员工
            required = op.required_people
            assigned_emps = set()
            
            for pos_num in range(1, required + 1):
                best_emp = self._select_best_employee(op_id, candidates, assigned_emps)
                if best_emp is not None:
                    # 记录分配
                    self._record_assignment(op_id, best_emp)
                    assigned_emps.add(best_emp)
                    assigned_count += 1
        
        # 4. 生成 Hint 字典
        self._build_hints()
        
        logger.info(
            f"[HintGenerator] 生成完成: 分配 {assigned_count} 人次, "
            f"跳过 {skipped_count} 个无候选人操作, "
            f"生成 {len(self._hints)} 个 Hint"
        )
        
        return self._hints
    
    def _parse_operation_times(self) -> None:
        """解析操作时间"""
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            try:
                start = datetime.fromisoformat(op.planned_start.replace("Z", "+00:00"))
                end = datetime.fromisoformat(op.planned_end.replace("Z", "+00:00"))
                self._operation_times[op_id] = (start, end)
                self._operation_dates[op_id] = op.planned_start[:10]
                
                # 识别夜班操作
                if start.hour >= 20 or end.date() > start.date():
                    self._night_operations.add(op_id)
            except:
                pass
    
    def _get_sorted_operations(self) -> List[int]:
        """按优先级排序操作
        
        优先级因素：
        1. 夜班操作（权重 30）
        2. 峰值日（权重 30）
        3. 候选人稀缺度（权重 20）
        4. 操作持续时间（权重 20）
        """
        # 计算每日需求量
        daily_demand: Dict[str, int] = defaultdict(int)
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            date_key = self._operation_dates.get(op_id, "")
            if date_key:
                daily_demand[date_key] += op.required_people
        
        max_demand = max(daily_demand.values()) if daily_demand else 1
        
        # 计算每个操作的优先级分数
        priorities = []
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            candidates = self.variables.operation_candidates.get(op_id, [])
            if not candidates:
                continue
            
            # 夜班分数 (0 或 30)
            night_score = 30 if op_id in self._night_operations else 0
            
            # 峰值日分数 (0-30)
            date_key = self._operation_dates.get(op_id, "")
            demand = daily_demand.get(date_key, 0)
            peak_score = 30 * (demand / max_demand) if max_demand > 0 else 0
            
            # 稀缺度分数 (0-20)
            candidate_count = len(candidates)
            scarcity_score = 20 * (1.0 / (1 + math.log(max(candidate_count, 1))))
            
            # 持续时间分数 (0-20)
            duration_score = min(20, op.planned_duration_minutes / 30)
            
            total_score = night_score + peak_score + scarcity_score + duration_score
            priorities.append((op_id, total_score))
        
        # 按分数降序排列
        priorities.sort(key=lambda x: -x[1])
        
        return [op_id for op_id, _ in priorities]
    
    def _select_best_employee(
        self, 
        op_id: int, 
        candidates: List[Tuple[int, any]], 
        excluded: Set[int]
    ) -> int | None:
        """选择最佳员工
        
        策略：
        1. 排除已分配到该操作的员工
        2. 排除有时间冲突的员工
        3. 排除夜班休息期内的员工
        4. 选择当日负荷最低的员工
        """
        op = self.context.operations.get(op_id)
        if not op:
            return None
        
        date_key = self._operation_dates.get(op_id, "")
        
        valid_candidates = []
        
        for emp_id, _ in candidates:
            if emp_id in excluded:
                continue
            
            # 检查时间冲突
            if self._has_time_conflict(emp_id, op_id):
                continue
            
            # 检查夜班休息
            if self._violates_night_rest(emp_id, date_key):
                continue
            
            # 计算当日负荷（用于排序）
            day_load = self._get_employee_day_load(emp_id, date_key)
            valid_candidates.append((emp_id, day_load))
        
        if not valid_candidates:
            return None
        
        # 选择负荷最低的员工
        valid_candidates.sort(key=lambda x: x[1])
        return valid_candidates[0][0]
    
    def _has_time_conflict(self, emp_id: int, op_id: int) -> bool:
        """检查员工是否与该操作有时间冲突"""
        times = self._operation_times.get(op_id)
        if not times:
            return False
        
        op_start, op_end = times
        date_key = self._operation_dates.get(op_id, "")
        
        # 检查该员工当天已分配的操作
        assigned_ops = self._employee_day_assignments.get((emp_id, date_key), [])
        
        for assigned_op_id in assigned_ops:
            assigned_times = self._operation_times.get(assigned_op_id)
            if not assigned_times:
                continue
            
            assigned_start, assigned_end = assigned_times
            
            # 检查时间重叠
            if not (op_end <= assigned_start or op_start >= assigned_end):
                return True
        
        return False
    
    def _violates_night_rest(self, emp_id: int, date_key: str) -> bool:
        """检查是否违反夜班休息约束"""
        if not self.context.config.enforce_night_rest:
            return False
        
        last_night = self._employee_last_night.get(emp_id)
        if not last_night:
            return False
        
        rest_days = self.context.config.night_rest_hard_days
        
        try:
            last_night_dt = datetime.strptime(last_night, "%Y-%m-%d")
            current_dt = datetime.strptime(date_key, "%Y-%m-%d")
            delta = (current_dt - last_night_dt).days
            
            # 夜班后 rest_days 天内不能分配
            return 0 < delta <= rest_days
        except:
            return False
    
    def _get_employee_day_load(self, emp_id: int, date_key: str) -> float:
        """获取员工当日负荷（分钟）"""
        assigned_ops = self._employee_day_assignments.get((emp_id, date_key), [])
        total_minutes = 0
        
        for op_id in assigned_ops:
            op = self.context.operations.get(op_id)
            if op:
                total_minutes += op.planned_duration_minutes
        
        return total_minutes
    
    def _record_assignment(self, op_id: int, emp_id: int) -> None:
        """记录分配"""
        date_key = self._operation_dates.get(op_id, "")
        
        # 更新员工负荷
        op = self.context.operations.get(op_id)
        if op:
            self._employee_load[emp_id] += op.planned_duration_minutes
        
        # 记录当日分配
        self._employee_day_assignments[(emp_id, date_key)].append(op_id)
        
        # 更新夜班记录
        if op_id in self._night_operations:
            self._employee_last_night[emp_id] = date_key
    
    def _build_hints(self) -> None:
        """构建 Hint 字典"""
        # 对于所有分配变量，设置 Hint 值
        for (emp_id, date_key), assigned_ops in self._employee_day_assignments.items():
            assigned_set = set(assigned_ops)
            
            for op_id in assigned_set:
                key = (op_id, emp_id)
                if key in self.variables.assignment_vars:
                    self._hints[key] = 1
        
        # 对于未分配的变量，设置 Hint 值为 0
        for key in self.variables.assignment_vars.keys():
            if key not in self._hints:
                self._hints[key] = 0
