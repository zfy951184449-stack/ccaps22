"""
V3 求解器上下文

承载求解过程中的所有状态和预处理数据。
"""

from dataclasses import dataclass, field
from typing import Dict, Set, List, Tuple, Optional, Any
from datetime import datetime

from contracts.request import SolverRequest, OperationData, EmployeeData
from utils.shift_classifier import ShiftClassifier


@dataclass
class SolverContext:
    """
    求解器上下文
    
    包含:
    - 原始请求数据
    - 预处理后的索引
    - 冲突表
    - 变量引用
    - 班次分类器
    """
    
    # 原始请求
    request: SolverRequest = None
    
    # === 索引结构 (预处理后) ===
    
    # 操作索引: operation_id -> OperationData
    operation_by_id: Dict[int, OperationData] = field(default_factory=dict)
    
    # 员工索引: employee_id -> EmployeeData
    employee_by_id: Dict[int, EmployeeData] = field(default_factory=dict)
    
    # 按日期分组的操作: date_str -> [operation_ids]
    operations_by_date: Dict[str, List[int]] = field(default_factory=dict)
    
    # 员工资质索引: qualification_id -> [employee_ids]
    employees_by_qualification: Dict[int, Set[int]] = field(default_factory=dict)
    
    # 操作的合格员工: operation_id -> [employee_ids]
    qualified_employees: Dict[int, Set[int]] = field(default_factory=dict)
    
    # === 冲突表 (O(1) 查询) ===
    
    # 时间冲突: operation_id -> {conflicting_operation_ids}
    time_conflict_map: Dict[int, Set[int]] = field(default_factory=dict)
    
    # 共享组映射: operation_id -> share_group_id
    share_group_of_operation: Dict[int, Optional[int]] = field(default_factory=dict)
    
    # 共享组成员: share_group_id -> [operation_ids]
    operations_in_share_group: Dict[int, List[int]] = field(default_factory=dict)
    
    # === 员工不可用 ===
    
    # 员工不可用日期: employee_id -> {date_str}
    employee_unavailable_dates: Dict[int, Set[str]] = field(default_factory=dict)
    
    # === 日历信息 ===
    
    # 工作日集合: {date_str}
    workdays: Set[str] = field(default_factory=set)
    
    # 非工作日集合: {date_str}
    non_workdays: Set[str] = field(default_factory=set)
    
    # === 班次信息 ===
    
    # 班次分类器
    shift_classifier: Optional[ShiftClassifier] = None
    
    # 操作 -> 班次类型 ID 缓存
    operation_shift_map: Dict[int, Optional[int]] = field(default_factory=dict)
    
    # 夜班 ID 集合 (保留供兼容)
    night_shift_ids: Set[int] = field(default_factory=set)
    
    # 长白班 ID 集合 (保留供兼容)
    day_shift_ids: Set[int] = field(default_factory=set)
    
    # === CP-SAT 变量引用 (在 engine.py 中填充) ===
    
    # 分配变量: (operation_id, position, employee_id) -> BoolVar
    assignment_vars: Dict[Tuple[int, int, int], Any] = field(default_factory=dict)
    
    # 跳过变量: (operation_id, position) -> BoolVar (是否跳过该岗位)
    skip_vars: Dict[Tuple[int, int], Any] = field(default_factory=dict)
    
    # 班次变量: (employee_id, date_str, shift_id) -> BoolVar
    shift_vars: Dict[Tuple[int, str, int], Any] = field(default_factory=dict)
    
    @classmethod
    def from_request(cls, request: SolverRequest) -> 'SolverContext':
        """从请求构建上下文"""
        ctx = cls(request=request)
        ctx._build_indices()
        ctx._build_conflict_table()
        ctx._build_availability()
        ctx._build_calendar()
        ctx._build_shift_info()
        return ctx
    
    def _build_indices(self):
        """构建基础索引"""
        from utils.logger import debug
        
        # 操作索引
        for op in self.request.operations:
            self.operation_by_id[op.id] = op
            
            # 按日期分组
            # 使用新的稳健解析逻辑
            start_dt = self._parse_datetime(op.planned_start)
            if start_dt:
                date_str = start_dt.strftime('%Y-%m-%d')
                if date_str not in self.operations_by_date:
                    self.operations_by_date[date_str] = []
                self.operations_by_date[date_str].append(op.id)
        
        # 员工索引
        for emp in self.request.employees:
            self.employee_by_id[emp.id] = emp
            
            # 资质索引
            for qual_id in emp.qualifications:
                if qual_id not in self.employees_by_qualification:
                    self.employees_by_qualification[qual_id] = set()
                self.employees_by_qualification[qual_id].add(emp.id)
        
        # 构建操作的合格员工
        for op in self.request.operations:
            qualified = set(e.id for e in self.request.employees)
            
            # 如果操作需要特定资质，则过滤
            if op.required_qualifications:
                for qual_id in op.required_qualifications:
                    qualified &= self.employees_by_qualification.get(qual_id, set())
            
            self.qualified_employees[op.id] = qualified
        
        debug(f"构建索引完成: {len(self.operation_by_id)} 操作, {len(self.employee_by_id)} 员工")
    
    def _build_conflict_table(self):
        """构建时间冲突表 O(n²) 预处理，O(1) 查询"""
        from utils.logger import debug
        
        operations = list(self.request.operations)
        
        for i, op1 in enumerate(operations):
            if op1.id not in self.time_conflict_map:
                self.time_conflict_map[op1.id] = set()
            
            for op2 in operations[i+1:]:
                # 检查时间是否重叠
                if self._time_overlap(op1, op2):
                    # 检查是否在同一共享组 (同组不算冲突)
                    if op1.share_group_id and op1.share_group_id == op2.share_group_id:
                        continue
                    
                    # 互相添加冲突
                    self.time_conflict_map[op1.id].add(op2.id)
                    if op2.id not in self.time_conflict_map:
                        self.time_conflict_map[op2.id] = set()
                    self.time_conflict_map[op2.id].add(op1.id)
        
        # 共享组映射
        for sg in self.request.share_groups:
            self.operations_in_share_group[sg.id] = sg.operation_ids
            for op_id in sg.operation_ids:
                self.share_group_of_operation[op_id] = sg.id
        
        total_conflicts = sum(len(v) for v in self.time_conflict_map.values()) // 2
        debug(f"构建冲突表完成: {total_conflicts} 对冲突")
    
    def _time_overlap(self, op1: OperationData, op2: OperationData) -> bool:
        """检查两个操作时间是否重叠"""
        # 处理时间格式
        start1 = self._parse_datetime(op1.planned_start)
        end1 = self._parse_datetime(op1.planned_end)
        start2 = self._parse_datetime(op2.planned_start)
        end2 = self._parse_datetime(op2.planned_end)
        
        if not all([start1, end1, start2, end2]):
            return False
        
        return start1 < end2 and start2 < end1
    
    def _parse_datetime(self, value) -> Optional[datetime]:
        """
        解析多种格式的日期时间字符串 (Robust ISO Parsing)
        支持:
        - ISO 标准: 2023-01-01T12:00:00+08:00
        - 无偏移: 2023-01-01T12:00:00
        - 带 'Z': 2023-01-01T12:00:00Z
        - 带毫秒: 2023-01-01T12:00:00.123456
        """
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            # 去除可能的空白
            s = value.strip()
            
            # 1. 尝试直接 ISO 解析
            try:
                dt = datetime.fromisoformat(s)
                return dt
            except ValueError:
                pass
            
            # 2. 处理常见变体
            try:
                # 处理 Z 后缀 (Python < 3.11 可能不支持 Z)
                if s.endswith('Z'):
                    s = s[:-1] + '+00:00'
                
                # 处理毫秒过长 (Python只支持6位微秒)
                if '.' in s:
                    main_part, frac_part = s.split('.', 1)
                    # 查找是否有时区部分
                    tz_part = ''
                    if '+' in frac_part:
                        frac_part, tz_part = frac_part.split('+', 1)
                        tz_part = '+' + tz_part
                    elif '-' in frac_part:
                         # 简单的负时区假设，如果 frac部分很长则截断
                         pass
                    
                    if len(frac_part) > 6:
                        frac_part = frac_part[:6]
                    s = f"{main_part}.{frac_part}{tz_part}"
                
                return datetime.fromisoformat(s)
            except ValueError:
                pass
            
            # 3. 尝试其他常见格式 (如 MySQL 默认)
            try:
                return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass
                
        return None
    
    def _build_availability(self):
        """构建员工可用性索引"""
        from utils.logger import debug
        
        for emp in self.request.employees:
            self.employee_unavailable_dates[emp.id] = set()
            for period in emp.unavailable_periods:
                # 尝试解析日期
                start_str = period.get('start_date')
                end_str = period.get('end_date')
                
                # 简单实现：只记录开始日期作为不可用
                # TODO: 完整展开日期范围
                if start_str:
                    self.employee_unavailable_dates[emp.id].add(str(start_str)[:10])
                if end_str:
                    self.employee_unavailable_dates[emp.id].add(str(end_str)[:10])
        
        debug(f"构建可用性索引完成")
    
    def _build_calendar(self):
        """构建日历信息"""
        from utils.logger import debug
        
        for cd in self.request.calendar_days:
            if cd.is_workday:
                self.workdays.add(cd.date)
            else:
                self.non_workdays.add(cd.date)
        
        debug(f"构建日历信息完成: {len(self.workdays)} 工作日, {len(self.non_workdays)} 非工作日")
    
    def _build_shift_info(self):
        """构建班次信息，初始化 ShiftClassifier"""
        from utils.logger import debug
        
        # 1. 初始化班次分类器
        self.shift_classifier = ShiftClassifier(self.request.shift_types)
        
        # 2. 为所有操作预分类
        for op in self.request.operations:
            shift_id = self.shift_classifier.classify(op)
            self.operation_shift_map[op.id] = shift_id
        
        # 3. 兼容旧集合 (night_shift_ids / day_shift_ids)
        for st in self.request.shift_types:
            if st.is_night_shift:
                self.night_shift_ids.add(st.id)
            else:
                if st.work_hours > 8:
                    self.day_shift_ids.add(st.id)
        
        debug(f"构建班次信息完成: 分类器初始化，{len(self.night_shift_ids)} 夜班, {len(self.day_shift_ids)} 长白班")
    
    def get_conflicts_for(self, operation_id: int) -> Set[int]:
        """获取与指定操作冲突的所有操作 ID"""
        return self.time_conflict_map.get(operation_id, set())
    
    def is_employee_qualified(self, operation_id: int, employee_id: int) -> bool:
        """检查员工是否有资格执行操作"""
        return employee_id in self.qualified_employees.get(operation_id, set())
    
    def is_employee_available(self, employee_id: int, date_str: str) -> bool:
        """检查员工在指定日期是否可用"""
        return date_str not in self.employee_unavailable_dates.get(employee_id, set())

    def get_op_shift_type(self, operation_id: int) -> Optional[int]:
        """获取操作所属的班次类型 ID"""
        return self.operation_shift_map.get(operation_id)
