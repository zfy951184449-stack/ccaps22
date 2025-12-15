"""
操作分配约束（合并版）

整合了操作分配、资质匹配、共享组、时间冲突和连续工作的所有约束逻辑。
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple, Optional
import logging
import bisect
from ortools.sat.python import cp_model

from .base import BaseConstraint
from models.context import SolverContext
from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class OperationAssignmentConstraint(BaseConstraint):
    """操作分配约束（合并版）
    
    硬约束：
    H1. 资质匹配：员工资质等级 >= 岗位要求等级才能分配
    H2. 一位一人：每个位置最多分配1人
    H3. 人不分身（同操作）：同一人不能在同一操作的多个位置
    H4. 人不分身（跨操作）：同一人不能在时间重叠的不同操作（除非设置了共享）
    H5. 连续工作 <= 6天：不能连续安排超过6天的操作
    H6. 班次覆盖：同一天分配给同一人的操作必须能被某个班次覆盖
    
    软约束：
    S1. 跳过位置（缺员）：可配置罚分，默认 1000/位置
    S2. 共享人员：A和B共享时，重叠人数需 >= min(A需求, B需求)，不满足则罚分
    """
    
    name = "OperationAssignment"
    
    def __init__(self, model: cp_model.CpModel, context: SolverContext, variables: ModelVariables):
        super().__init__(model, context, variables)
        
        # 缓存：操作时间解析
        self._operation_times: Dict[int, Tuple[datetime, datetime]] = {}
        
        # 缓存：操作所在日期
        self._operation_dates: Dict[int, str] = {}
        
        # 共享组信息（从 batch_operation_constraints.share_personnel 构建）
        # 共享组ID -> [操作ID列表]
        self._share_groups: Dict[str, List[int]] = {}
        # 操作ID -> 共享组ID
        self._op_to_group: Dict[int, str] = {}
        
        # 缓存：操作对是否可以被同一班次覆盖
        self._shift_coverage_mutex: Set[Tuple[int, int]] = set()
        
        # ========== 性能优化数据结构 ==========
        # 区间索引：按日期分组的操作区间 (用于 O(n log n) 重叠检测)
        # date -> [(start_timestamp, end_timestamp, op_id)]  按 start 排序
        self._ops_by_date_sorted: Dict[str, List[Tuple[float, float, int]]] = {}
        
        # 时间重叠操作对：预计算的重叠操作对 (用于变量预过滤)
        self._overlapping_pairs: Set[Tuple[int, int]] = set()
        
        # 员工-日期冲突操作：预计算每个员工每天的冲突操作
        # (emp_id, date) -> Set[op_id]  该员工当天可能参与的所有操作
        self._employee_day_ops: Dict[Tuple[int, str], Set[int]] = {}
    
    def apply(self) -> None:
        """应用所有操作分配相关约束"""
        # 预处理
        self._parse_operation_times()
        self._build_interval_index()              # 🚀 优化: 构建区间索引
        self._precompute_overlapping_pairs()      # 🚀 优化: 预计算重叠操作对
        self._build_share_groups()
        self._precompute_shift_coverage_mutex()  # 预计算无法被同一班次覆盖的操作对
        self._identify_night_operations()       # 识别夜班操作
        
        # 步骤1: 为每个操作的每个位置创建分配变量
        self._create_assignment_variables()
        
        # 步骤2: 应用硬约束
        self._apply_position_constraints()      # H2: 每位置最多1人
        self._apply_same_operation_mutex()      # H3: 同操作不同位置互斥
        self._apply_time_conflict_constraints() # H4: 时间重叠互斥（非共享）
        self._apply_shift_coverage_constraints() # H6: 班次覆盖约束
        self._apply_night_rest_operation_constraints() # H7: 夜班后操作分配约束
        # 注意: 连续工作约束(H5)由 ConsecutiveWorkConstraint 模块统一处理
        
        # 步骤3: 应用软约束
        self._apply_sharing_soft_constraints()  # S2: 共享人员软约束
        
        # 步骤4: 记录分配信息供后续模块使用
        self._record_assignment_info()
        
        self.log_summary()
    
    def _parse_operation_times(self) -> None:
        """预解析所有操作的时间"""
        for op_id, op in self.context.operations.items():
            try:
                start = datetime.fromisoformat(op.planned_start.replace("Z", "+00:00"))
                end = datetime.fromisoformat(op.planned_end.replace("Z", "+00:00"))
                self._operation_times[op_id] = (start, end)
                self._operation_dates[op_id] = op.planned_start[:10]
            except Exception as e:
                logger.warning(f"[{self.name}] 无法解析操作 {op_id} 的时间: {e}")
    
    def _build_interval_index(self) -> None:
        """🚀 优化: 构建区间索引用于 O(n log n) 重叠检测
        
        将操作按日期分组，每组内按开始时间排序，便于使用扫描线算法。
        """
        for op_id, times in self._operation_times.items():
            if op_id in self.context.skipped_operations:
                continue
            
            start_dt, end_dt = times
            date_key = self._operation_dates.get(op_id)
            if not date_key:
                continue
            
            # 转换为时间戳便于比较
            start_ts = start_dt.timestamp()
            end_ts = end_dt.timestamp()
            
            if date_key not in self._ops_by_date_sorted:
                self._ops_by_date_sorted[date_key] = []
            self._ops_by_date_sorted[date_key].append((start_ts, end_ts, op_id))
        
        # 按开始时间排序
        for date_key in self._ops_by_date_sorted:
            self._ops_by_date_sorted[date_key].sort(key=lambda x: (x[0], x[1]))
        
        total_ops = sum(len(ops) for ops in self._ops_by_date_sorted.values())
        logger.info(f"[{self.name}] 🚀 区间索引: {len(self._ops_by_date_sorted)} 天, {total_ops} 个操作")
    
    def _precompute_overlapping_pairs(self) -> None:
        """🚀 优化: 使用扫描线算法预计算所有重叠操作对 O(n log n)
        
        比原来的 O(n²) 双重循环更高效。
        """
        overlap_count = 0
        
        for date_key, ops in self._ops_by_date_sorted.items():
            if len(ops) < 2:
                continue
            
            # 扫描线算法: 维护当前活跃区间
            # 按结束时间排序的优先队列 (end_ts, op_id)
            active_ends: List[Tuple[float, int]] = []
            
            for start_ts, end_ts, op_id in ops:
                # 移除已结束的区间 (使用二分查找加速)
                # 找到第一个结束时间 > start_ts 的位置
                cutoff_idx = bisect.bisect_right([e[0] for e in active_ends], start_ts)
                
                # 与所有未结束的活跃区间配对 (这些区间与当前区间重叠)
                for i in range(cutoff_idx, len(active_ends)):
                    other_op_id = active_ends[i][1]
                    pair = (min(op_id, other_op_id), max(op_id, other_op_id))
                    if pair not in self._overlapping_pairs:
                        self._overlapping_pairs.add(pair)
                        overlap_count += 1
                
                # 移除已完全结束的区间 (end_ts <= start_ts)
                active_ends = active_ends[cutoff_idx:]
                
                # 将当前区间加入活跃列表，保持按结束时间排序
                insert_pos = bisect.bisect_left([e[0] for e in active_ends], end_ts)
                active_ends.insert(insert_pos, (end_ts, op_id))
        
        logger.info(f"[{self.name}] 🚀 预计算重叠对: {overlap_count} 对 (扫描线算法)")
    
    def _build_share_groups(self) -> None:
        """构建共享组（从 context 获取）"""
        # 使用 context 中已构建的共享组信息
        self._share_groups = dict(self.context.share_groups)
        self._op_to_group = dict(self.context.operation_share_group)
        
        if self._share_groups:
            logger.info(f"[{self.name}] 共享组数量: {len(self._share_groups)}")
            for group_id, ops in self._share_groups.items():
                logger.debug(f"[{self.name}] 共享组 {group_id}: 操作 {ops}")
    
    def _precompute_shift_coverage_mutex(self) -> None:
        """预计算无法被同一班次覆盖的操作对
        
        检查两种情况：
        1. 同一天（按开始日期）的操作对
        2. 跨天操作（如夜班）与第二天操作的冲突
        
        注意：即使两个操作时间不重叠（如 17:00-21:00 和 21:00-09:00），
        如果它们无法被同一班次覆盖，也需要添加互斥约束。
        """
        # 按日期分组操作
        ops_by_date: Dict[str, List[int]] = {}
        for op_id, date_key in self._operation_dates.items():
            if op_id in self.context.skipped_operations:
                continue
            if date_key not in ops_by_date:
                ops_by_date[date_key] = []
            ops_by_date[date_key].append(op_id)
        
        mutex_count = 0
        adjacent_mutex_count = 0
        cross_day_mutex_count = 0
        
        # 情况1: 检查同一天的操作对
        for date_key, op_ids in ops_by_date.items():
            if len(op_ids) < 2:
                continue
            
            for i, op_id_a in enumerate(op_ids):
                for op_id_b in op_ids[i + 1:]:
                    if self._should_add_mutex(op_id_a, op_id_b, date_key):
                        mutex_count += 1
                        if self._are_adjacent(op_id_a, op_id_b):
                            adjacent_mutex_count += 1
        
        # 情况2: 检查跨天操作与第二天操作的冲突
        # 例如：12-24 夜班(21:00-09:00) 与 12-25 长白班(17:00-21:00)
        cross_day_ops = self._find_cross_day_operations()
        
        for op_id_cross, cross_date, next_date in cross_day_ops:
            # 获取第二天的所有操作
            next_day_ops = ops_by_date.get(next_date, [])
            
            for op_id_next in next_day_ops:
                if op_id_cross == op_id_next:
                    continue
                
                # 注意：不再跳过共享组！即使在同一共享组，
                # 如果时间上无法被同一班次覆盖，仍需添加互斥约束。
                # 共享组只意味着"允许同一人执行"，但前提是时间上可行。
                
                # 跨天操作和第二天操作不能分配给同一员工（除非有超长班次）
                # 因为跨天操作需要在第二天凌晨结束，员工无法再上第二天的班
                times_cross = self._operation_times.get(op_id_cross)
                times_next = self._operation_times.get(op_id_next)
                
                if times_cross and times_next:
                    cross_start, cross_end = times_cross
                    next_start, next_end = times_next
                    
                    # 检查跨天操作的结束时间是否与第二天操作有冲突
                    # 如果跨天操作在第二天结束（如09:00），而第二天操作在之后开始（如17:00）
                    # 理论上可以，但实际上一个班次无法覆盖两者
                    combined_start = min(cross_start, next_start)
                    combined_end = max(cross_end, next_end)
                    combined_hours = (combined_end - combined_start).total_seconds() / 3600
                    
                    # 如果合并时间超过14小时，一定无法被同一班次覆盖
                    if combined_hours > 14.0:
                        key = (min(op_id_cross, op_id_next), max(op_id_cross, op_id_next))
                        if key not in self._shift_coverage_mutex:
                            self._shift_coverage_mutex.add(key)
                            mutex_count += 1
                            cross_day_mutex_count += 1
                            logger.info(
                                f"[{self.name}] 跨天操作冲突: op_{op_id_cross}({cross_date}) 和 "
                                f"op_{op_id_next}({next_date}), 合并时长={combined_hours:.1f}h"
                            )
        
        if mutex_count > 0:
            logger.info(
                f"[{self.name}] 发现 {mutex_count} 对操作无法被同一班次覆盖 "
                f"(相邻: {adjacent_mutex_count}, 跨天: {cross_day_mutex_count})"
            )
    
    def _should_add_mutex(self, op_id_a: int, op_id_b: int, date_key: str) -> bool:
        """检查两个操作是否需要添加互斥约束
        
        注意：即使在同一共享组，如果无法被同一班次覆盖，仍需添加互斥！
        共享组只意味着"允许同一人执行"，但前提是时间上可行。
        """
        # 计算合并时间跨度
        combined_start, combined_end = self._get_combined_time_span(op_id_a, op_id_b)
        if combined_start is None:
            return False
        
        # 检查是否有班次能覆盖
        if not self._has_covering_shift(date_key, combined_start, combined_end):
            key = (min(op_id_a, op_id_b), max(op_id_a, op_id_b))
            if key not in self._shift_coverage_mutex:
                self._shift_coverage_mutex.add(key)
                return True
        
        return False
    
    def _are_adjacent(self, op_id_a: int, op_id_b: int) -> bool:
        """检查两个操作是否边界相接"""
        times_a = self._operation_times.get(op_id_a)
        times_b = self._operation_times.get(op_id_b)
        if not times_a or not times_b:
            return False
        
        _, end_a = times_a
        start_b, end_b = times_b
        start_a, _ = times_a
        
        return end_a == start_b or end_b == start_a
    
    def _find_cross_day_operations(self) -> List[Tuple[int, str, str]]:
        """找出所有跨天的操作
        
        Returns:
            List of (operation_id, start_date, end_date) tuples
        """
        cross_day_ops = []
        
        for op_id, times in self._operation_times.items():
            if op_id in self.context.skipped_operations:
                continue
            
            start_dt, end_dt = times
            start_date = start_dt.strftime("%Y-%m-%d")
            end_date = end_dt.strftime("%Y-%m-%d")
            
            # 如果结束日期不等于开始日期，说明是跨天操作
            if end_date != start_date:
                cross_day_ops.append((op_id, start_date, end_date))
        
        if cross_day_ops:
            logger.info(f"[{self.name}] 发现 {len(cross_day_ops)} 个跨天操作")
        
        return cross_day_ops
    
    def _get_combined_time_span(self, op_id_a: int, op_id_b: int) -> Tuple[Optional[datetime], Optional[datetime]]:
        """获取两个操作的合并时间跨度（最早开始 ~ 最晚结束）"""
        times_a = self._operation_times.get(op_id_a)
        times_b = self._operation_times.get(op_id_b)
        
        if not times_a or not times_b:
            return None, None
        
        start_a, end_a = times_a
        start_b, end_b = times_b
        
        combined_start = min(start_a, start_b)
        combined_end = max(end_a, end_b)
        
        return combined_start, combined_end
    
    def _has_covering_shift(self, date_key: str, span_start: datetime, span_end: datetime) -> bool:
        """检查是否有班次能覆盖指定的时间跨度
        
        注意：如果时间跨度超过合理的班次时长（如14小时），直接返回 False。
        """
        tolerance = self.context.config.shift_matching_tolerance_minutes
        
        # 计算需要覆盖的时间跨度（小时）
        span_duration_hours = (span_end - span_start).total_seconds() / 3600
        
        # 安全检查：如果时间跨度超过14小时，认为无法被单个班次覆盖
        # （即使有24小时班次定义，同时执行两个独立操作也不合理）
        MAX_REASONABLE_SHIFT_HOURS = 14.0
        if span_duration_hours > MAX_REASONABLE_SHIFT_HOURS:
            logger.debug(
                f"[{self.name}] 时间跨度 {span_duration_hours:.1f}h 超过 {MAX_REASONABLE_SHIFT_HOURS}h，"
                f"无法被单一班次覆盖"
            )
            return False
        
        for shift in self.context.shift_definitions:
            # 跳过休息班次
            if shift.nominal_hours == 0:
                continue
            if shift.shift_code and 'REST' in shift.shift_code.upper():
                continue
            
            # 解析班次时间
            st = shift.start_time if len(shift.start_time) >= 8 else f"{shift.start_time}:00"
            et = shift.end_time if len(shift.end_time) >= 8 else f"{shift.end_time}:00"
            
            try:
                shift_start = datetime.fromisoformat(f"{date_key}T{st}")
                shift_end = datetime.fromisoformat(f"{date_key}T{et}")
            except:
                continue
            
            # 处理跨天班次
            if shift.is_cross_day or shift_end <= shift_start:
                shift_end += timedelta(days=1)
            
            # 检查班次是否覆盖（含容差）
            start_ok = (shift_start - timedelta(minutes=tolerance)) <= span_start
            end_ok = (shift_end + timedelta(minutes=tolerance)) >= span_end
            
            if start_ok and end_ok:
                return True
        
        return False
    
    def _apply_shift_coverage_constraints(self) -> None:
        """H6: 应用班次覆盖约束
        
        禁止将无法被同一班次覆盖的操作对分配给同一员工
        """
        for op_id_a, op_id_b in self._shift_coverage_mutex:
            # 获取两个操作的公共候选员工
            candidates_a = self.variables.operation_candidates.get(op_id_a, [])
            
            for emp_id, var_a in candidates_a:
                var_b = self.variables.assignment_vars.get((op_id_b, emp_id))
                if var_b is not None:
                    # 硬约束：这两个操作不能同时分配给同一员工
                    self.model.Add(var_a + var_b <= 1)
                    self.constraints_added += 1
    
    def _apply_night_rest_operation_constraints(self) -> None:
        """H7: 夜班后操作分配约束（硬约束）
        
        如果员工被分配到夜班操作，则接下来 x 天内不能被分配到任何操作。
        
        这是在操作分配层面的约束，确保夜班后的休息规则在操作层面就被强制执行，
        而不是等到班次层面才检查（那样求解器可能会绕过约束）。
        
        注意：这里禁止的是所有操作，包括夜班操作，以防止连续夜班的情况。
        """
        if not self.context.config.enforce_night_rest:
            logger.info(f"[{self.name}] 夜班休息约束已禁用，跳过操作分配层面的夜班约束")
            return
        
        x = self.context.config.night_rest_hard_days  # 硬约束休息天数
        
        # 找出所有夜班操作
        night_ops = list(self._night_operations)
        if not night_ops:
            logger.info(f"[{self.name}] 无夜班操作，跳过夜班休息约束")
            return
        
        logger.info(f"[{self.name}] 应用夜班休息操作约束: {len(night_ops)} 个夜班操作, 休息天数={x}")
        
        constraints_added = 0
        
        # 按日期分组所有操作（包括夜班操作，用于禁止休息期内的任何操作分配）
        # 修复：之前只收集非夜班操作，导致连续夜班被允许
        all_ops_by_date: Dict[str, List[int]] = {}
        for op_id, date_key in self._operation_dates.items():
            if op_id in self.context.skipped_operations:
                continue
            if date_key not in all_ops_by_date:
                all_ops_by_date[date_key] = []
            all_ops_by_date[date_key].append(op_id)
        
        # 对每个夜班操作，禁止同一员工在接下来 x 天内被分配到任何操作
        for night_op_id in night_ops:
            night_date = self._operation_dates.get(night_op_id)
            if not night_date:
                continue
            
            # 获取夜班操作的候选员工
            night_candidates = self.variables.operation_candidates.get(night_op_id, [])
            if not night_candidates:
                continue
            
            # 计算需要休息的日期
            from datetime import datetime, timedelta
            night_date_dt = datetime.strptime(night_date, "%Y-%m-%d")
            
            for offset in range(1, x + 1):
                rest_date_dt = night_date_dt + timedelta(days=offset)
                rest_date = rest_date_dt.strftime("%Y-%m-%d")
                
                # 获取休息日的所有操作（包括夜班操作）
                rest_day_ops = all_ops_by_date.get(rest_date, [])
                
                for rest_op_id in rest_day_ops:
                    # 跳过自身
                    if rest_op_id == night_op_id:
                        continue
                    
                    # 检查是否在同一共享组（共享组内允许）
                    group_night = self._op_to_group.get(night_op_id)
                    group_rest = self._op_to_group.get(rest_op_id)
                    if group_night and group_night == group_rest:
                        logger.debug(f"[{self.name}] 跳过共享组内操作: {night_op_id}({night_date}) -> {rest_op_id}({rest_date})")
                        continue
                    
                    # 对每个公共候选员工添加互斥约束
                    for emp_id, night_var in night_candidates:
                        rest_var = self.variables.assignment_vars.get((rest_op_id, emp_id))
                        if rest_var is not None:
                            # 硬约束：如果分配到夜班操作，则休息日不能分配到任何操作
                            self.model.Add(night_var + rest_var <= 1)
                            constraints_added += 1
                            # 调试日志：记录关键约束
                            if night_op_id in [3781, 3783, 3785] or rest_op_id in [3781, 3783, 3785]:
                                logger.info(f"[{self.name}] 夜班约束: op_{night_op_id}({night_date}) + op_{rest_op_id}({rest_date}) <= 1 for emp_{emp_id}")
        
        logger.info(f"[{self.name}] 夜班休息操作约束: 添加 {constraints_added} 条约束")
        self.constraints_added += constraints_added
    
    def _create_assignment_variables(self) -> None:
        """为每个操作的每个位置创建分配变量
        
        🚀 优化: 预过滤掉因锁定冲突或时间冲突而必然无法分配的 (操作, 员工) 组合
        """
        # 🚀 优化: 预计算员工当天的锁定操作，用于预过滤
        emp_locked_ops_by_date: Dict[Tuple[int, str], Set[int]] = {}
        for op_id, locked_emps in self.context.locked_operations.items():
            date_key = self._operation_dates.get(op_id)
            if date_key:
                for emp_id in locked_emps:
                    key = (emp_id, date_key)
                    if key not in emp_locked_ops_by_date:
                        emp_locked_ops_by_date[key] = set()
                    emp_locked_ops_by_date[key].add(op_id)
        
        vars_created = 0
        vars_skipped_conflict = 0
        
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            required = op.required_people
            date_key = self._operation_dates.get(op_id, "")
            
            # 获取锁定的员工
            locked_employees = self.context.locked_operations.get(op_id, set())
            
            # 为锁定员工记录信息
            if locked_employees:
                self._record_locked_operations(op_id, op, locked_employees)
            
            # 为每个位置创建变量
            for pos_num in range(1, required + 1):
                pos_key = (op_id, pos_num)
                
                # 获取该位置的候选员工（已在 context 中按资质过滤）
                candidates = self.context.operation_position_candidates.get(pos_key, [])
                
                if not candidates:
                    logger.warning(f"[{self.name}] 操作 {op_id} 岗位 {pos_num} 无候选人（资质不匹配）")
                    # 创建松弛变量表示缺员
                    self._create_skip_penalty(op_id, pos_num)
                    continue
                
                # 为每个候选员工创建分配变量
                for emp_id in candidates:
                    if emp_id in locked_employees:
                        continue  # 锁定员工单独处理
                    
                    # 🚀 优化: 检查该员工当天是否已有锁定的、与当前操作冲突的操作
                    emp_date_key = (emp_id, date_key)
                    if emp_date_key in emp_locked_ops_by_date:
                        locked_ops_today = emp_locked_ops_by_date[emp_date_key]
                        has_conflict = False
                        for locked_op_id in locked_ops_today:
                            if locked_op_id == op_id:
                                continue
                            pair = (min(op_id, locked_op_id), max(op_id, locked_op_id))
                            if pair in self._overlapping_pairs:
                                # 该员工已锁定到与当前操作冲突的操作，跳过
                                has_conflict = True
                                break
                        if has_conflict:
                            vars_skipped_conflict += 1
                            continue
                    
                    # 位置分配变量
                    var = self.model.NewBoolVar(f"assign_{op_id}_pos{pos_num}_{emp_id}")
                    self.variables.position_assignment_vars[(op_id, pos_num, emp_id)] = var
                    vars_created += 1
                    
                    # 存储到 position_candidates
                    if pos_key not in self.variables.position_candidates:
                        self.variables.position_candidates[pos_key] = []
                    self.variables.position_candidates[pos_key].append((emp_id, var))
                    
                    # 创建聚合变量（员工是否被分配到该操作的任意位置）
                    if (op_id, emp_id) not in self.variables.assignment_vars:
                        agg_var = self.model.NewBoolVar(f"assign_{op_id}_{emp_id}")
                        self.variables.assignment_vars[(op_id, emp_id)] = agg_var
                        
                        # 记录到 operation_candidates
                        if op_id not in self.variables.operation_candidates:
                            self.variables.operation_candidates[op_id] = []
                        self.variables.operation_candidates[op_id].append((emp_id, agg_var))
                        
                        # 🚀 优化: 记录员工-日期-操作映射，用于后续约束
                        if emp_date_key not in self._employee_day_ops:
                            self._employee_day_ops[emp_date_key] = set()
                        self._employee_day_ops[emp_date_key].add(op_id)
        
        if vars_skipped_conflict > 0:
            logger.info(f"[{self.name}] 🚀 变量预过滤: 创建 {vars_created} 个变量, 跳过 {vars_skipped_conflict} 个冲突变量")
    
    def _create_skip_penalty(self, op_id: int, pos_num: int) -> None:
        """为无法分配的位置创建跳过惩罚"""
        penalty = self.context.config.skip_position_penalty
        
        # 创建一个恒为1的变量表示该位置被跳过
        skip_var = self.model.NewConstant(1)
        
        # 添加到惩罚项
        self.variables.add_penalty("skip_position", skip_var)
        
        # 添加到 skip_vars（用于分层求解的覆盖率统计）
        self.variables.skip_vars[(op_id, pos_num)] = skip_var
        
        logger.info(f"[{self.name}] 操作 {op_id} 岗位 {pos_num} 无候选人，添加跳过惩罚 {penalty}")
    
    def _apply_position_constraints(self) -> None:
        """H2: 每个位置最多分配1人（使用松弛变量允许缺员）"""
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            required = op.required_people
            locked_count = len(self.context.locked_operations.get(op_id, set()))
            
            for pos_num in range(1, required + 1):
                pos_key = (op_id, pos_num)
                pos_vars = self.variables.position_candidates.get(pos_key, [])
                
                if not pos_vars:
                    continue  # 已在创建变量时处理
                
                var_list = [v for _, v in pos_vars]
                
                # 创建松弛变量（缺员）
                slack_var = self.model.NewBoolVar(f"slack_{op_id}_pos{pos_num}")
                
                # 约束：分配人数 + 缺员 == 1
                self.model.Add(sum(var_list) + slack_var == 1)
                self.constraints_added += 1
                
                # 松弛变量添加到惩罚
                self.variables.add_penalty("skip_position", slack_var)
                
                # 添加到 skip_vars（用于分层求解的覆盖率统计）
                self.variables.skip_vars[(op_id, pos_num)] = slack_var
                
                # 记录到 slack_vars（兼容）
                if op_id not in self.variables.slack_vars:
                    self.variables.slack_vars[op_id] = (slack_var, 1, len(pos_vars))
    
    def _apply_same_operation_mutex(self) -> None:
        """H3: 同一员工不能在同一操作的多个位置
        
        同时负责将聚合变量 (agg_var) 与位置变量正确链接，
        确保约束使用的变量与求解器实际使用的变量一致。
        """
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            required = op.required_people
            
            # 收集每个员工在该操作各位置的变量
            emp_positions: Dict[int, List[Tuple[int, cp_model.IntVar]]] = {}
            
            for pos_num in range(1, required + 1):
                pos_key = (op_id, pos_num)
                for emp_id, var in self.variables.position_candidates.get(pos_key, []):
                    if emp_id not in emp_positions:
                        emp_positions[emp_id] = []
                    emp_positions[emp_id].append((pos_num, var))
            
            # 处理每个候选员工
            for emp_id, positions in emp_positions.items():
                agg_var = self.variables.assignment_vars.get((op_id, emp_id))
                if agg_var is None:
                    continue
                
                if len(positions) == 1:
                    # 只有一个位置：直接链接 agg_var = pos_var
                    # 修复：之前这部分代码在 required <= 1 时会被跳过
                    pos_var = positions[0][1]
                    self.model.Add(agg_var == pos_var)
                else:
                    # 多个位置：约束 + 链接
                    vars_for_emp = [v for _, v in positions]
                    
                    # 硬约束：最多只能在一个位置
                    self.model.Add(sum(vars_for_emp) <= 1)
                    self.constraints_added += 1
                    
                    # 链接聚合变量：agg_var = max(position_vars)
                    self.model.AddMaxEquality(agg_var, vars_for_emp)
    
    def _apply_time_conflict_constraints(self) -> None:
        """H4: 同一人不能在时间重叠的不同操作
        
        🚀 优化: 使用预计算的 _overlapping_pairs 而不是 O(n²) 循环
        
        share_mode 行为:
        - SAME_TEAM: 共享组内允许同一人执行重叠操作（如果班次可覆盖）
        - DIFFERENT: 共享组内强制不同人执行（添加互斥约束）
        """
        constraint_count = 0
        skipped_share_group = 0
        different_mode_count = 0
        
        # 🚀 优化: 直接遍历预计算的重叠对，而不是 O(n²) 循环
        for op_id_a, op_id_b in self._overlapping_pairs:
            # 检查是否在同一共享组
            group_a = self._op_to_group.get(op_id_a)
            group_b = self._op_to_group.get(op_id_b)
            is_same_share_group = group_a and group_a == group_b
            
            if is_same_share_group:
                # 检查共享组模式
                group_mode = self.context.share_group_mode.get(group_a, 'SAME_TEAM')
                
                if group_mode == 'DIFFERENT':
                    # DIFFERENT 模式：必须不同人执行，强制添加互斥约束
                    added = self._add_conflict_constraint(op_id_a, op_id_b)
                    constraint_count += added
                    different_mode_count += 1
                else:
                    # SAME_TEAM 模式：需要额外检查是否能被同一班次覆盖
                    key = (min(op_id_a, op_id_b), max(op_id_a, op_id_b))
                    if key in self._shift_coverage_mutex:
                        # 无法被同一班次覆盖，仍需添加互斥约束
                        added = self._add_conflict_constraint(op_id_a, op_id_b)
                        constraint_count += added
                    else:
                        # 共享组内允许同一人执行
                        skipped_share_group += 1
            else:
                # 非共享组，时间冲突则禁止
                added = self._add_conflict_constraint(op_id_a, op_id_b)
                constraint_count += added
        
        logger.info(
            f"[{self.name}] 🚀 时间冲突检测: {len(self._overlapping_pairs)} 对重叠操作, "
            f"添加 {constraint_count} 条互斥约束, 共享组跳过 {skipped_share_group} 对, "
            f"DIFFERENT模式互斥 {different_mode_count} 对"
        )
    
    def _check_time_overlap(self, op_id_a: int, op_id_b: int) -> bool:
        """检查两个操作是否时间重叠（有任何交集即重叠）
        
        注意：边界相接（如 A结束于21:00，B开始于21:00）不算重叠，
        但这种情况会被 _apply_shift_coverage_constraints 处理。
        """
        times_a = self._operation_times.get(op_id_a)
        times_b = self._operation_times.get(op_id_b)
        
        if not times_a or not times_b:
            return False
        
        start_a, end_a = times_a
        start_b, end_b = times_b
        
        # 有任何交集即为重叠（严格重叠，边界相接不算）
        return not (end_a <= start_b or end_b <= start_a)
    
    def _add_conflict_constraint(self, op_id_a: int, op_id_b: int) -> int:
        """添加时间冲突约束
        
        Returns:
            添加的约束数量
        """
        candidates_a = self.variables.operation_candidates.get(op_id_a, [])
        added = 0
        
        for emp_id, var_a in candidates_a:
            var_b = self.variables.assignment_vars.get((op_id_b, emp_id))
            if var_b is not None:
                # 硬约束：两个操作不能同时分配
                self.model.Add(var_a + var_b <= 1)
                self.constraints_added += 1
                added += 1
        
        return added
    
    
    def _apply_sharing_soft_constraints(self) -> None:
        """S2: 共享人员软约束
        
        A(n人) 和 B(m人) 共享时，重叠人数需 >= min(n, m)
        不满足则按差额罚分
        """
        penalty_per_person = self.context.config.sharing_violation_penalty
        
        for group_id, member_ops in self._share_groups.items():
            if len(member_ops) < 2:
                continue
            
            # 跳过被跳过的操作
            valid_ops = [op_id for op_id in member_ops 
                        if op_id not in self.context.skipped_operations]
            
            if len(valid_ops) < 2:
                continue
            
            # 对共享组内的每对操作应用软约束
            for i, op_id_a in enumerate(valid_ops):
                for op_id_b in valid_ops[i + 1:]:
                    self._apply_sharing_pair_constraint(op_id_a, op_id_b, penalty_per_person)
    
    def _apply_sharing_pair_constraint(
        self, op_id_a: int, op_id_b: int, penalty: int
    ) -> None:
        """对一对共享操作应用软约束
        
        要求：重叠人数 >= min(A需求, B需求)
        """
        op_a = self.context.operations.get(op_id_a)
        op_b = self.context.operations.get(op_id_b)
        
        if not op_a or not op_b:
            return
        
        required_overlap = min(op_a.required_people, op_b.required_people)
            
        # 收集两个操作的公共候选人
        candidates_a = set(emp_id for emp_id, _ in 
                         self.variables.operation_candidates.get(op_id_a, []))
        candidates_b = set(emp_id for emp_id, _ in 
                         self.variables.operation_candidates.get(op_id_b, []))
        
        common_candidates = candidates_a & candidates_b
        
        if len(common_candidates) < required_overlap:
            # 公共候选人不足，无法满足共享要求
            logger.warning(
                f"[{self.name}] 共享组操作 {op_id_a} 和 {op_id_b} "
                f"公共候选人不足（需要 {required_overlap}，只有 {len(common_candidates)}）"
            )
            return
        
        # 创建重叠计数变量
        overlap_vars = []
        for emp_id in common_candidates:
            var_a = self.variables.assignment_vars.get((op_id_a, emp_id))
            var_b = self.variables.assignment_vars.get((op_id_b, emp_id))
            
            if var_a is not None and var_b is not None:
                # 创建一个变量表示该员工同时被分配到两个操作
                both_var = self.model.NewBoolVar(f"both_{op_id_a}_{op_id_b}_{emp_id}")
                self.model.AddMinEquality(both_var, [var_a, var_b])
                overlap_vars.append(both_var)
        
        if not overlap_vars:
            return
        
        # 软约束：重叠人数 >= required_overlap
        # 使用松弛变量处理
        overlap_sum = sum(overlap_vars)
        
        # 创建差额变量（0 到 required_overlap）
        shortfall = self.model.NewIntVar(0, required_overlap, 
                                         f"share_shortfall_{op_id_a}_{op_id_b}")
        
        # 约束：overlap_sum + shortfall >= required_overlap
        self.model.Add(overlap_sum + shortfall >= required_overlap)
        self.constraints_added += 1
        
        # 差额添加到惩罚
        self.variables.add_penalty("sharing_violation", shortfall)
        
        logger.debug(
            f"[{self.name}] 共享约束: 操作 {op_id_a} 和 {op_id_b} "
            f"需要 {required_overlap} 人重叠"
        )
    
    def _record_locked_operations(self, op_id: int, op, locked_employees: Set[int]) -> None:
        """记录锁定员工的操作信息"""
        date_key = op.planned_start[:10]
        duration_minutes = op.planned_duration_minutes
        shift_minutes = self._get_shift_minutes(op)
        
        for emp_id in locked_employees:
            key = (emp_id, date_key)
            
            if key not in self.variables.employee_day_operations:
                self.variables.employee_day_operations[key] = []
            
            # 锁定的操作使用固定值 1
            self.variables.employee_day_operations[key].append((duration_minutes, 1))
            
            # 标记当天有工作
            if key not in self.variables.day_has_work:
                self.variables.day_has_work[key] = self.model.NewBoolVar(f"has_work_{emp_id}_{date_key}")
            self.model.Add(self.variables.day_has_work[key] == 1)
            
            # 标记夜班
            if self._is_night_shift_operation(op):
                if key not in self.variables.day_is_night:
                    self.variables.day_is_night[key] = self.model.NewBoolVar(f"is_night_{emp_id}_{date_key}")
                self.model.Add(self.variables.day_is_night[key] == 1)
    
    def _record_assignment_info(self) -> None:
        """记录分配信息供后续模块使用"""
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            date_key = op.planned_start[:10]
            duration_minutes = op.planned_duration_minutes
            shift_minutes = self._get_shift_minutes(op)
            
            self.variables.operation_shift_minutes[op_id] = shift_minutes
            
            # 为每个候选员工记录
            for emp_id, agg_var in self.variables.operation_candidates.get(op_id, []):
                key = (emp_id, date_key)
                
                if key not in self.variables.employee_day_operations:
                    self.variables.employee_day_operations[key] = []
                
                self.variables.employee_day_operations[key].append((duration_minutes, agg_var))
                
                # 确保 day_has_work 已创建并链接
                if key not in self.variables.day_has_work:
                    day_has_work = self.model.NewBoolVar(f"has_work_{emp_id}_{date_key}")
                    self.variables.day_has_work[key] = day_has_work
                
                # 如果有操作被分配，则当天有工作
                self.model.Add(self.variables.day_has_work[key] >= agg_var)
                
                # 标记夜班
                if self._is_night_shift_operation(op):
                    if key not in self.variables.day_is_night:
                        self.variables.day_is_night[key] = self.model.NewBoolVar(f"is_night_{emp_id}_{date_key}")
                    self.model.Add(self.variables.day_is_night[key] >= agg_var)
    
    def _get_shift_minutes(self, op) -> int:
        """获取能覆盖操作时间的最短班次折算工时（分钟）"""
        times = self._operation_times.get(op.operation_plan_id)
        if not times:
            return 480  # 默认8小时
        
        start, end = times
        date_key = op.planned_start[:10]
        tolerance = self.context.config.shift_matching_tolerance_minutes
        
        best_shift = None
        best_hours = float('inf')
        
        for shift in self.context.shift_definitions:
            st = shift.start_time if len(shift.start_time) >= 8 else f"{shift.start_time}:00"
            et = shift.end_time if len(shift.end_time) >= 8 else f"{shift.end_time}:00"
            
            try:
                shift_start = datetime.fromisoformat(f"{date_key}T{st}")
                shift_end = datetime.fromisoformat(f"{date_key}T{et}")
            except:
                continue
            
            if shift.is_cross_day or shift_end <= shift_start:
                shift_end += timedelta(days=1)
            
            start_ok = (shift_start - timedelta(minutes=tolerance)) <= start
            end_ok = (shift_end + timedelta(minutes=tolerance)) >= end
            
            if start_ok and end_ok and shift.nominal_hours < best_hours:
                best_hours = shift.nominal_hours
                best_shift = shift
        
        if best_shift:
            return int(best_shift.nominal_hours * 60)
        
        return 480
    
    def _is_night_shift_operation(self, op) -> bool:
        """判断操作是否为夜班
        
        使用两种方法判断：
        1. 基于操作开始时间：20:00后开始的操作为夜班操作
        2. 基于班次匹配：如果能匹配到夜班班次定义，则为夜班操作
        
        修复：之前的逻辑只返回第一个匹配班次的 is_night_shift，
        导致 LONGDAY 班次（08:30-21:00）先匹配，夜班操作被错误判定为非夜班。
        """
        times = self._operation_times.get(op.operation_plan_id)
        if not times:
            return False
        
        start, end = times
        date_key = op.planned_start[:10]
        
        # 方法1：基于操作开始时间判断
        # 如果操作在20:00后开始，视为夜班操作
        start_hour = start.hour
        if start_hour >= 20:  # 20:00 及以后开始的操作
            return True
        
        # 方法2：基于操作是否跨天判断
        # 如果操作结束时间在第二天（跨天操作），视为夜班操作
        if end.date() > start.date():
            return True
        
        # 方法3：基于班次匹配判断（优先匹配夜班班次）
        tolerance = self.context.config.shift_matching_tolerance_minutes
        
        matching_shifts = []
        for shift in self.context.shift_definitions:
            st = shift.start_time if len(shift.start_time) >= 8 else f"{shift.start_time}:00"
            et = shift.end_time if len(shift.end_time) >= 8 else f"{shift.end_time}:00"
            
            try:
                shift_start = datetime.fromisoformat(f"{date_key}T{st}")
                shift_end = datetime.fromisoformat(f"{date_key}T{et}")
            except:
                continue
            
            if shift.is_cross_day or shift_end <= shift_start:
                shift_end += timedelta(days=1)
            
            start_ok = (shift_start - timedelta(minutes=tolerance)) <= start
            end_ok = (shift_end + timedelta(minutes=tolerance)) >= end
            
            if start_ok and end_ok:
                matching_shifts.append(shift)
        
        # 如果有匹配的班次，优先选择夜班班次
        for shift in matching_shifts:
            if shift.is_night_shift:
                return True
        
        return False
    
    def _identify_night_operations(self) -> None:
        """识别所有夜班操作并缓存"""
        self._night_operations: Set[int] = set()
        
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            if self._is_night_shift_operation(op):
                self._night_operations.add(op_id)
        
        if self._night_operations:
            logger.info(f"[{self.name}] 识别到 {len(self._night_operations)} 个夜班操作")
    
