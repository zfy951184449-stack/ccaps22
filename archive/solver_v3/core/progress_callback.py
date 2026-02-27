"""
V3 求解器进度回调

实现求解过程中的进度报告、取消检查和指标收集。
"""

from typing import Callable, Optional, Dict, Any
from ortools.sat.python import cp_model
from utils.logger import info, debug


class SolutionCallback(cp_model.CpSolverSolutionCallback):
    """
    求解回调类
    
    功能:
    1. 收集找到的解数量
    2. 报告当前最优目标值
    3. 检查取消标志
    4. 定期推送进度更新
    """
    
    def __init__(
        self,
        cancel_checker: Optional[Callable[[], bool]] = None,
        progress_reporter: Optional[Callable[[Dict[str, Any]], None]] = None,
        assignment_vars: Dict = None,
        context = None,
    ):
        super().__init__()
        self.cancel_checker = cancel_checker
        self.progress_reporter = progress_reporter
        self.assignment_vars = assignment_vars or {}
        self.context = context
        
        # 统计
        self.solutions_found = 0
        self.best_objective = None
        self.start_time = None
        self._cancelled = False
        
    def on_solution_callback(self) -> None:
        """每找到一个解时调用"""
        self.solutions_found += 1
        current_objective = self.ObjectiveValue()
        
        # 更新最优解
        if self.best_objective is None or current_objective < self.best_objective:
            self.best_objective = current_objective
        
        debug(f"[回调] 找到第 {self.solutions_found} 个解, 目标值: {current_objective}")
        
        # 检查取消
        if self.cancel_checker and self.cancel_checker():
            info("[回调] 检测到取消请求，停止求解")
            self._cancelled = True
            self.StopSearch()
            return
        
        # 报告进度
        if self.progress_reporter:
            # 计算进度 (基于时间)
            limit = self.context.request.config.time_limit_seconds
            elapsed = self.WallTime()
            progress = min(99, int((elapsed / limit) * 100)) if limit > 0 else 0
            
            metrics = self._calculate_metrics()
            self.progress_reporter({
                "progress": progress,
                "solutions_found": self.solutions_found,
                "best_objective": self.best_objective,
                "metrics": metrics,
            })
    
    def _calculate_metrics(self) -> Dict[str, Any]:
        """计算实时指标"""
        metrics = {
            "hard_constraint_satisfaction": 100,  # 如果有解,则满足所有硬约束
            "understaffed_operations": 0,
            "share_group_consistency": 100,
            "fairness_deviation": 0,
            "solutions_found": self.solutions_found,
        }
        
        if not self.context or not self.assignment_vars:
            return metrics
        
        try:
            # 1. 统计缺员操作数
            understaffed = 0
            emp_hours = {emp.id: 0 for emp in self.context.request.employees}
            
            # 缓存当前解的分配情况: op_id -> [emp_ids]
            current_assignments = {}
            
            for op in self.context.request.operations:
                assigned_emps = []
                for pos in range(op.required_people):
                    for emp in self.context.request.employees:
                        var_key = (op.id, pos, emp.id)
                        if var_key in self.assignment_vars:
                            if self.Value(self.assignment_vars[var_key]):
                                assigned_emps.append(emp.id)
                                emp_hours[emp.id] += op.duration_minutes / 60.0
                
                current_assignments[op.id] = assigned_emps
                if len(assigned_emps) < op.required_people:
                    understaffed += 1
            
            metrics["understaffed_operations"] = understaffed
            
            # 2. 计算公平性偏差 (工时标准差)
            hours_values = list(emp_hours.values())
            if hours_values:
                avg_hours = sum(hours_values) / len(hours_values)
                variance = sum((h - avg_hours) ** 2 for h in hours_values) / len(hours_values)
                std_dev = variance ** 0.5
                metrics["fairness_deviation"] = round(std_dev, 2)
            
            # 3. 计算共享组一致性
            # 定义: (1 - 违规组数 / 总有效组数) * 100
            # 违规: 子操作人员不是主操作人员的子集
            total_groups = 0
            consistent_groups = 0
            
            for sg in self.context.request.share_groups:
                if len(sg.operation_ids) < 2:
                    continue
                
                ops_in_group = [
                    self.context.operation_by_id.get(oid) 
                    for oid in sg.operation_ids 
                    if oid in self.context.operation_by_id
                ]
                
                if not ops_in_group:
                    continue
                    
                total_groups += 1
                
                # 找出最大的操作作为主操作
                ops_in_group.sort(key=lambda x: x.required_people, reverse=True)
                main_op = ops_in_group[0]
                main_personnel = set(current_assignments.get(main_op.id, []))
                
                is_consistent = True
                for sub_op in ops_in_group[1:]:
                    sub_personnel = set(current_assignments.get(sub_op.id, []))
                    if not sub_personnel.issubset(main_personnel):
                        is_consistent = False
                        break
                
                if is_consistent:
                    consistent_groups += 1
            
            if total_groups > 0:
                metrics["share_group_consistency"] = int((consistent_groups / total_groups) * 100)
            else:
                metrics["share_group_consistency"] = 100
            
        except Exception as e:
            debug(f"[回调] 计算指标失败: {e}")
        
        return metrics
    
    @property
    def is_cancelled(self) -> bool:
        return self._cancelled


class ProgressTracker:
    """
    进度追踪器
    
    负责将进度信息写入数据库供前端轮询/SSE读取
    """
    
    def __init__(self, run_id: Optional[int] = None, db_writer: Optional[Callable] = None):
        self.run_id = run_id
        self.db_writer = db_writer
        self.last_update_time = 0
        self.min_update_interval = 0.5  # 最小更新间隔 (秒)
    
    def update(self, data: Dict[str, Any]) -> None:
        """更新进度到数据库"""
        import time
        
        current_time = time.time()
        if current_time - self.last_update_time < self.min_update_interval:
            return  # 限制更新频率
        
        self.last_update_time = current_time
        
        if self.db_writer and self.run_id:
            try:
                self.db_writer(self.run_id, data)
            except Exception as e:
                debug(f"[进度追踪] 写入失败: {e}")
