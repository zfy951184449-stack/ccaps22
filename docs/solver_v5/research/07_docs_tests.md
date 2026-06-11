# V5 求解器研究报告：文档与测试资产盘点

**报告目的**：为V5求解器从零实现提供业务需求清单、现有测试资产、门禁扩展指南。  
**面向读者**：将要从零构建V5求解器的工程师。  
**编写日期**：2026-06-11

---

## 一、业务原则清单（V5 必须遵守的硬约束）

### 1.1 工时管理约束
**来源**：`docs/scheduling_principles.md`

| 约束项 | 规则 | 强度 | V5注意事项 |
|--------|------|------|----------|
| **季度工时** | 必须 ≥ 季度标准工时 | 硬约束 | 不能向下打破；需要跨季度工时累积逻辑 |
| **月度工时** | 必须在标准±8小时范围内 | 软约束+容差 | 容差可由前端 `REACT_APP_MONTH_TOLERANCE_HOURS` 配置；默认8小时 |

**V5 重点**：与V4的 `StandardHoursConstraint`（`solver_v4/constraints/standard_hours.py`）等价，但需要区分为两层（季度/月度）目标处理。

### 1.2 夜班管理
**来源**：`docs/scheduling_principles.md`

| 规则 | 实现细节 | V5 关键路径 |
|------|---------|-----------|
| **夜班定义** | shift_code 包含 "NIGHT" 或 runtime ≥19:00 或跨日 | `ShiftDefinition.is_night_shift` bool 字段；在 `contracts/request.py` 中已标准化 |
| **夜班后休息** | 至少2天连续休息；禁止仅休1天再排班 | `NightShiftConstraint`（`solver_v4/constraints/night_shift.py`）覆盖三项：夜班后休息、禁止孤立、夜班时间间隔 |
| **夜班识别来源** | 1) 班次编码  2) 运行时段  3) 标称工时 | V5需在数据组装阶段（如后端 `DataAssemblerV4.ts`）三重验证，防止漏判 |

### 1.3 补班与法定假期管理
**来源**：`docs/scheduling_principles.md`

| 类型 | 规则 | V5 处理 |
|------|------|--------|
| **补班可选日** | 不限工作日，可在普通周末排班 | 约束上无特殊限制；但需要日历标记（`CalendarDay.is_workday`） |
| **法定节假日** | 三倍工资日需单独管控和成本计算 | 日历标记 `CalendarDay.is_triple_salary=True`；目标函数需权重化处理法定节假日成本 |

**V5关键**：约束层基本不变（就是排班），但目标层（objectives）需新增或扩展法定假日成本权重。

### 1.4 休息日连续性
**来源**：`docs/scheduling_principles.md`

规则：在有条件情况下，休息日应连续，避免碎片化；夜班后优先保证连续两天休息。

**V5实现**：
- 不需新约束，但在目标函数中可加软目标：`minimize_fragmented_rest` (低权重)
- 已有 `ConsecutiveDaysConstraint` 处理最大连续工作日/休息日边界
- `ConsecutiveWorkRestPatternConstraint` 默认关闭，但可用于强制"夜班+2天休息"的连续模式

### 1.5 独立值班任务与临时任务
**来源**：`docs/scheduling_principles.md`

三种任务类型定义（V4已支持，V5需保持）：

```python
# 来自 solver_v4/contracts/request.py
class OperationDemand:
    scheduling_mode: str = "FIXED"        # "FIXED" | "FLEXIBLE"
    source_type: str = "BATCH"            # "BATCH" | "STANDALONE"
    earliest_start: Optional[str] = None  # FLEXIBLE 模式
    deadline: Optional[str] = None        # FLEXIBLE 模式
```

| 任务类型 | 特征 | V5需求 |
|---------|------|--------|
| **AD_HOC（临时值班）** | 明确 start/end 时间、fixed 需求人数；工时由差值计算 | 使用 `scheduling_mode="FIXED"` + `planned_start/end`；无需推断窗口 |
| **FLEXIBLE（弹性）** | 开始日期、截止日期、需求人数和工时；Solver 在窗口内选择班次 | `scheduling_mode="FLEXIBLE"` + `earliest_start/deadline`；Solver在时间窗内自由排班 |
| **RECURRING（周期）** | 只用于维护模板；临时任务创建后直接进本月，不入模板 | 临时任务 `source_type="STANDALONE"`；模板管理不在Solver范围 |

**V5关键设计**：约束层需能区分这三种模式，特别是FLEXIBLE任务需要时间窗约束（在`FlexibleSchedulingConstraint`中）。

---

## 二、核心业务数据契约

### 2.1 请求与响应数据结构（Solver Interface）
**源文件**：`solver_v4/contracts/request.py`（行1-250）

#### 输入约束（SolverRequest）
```python
@dataclass
class SolverRequest:
    request_id: str                                  # 幂等性key
    window: Dict[str, str]                          # {'start_date', 'end_date'} ISO格式
    operation_demands: List[OperationDemand]        # 工序需求
    employee_profiles: List[EmployeeProfile]        # 员工资质+不可用期
    calendar: List[CalendarDay]                     # 日历标记(工作日/法假)
    shift_definitions: List[ShiftDefinition]        # 班次定义
    shared_preferences: List[SharedPreference]      # 团队共享约束
    special_shift_requirements: List[...]           # 特殊值班（独立）
    locked_operations: List[LockedOperation]        # 锁定工序指派
    locked_shifts: List[LockedShift]                # 锁定班次指派
    historical_shifts: List[HistoricalShift]        # 历史数据（边界约束用）
    frozen_shifts: List[FrozenShift]                # 求解范围外班次快照
    frozen_assignments: List[FrozenAssignment]      # 求解范围外指派快照
    config: Optional[Dict[str, Any]]                # 约束开关+时间参数
```

**V5继承建议**：保持这个结构，但需要明确 `solve_range` vs `window` 的语义：
- `window`：完整规划周期（例如整个月）
- `solve_range`：Solver实际优化子区间（例如月内第1-2周，其他周冻结）
- `frozen_shifts/frozen_assignments`：用于边界值衔接

#### 关键类型说明

**OperationDemand** (行16-34)
```python
operation_plan_id: int           # DB主键（非工序业务ID）
batch_id, batch_code: int, str  # 所属批次
operation_id, operation_name: int, str  # 业务ID+名称
planned_start, planned_end: str  # ISO 8601 UTC格式（重要：已UTC化）
planned_duration_minutes: int    # 建议字段（可由start/end推算）
required_people: int             # 需求人数
position_qualifications: List[PositionQualification]  # 岗位×资质×候选人
scheduling_mode: str = "FIXED"   # FIXED | FLEXIBLE
source_type: str = "BATCH"       # BATCH | STANDALONE
```

**PositionQualification** (行10-13)
```python
position_number: int             # 岗位序号（1,2,3...）
qualifications: List[Dict]       # [{"qualification_id", "min_level", "is_mandatory"}]
candidate_employee_ids: List[int] # 预筛选候选人（来自后端DataAssembler）
```

**EmployeeProfile** (行37-44)
```python
employee_id, employee_code, employee_name
qualifications: List[Dict]       # [{"qualification_id", "level"}]
unavailable_periods: List[Dict]  # [{"start_datetime", "end_datetime"}] ISO 8601
org_role: str = "FRONTLINE"      # FRONTLINE | SHIFT_LEADER | GROUP_LEADER | ... (待核实是否已弃用)
```

**ShiftDefinition** (行73-81)
```python
shift_id: int
shift_code, shift_name: str
start_time, end_time: str        # HH:MM格式（不含日期，单日重复）
nominal_hours: float             # 计薪工时（可≠end-start，因有不计薪休息）
is_night_shift: bool             # V4已标准化；V5需保持
plan_category: str = "STANDARD"  # STANDARD | SPECIAL | TEMPORARY
```

**SharedPreference** (行84-88)
```python
share_group_id: int
share_group_name: str
members: List[Dict]              # [{"operation_plan_id", "required_people"}]
share_mode: str = "SAME_TEAM"    # 一个成员=多个工序须同一班次的固定人员
```

**LockedOperation** (行91-93)
```python
operation_plan_id: int           # 被锁定的工序
enforced_employee_ids: List[int] # 强制指派的员工ID
```

**SpecialShiftRequirement** (行47-59)
```python
occurrence_id: int               # 特殊值班的实例ID
window_id: int                   # 所属时间窗（待明确用途）
date: str                        # ISO格式日期
shift_id: int                    # 班次ID
required_people: int
eligible_employee_ids: List[int]
fulfillment_mode: str = "HARD"   # HARD | SOFT（缺人是否infeasible）
priority_level: str = "HIGH"     # 目标函数权重提示
candidates: List[SpecialShiftCandidate]  # 带impact_cost
plan_category: str = "BASE"      # 用于工作/休息分类
```

**V5需要扩展的字段**（建议）：
- `OperationDemand.preferred_shift_ids`：指定偏好班次（已在V4中）
- `LockedShift.shift_id`：显式锁定班次ID（已有）
- `HistoricalShift`：边界条件（连续工作日计数）- **V5必读**

### 2.2 输出响应结构
**源**：`solver_v4/core/solver.py` + `backend/src/controllers/schedulingV4/` 推断

期望的 result_summary 结构（V5需保持向后兼容）：
```python
{
    "status": "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "MODEL_INVALID",
    "message": str,
    "solve_time_seconds": float,
    "gap": float,
    "metrics": {
        "total_assignments": int,
        "total_vacancies": int,
        "night_shift_count": int,
        "total_hours": float,
        ...
    },
    "shift_schedule": [
        {
            "employee_id": int,
            "date": str,
            "shift_id": int,
            "shift_code": str,
            "shift_name": str,
            "shift_nominal_hours": float,
            "plan_category": str,
        },
        ...
    ],
    "assignments": [
        {
            "operation_plan_id": int,
            "position_number": int,
            "employee_id": int,
            "employee_code": str,
            ...
        },
        ...
    ],
    "vacancies": [
        {
            "operation_plan_id": int,
            "position_number": int,
            "required_people": int,
            "unfilled_count": int,
        },
        ...
    ],
    "special_shift_assignments": [
        {
            "occurrence_id": int,
            "employee_id": int,
            "date": str,
            "shift_id": int,
        },
        ...
    ],
    "special_shift_shortages": [
        {
            "occurrence_id": int,
            "shortage_people": int,
        },
        ...
    ],
}
```

---

## 三、约束模块清单与V5复用性分析

### 3.1 约束注册表与应用顺序
**源文件**：`solver_v4/constraints/registry.py`

V4的约束分两阶段应用：

#### Phase 1：核心约束（不依赖班次分配）
```python
CORE_CONSTRAINTS = [
    FrozenRangeConstraint,        # 求解范围外的班次/指派冻结 [可复用] ✅
    ShareGroupConstraint,         # 团队共享（需同一班次的人员） [可复用] ✅
    UniqueEmployeeConstraint,     # 同一员工不可同时多个工序 [可复用] ✅
    LockedOperationsConstraint,   # 强制指派员工到工序 [可复用] ✅
    OnePositionConstraint,        # 同一岗位只选一人 [可复用] ✅
    EmployeeAvailabilityConstraint, # 不可用期排斥 [可复用] ✅
]
```

#### Phase 2：班次依赖约束
```python
SHIFT_CONSTRAINTS = [
    LockedShiftsConstraint,                      # 强制班次 [可复用] ✅
    ShiftAssignmentConstraint,                   # 工序必须被班次覆盖 [需检视] ⚠️
    LeadershipCoverageConstraint,                # 领导参与生产三态 [可复用] ✅
    FlexibleSchedulingConstraint,                # FLEXIBLE任务的时间窗 [可复用] ✅
    ConsecutiveDaysConstraint,                   # 连续工作日+边界 [可复用，需扩展历史边界] ⚠️
    StandardHoursConstraint,                     # 月度/季度工时 [可复用，需分层] ⚠️
    NightShiftConstraint,                        # 夜班后休息+禁孤立+时间间隔 [可复用，逻辑复杂，需复审] ⚠️
    SpecialShiftJointCoverageConstraint,         # 特殊值班覆盖（HARD/SOFT） [可复用] ✅
    PreferStandardShiftConstraint,               # 偏好非SPECIAL班次 [可复用] ✅
    ConsecutiveWorkRestPatternConstraint,        # 强制"N天工作+M天休息"模式 [可选，默认OFF] ✅
]
```

### 3.2 每个约束的V5可复用性评估

| 约束模块 | 文件位置 | 可复用性 | 风险/改进项 | V5行动 |
|---------|---------|---------|----------|--------|
| **FrozenRangeConstraint** | constraints/frozen_range.py | ✅ 直接复用 | 无 | 保持不变 |
| **ShareGroupConstraint** | constraints/share_group.py | ✅ 直接复用 | 行396-412: Union-Find合并传递share group；逻辑健全但复杂 | 完整复用；新增单测确保transitivity |
| **UniqueEmployeeConstraint** | constraints/unique_employee.py | ✅ 直接复用 | ShareGroup豁免逻辑已修复（commit cc3428d）；需注意时间重叠检测 | 完整复用；复审时间重叠逻辑 |
| **LockedOperationsConstraint** | constraints/locked_operations.py | ✅ 直接复用 | 简单强制约束；无特殊边界 | 保持不变 |
| **OnePositionConstraint** | constraints/one_position.py | ✅ 直接复用 | 无 | 保持不变 |
| **EmployeeAvailabilityConstraint** | constraints/employee_availability.py | ✅ 直接复用 | unavailable_periods 格式须为ISO 8601；检查边界 | 保持不变；文档化时间格式要求 |
| **LockedShiftsConstraint** | constraints/locked_shifts.py | ✅ 直接复用 | 日期格式须ISO；shift_id 可选（plan_category='WORK'时需推断） | 保持不变；明确WORK类别的shift_id处理 |
| **ShiftAssignmentConstraint** | constraints/shift_assignment.py | ⚠️ 需检视 | 核心逻辑：工序时间范围⊆班次时间范围；跨日班次计算复杂，需考虑UTC偏移 | V5需复审时区处理；建议标准化为UTC或确定时区 |
| **LeadershipCoverageConstraint** | constraints/leadership_coverage.py | ✅ 直接复用 | 三态开关（allow/soft/ban）；需前端配置支持 | 保持；配置开关已在前端 SolverConfigurationModal.tsx |
| **FlexibleSchedulingConstraint** | constraints/flexible_scheduling.py | ✅ 直接复用 | FLEXIBLE任务需earliest_start/deadline；时间窗内班次选择 | 保持；确保FLEXIBLE任务始终有候选班次 |
| **ConsecutiveDaysConstraint** | constraints/consecutive_days.py | ⚠️ 需扩展 | 已覆盖：max consecutive work days + boundary check；需增强：跨solve_range边界的历史工作日计数 | V5需实现边界传入（HistoricalShift.consecutive_work_days） |
| **StandardHoursConstraint** | constraints/standard_hours.py | ⚠️ 需分层 | V4仅实现月度；业务需求新增季度约束；目标函数层面需分权 | V5需拆成两层：月度+季度；考虑soft vs hard |
| **NightShiftConstraint** | constraints/night_shift.py | ⚠️ 复杂，需复审 | 三项约束：(1) 夜班后休息天数 (2) 禁孤立夜班 (3) 夜班时间间隔；联合逻辑易误，V4经过审计修复 | V5需逐一复审三项约束的时间计算；补充边界测试 |
| **SpecialShiftJointCoverageConstraint** | constraints/special_shift_joint_coverage.py | ✅ 直接复用 | HARD vs SOFT mode；impact_cost目标权重 | 保持；确保SOFT模式下返回shortages |
| **PreferStandardShiftConstraint** | constraints/prefer_standard_shift.py | ✅ 直接复用 | 低优先级目标；阻止SPECIAL班次如非必要 | 保持 |
| **ConsecutiveWorkRestPatternConstraint** | constraints/consecutive_work_rest_pattern.py | ✅ 可选 | 默认关闭；强制"N天工+M天休"模式；可用于特定业务场景 | 可选启用；不强制要求 |

### 3.3 V4 单元测试及其 V5 适用性

**源文件**：`solver_v4/tests/`

#### 测试文件一览

| 测试文件 | 覆盖约束 | 关键场景 | V5复用建议 |
|---------|---------|---------|-----------|
| **test_shift_assignment.py** (231行) | ShiftAssignmentConstraint | • 日班覆盖<br>• 跨日夜班<br>• 班次间隙无覆盖→INFEASIBLE<br>• 空闲工作允许 | 复用；补充UTC偏移测试 |
| **test_share_group.py** (417行) | ShareGroupConstraint + UniqueEmployeeConstraint | • 同队相同(equal)<br>• 子集(subset)<br>• 自动禁用非候选人<br>• 重叠豁免<br>• **传递性(transitivity)** — Run 1266 bug修复 | **必读**；transitive share group 测试(行316-412)体现Union-Find合并；V5需保持此逻辑 |
| **test_locked_constraints.py** (199行) | LockedOperationsConstraint + LockedShiftsConstraint | • 锁定工序强制员工<br>• 非候选→INFEASIBLE<br>• 锁定班次强制指派 | 直接复用 |
| **test_config_toggles.py** (66行) | 约束开关(enable_xxx) | 验证约束可被config禁用 | V5需实现相同开关机制 |
| **test_special_shift_joint_coverage.py** (168行) | SpecialShiftJointCoverageConstraint | • SOFT缺人返回部分方案<br>• HARD缺人→INFEASIBLE<br>• impact_cost目标权重 | 直接复用 |
| **test_callback_auth.py** (78行) | APICallback鉴权 | 验证solver→backend回调带 `X-Solver-Callback-Token` header | 不涉及约束；V5保持回调机制 |

**总计**：7个测试文件，覆盖13个约束的60%，主要缺失：
- StandardHoursConstraint 边界测试
- NightShiftConstraint 三项约束的独立验证
- ConsecutiveDaysConstraint 跨边界历史工作日计数

**V5建议**：复用所有现有测试，补充上述3项缺失测试。

### 3.4 Verify 脚本清单（端到端验证）
**源文件**：`solver_v4/verify_*.py`（9个脚本）

| 脚本 | 验证内容 | 类型 | V5参考价值 |
|------|--------|------|----------|
| verify_shift.py | ShiftAssignmentConstraint（日班/夜班覆盖） | HTTP POST | 验证覆盖逻辑；复用场景 |
| verify_night_rest.py | NightShiftConstraint（夜班后休息） | SDK集成 | 复用场景；补充更多边界测试 |
| verify_sharegroup.py | ShareGroupConstraint（同队约束） | HTTP POST | 复用场景 |
| verify_unique.py | UniqueEmployeeConstraint（工序互斥） | HTTP POST | 复用场景 |
| verify_one_pos.py | OnePositionConstraint（岗位唯一） | HTTP POST | 复用场景 |
| verify_availability.py | EmployeeAvailabilityConstraint（不可用期） | HTTP POST | 复用场景 |
| verify_work_days.py | ConsecutiveDaysConstraint（最大连续工作日） | HTTP POST | 复用场景；补充边界测试 |
| verify_work_days_boundary.py | 跨solve_range的历史工作日边界 | HTTP POST | **关键**；V5需新增或改进 |
| verify_night_shift_interval.py | NightShiftConstraint（夜班时间间隔） | HTTP POST | 复用场景 |

**V5建议**：逐一复用这些脚本的测试场景，整合到自动化测试套件中（unittest或pytest）。

---

## 四、现有测试资产的V5迁移计划

### 4.1 unittest 框架（V4现状）
**特点**：
- 使用Python标准库 `unittest`（非pytest）
- 运行方式：`cd solver_v4 && python3 -m unittest tests.test_xxx`
- 单体测试：直接构造 `cp_model.CpModel()` + `SolverContext`，无需后端
- 集成验证脚本（verify_*.py）需要活跃的solver服务（HTTP POST）

### 4.2 门禁管道（verify_v4_archive.sh）
**源文件**：`scripts/verify_v4_archive.sh`（62行）

当前6步门禁流程：

```bash
# [1/6] 后端构建
cd backend && npm run build

# [2/6] 前端构建
cd frontend && CI=false npm run build

# [3/6] Solver 模块编译检查
python3 -m compileall solver_v4/{contracts,core,constraints}

# [4/6] 单元测试（关键）
python3 -m unittest \
    tests.test_shift_assignment \
    tests.test_share_group \
    tests.test_locked_constraints

# [5/6] 保护性断言（guardrails）
# • locked_operations 在 DataAssemblerV4.ts 和 request.py 中存在
# • locked_shifts 在 DataAssemblerV4.ts 和 request.py 中存在
# • shift_plan_id 在 applyResultController.ts 中被检查
# • 禁止硬编码 'BASE' plan_category
# • enable_locked_operations/locked_shifts 在前端配置中暴露

# [6/6] 人工评审提示（关键知识）
- 锁定行必须在cleanup/upsert中保留
- shift_plan_id 是班次关联的真实来源
- result_summary 向后兼容
- 前端V4应公开锁定保留的行为反馈
```

### 4.3 V5 门禁扩展建议

新增测试步骤（在[4/6]处）：

```bash
# [4a/6] 新增：V5约束单元测试
python3 -m unittest \
    tests.test_shift_assignment \
    tests.test_share_group \
    tests.test_locked_constraints \
    tests.test_consecutive_days_boundary \    # 新增
    tests.test_standard_hours_monthly \       # 新增
    tests.test_standard_hours_quarterly \     # 新增
    tests.test_night_shift_comprehensive \    # 拆分：三项独立验证
    tests.test_config_toggles \               # 保留
    tests.test_special_shift_joint_coverage \ # 保留
    tests.test_callback_auth                  # 保留

# [4b/6] 新增：集成验证脚本执行（需活跃solver服务）
# 仅在CI环境中，如果START_SOLVER_FOR_TESTS=1
if [ "$START_SOLVER_FOR_TESTS" = "1" ]; then
  python3 verify_shift.py || echo "⚠️ Verify script requires live solver"
  python3 verify_night_rest.py || true
  python3 verify_sharegroup.py || true
  python3 verify_work_days_boundary.py || true
fi
```

新增保护性断言（在[5/6]处）：

```bash
# [5/6] 扩展保护性断言

# 检查 V5 专有字段
rg -n "HistoricalShift|solve_range|frozen_shifts" \
  "$ROOT_DIR/solver_v5/contracts/request.py" >/dev/null || \
  (echo "❌ V5 requires HistoricalShift and solve_range support" && exit 1)

# 检查标准工时分层实现
rg -n "quarterly.*hours|monthly.*hours" \
  "$ROOT_DIR/solver_v5/constraints/standard_hours.py" >/dev/null || \
  (echo "⚠️ StandardHours should support quarterly and monthly tiers" && exit 1)

# 检查夜班约束三项独立
rg -n "night_rest|night_isolated|night_interval" \
  "$ROOT_DIR/solver_v5/constraints/night_shift.py" >/dev/null || \
  (echo "⚠️ NightShift should document three sub-constraints" && exit 1)
```

---

## 五、数据组装与时间处理的关键注意事项

### 5.1 时间格式标准化
**源**：V4的 `utils/time_utils.py` 和后端 `DataAssemblerV4.ts`

**当前V4约定**：
- 请求端：ISO 8601 UTC 格式（例如 `"2023-10-27T09:00:00Z"`）
- 请求内：不混用本地时间，统一转为UTC
- Solver内部：Unix timestamp（秒）用于时间计算（见 `combine_date_time_to_unix`）
- 响应端：ISO 8601 本地日期（例如 `"2023-10-27"`）+ 班次时间（例如 `"08:00"`）

**V5必须**：
1. 后端严格UTC化所有 `planned_start/planned_end`
2. shift `start_time/end_time` 为 HH:MM 单日格式（不含日期）
3. 班次覆盖判断需考虑**跨日夜班**：例如夜班 22:00-06:00 跨两个日期
4. 响应中班次日期应与求解日期保持一致（冻结点日期也需保持）

**V5建议**：补充时区说明文档（例如亚洲/上海）；在请求契约中显式 `timezone` 字段。

### 5.2 历史工作日边界与 HistoricalShift
**源**：`contracts/request.py` 行118-124

```python
@dataclass
class HistoricalShift:
    employee_id: int
    date: str                           # 历史日期（window_start 之前）
    is_work: bool                       # 是否上班（PRODUCTION/BASE）
    is_night: bool                      # 是否夜班
    consecutive_work_days: int = 0      # 截止该日期的连续工作天数
    consecutive_rest_days: int = 0      # 截止该日期的连续休息天数
```

**使用场景**：
- Solver 需知道员工在 window_start 之前的连续工作日计数，以便约束 `ConsecutiveDaysConstraint` 检查跨边界的最大工作日限制
- 例：员工在 window_start 前已连续工作4天，window内规划再加2天，总计6天需检查是否超过limit

**V5实现注意**：
- 后端 `DataAssemblerV4.ts` 需查询历史班次表，计算并填充 `consecutive_work_days`
- Solver `ConsecutiveDaysConstraint` 需读取此字段，累加window内排班天数，校验总和 ≤ limit
- 对称地处理 `consecutive_rest_days`（休息日边界）

---

## 六、V5 专有需求分析

### 6.1 从V4到V5的业务增量

基于CLAUDE.md中的pending decisions和最近commits：

| 需求项 | V4状态 | V5需求 | 优先级 |
|--------|--------|--------|--------|
| **季度工时分层** | 仅月度约束 | 新增季度约束 + 目标平衡 | P1 |
| **法定假期成本权重** | 日历标记存在，目标无 | 目标函数新增法定假权重 | P1 |
| **边界历史工作日** | 基础框架存在 | 需完整实现跨边界计数 | P2 |
| **领导参与三态** | 已实现 | 保持（LeadershipCoverageConstraint） | P0 |
| **共享组传递性** | 已修复(Run 1266) | 保持Union-Find合并逻辑 | P0 |
| **特殊值班impact_cost** | 已实现(SOFT/HARD) | 保持 | P0 |
| **FLEXIBLE任务时间窗** | 已实现 | 保持 | P0 |
| **资源约束（预留）** | 数据结构存在，约束未实装 | 考虑时间 | P3 |
| **维护窗口(maintenance_windows)** | 数据结构存在，约束未实装 | 考虑时间 | P3 |

### 6.2 V5 必读的关键决策日志
**源**：`docs/pending-decisions.md`（不存在，建议参考memory）

从MEMORY.md提及：
- `leader-ops-policy-three-state.md`：领导参与生产的三态开关（allow/soft/ban）
- `batch-day0-vs-planned-start-date.md`：Day0与planned_start_date的语义（需确认UTC转换）
- `standalone-task-vacancy-switches.md`：独立任务空缺开关的config透传（需确保Solver消费）

---

## 七、综合V5实现路线图

### 7.1 核心模块复用（无改动）
✅ 直接复用，无需修改：
- FrozenRangeConstraint
- LockedOperationsConstraint
- OnePositionConstraint
- EmployeeAvailabilityConstraint
- LockedShiftsConstraint
- LeadershipCoverageConstraint
- FlexibleSchedulingConstraint
- SpecialShiftJointCoverageConstraint
- PreferStandardShiftConstraint
- ConsecutiveWorkRestPatternConstraint
- UniqueEmployeeConstraint（已修复pass-through豁免）
- ShareGroupConstraint（已修复传递性）

### 7.2 核心模块改进（需复审或扩展）
⚠️ 需要检视或功能扩展：
- **ShiftAssignmentConstraint**：复审UTC偏移和跨日班次逻辑
- **ConsecutiveDaysConstraint**：实现历史工作日边界累加
- **StandardHoursConstraint**：拆分月度+季度两层约束
- **NightShiftConstraint**：三项约束独立复审（夜班后休息/禁孤立/时间间隔）

### 7.3 新增约束（可选）
💡 V5可考虑但非强制：
- `QuarterlyHoursConstraint`：季度工时约束
- `FragmentedRestMinimizer`：软目标 - 减少碎片化休息
- `LegalHolidayObjective`：法定假期成本目标加权
- `ResourceConstraint`：资源可用性约束（预留数据结构已有）

### 7.4 测试补充计划
📝 新增单元测试：
- `test_consecutive_days_boundary.py`：跨边界历史工作日
- `test_standard_hours_monthly.py`：月度工时约束
- `test_standard_hours_quarterly.py`：季度工时约束
- `test_night_shift_rest.py`：夜班后休息独立验证
- `test_night_shift_isolated.py`：禁孤立夜班独立验证
- `test_night_shift_interval.py`：夜班时间间隔独立验证

### 7.5 门禁更新计划
🚀 扩展 `verify_v5_archive.sh`：
- 增加V5专有字段检查（HistoricalShift, solve_range）
- 集成新增的单元测试（6项）
- 可选：启用集成验证脚本（需活跃solver服务）
- 扩展guardrail检查（季度工时、法定假期处理）

---

## 八、已知风险与踩坑清单

### 8.1 时间计算地雷
⚠️ **跨日班次与UTC偏移**
- **症状**：员工排班日期与操作时间不符
- **原因**：班次 22:00-06:00 跨午夜，需判断操作时间落在前一日还是后一日的班次
- **修复**：ShiftAssignmentConstraint 需显式处理 `start_time < end_time` 的非跨日班次，以及跨日班次的两段时间段
- **V5必验证**：test_shift_assignment.py 的 test_cross_day_night_shift

### 8.2 共享组传递性漏洞（已修复）
⚠️ **Run 1266 Bug（已修复，但V5需保持）**
- **症状**：三个工序通过两条shared_preferences链接（Op1↔Op2, Op2↔Op3），V4错误计算导致INFEASIBLE
- **原因**：字典遍历顺序使Op2被后处理的group覆盖，导致Op1和Op3分属不同group，UniqueEmployee约束冲突
- **修复**：ShareGroupConstraint 使用 Union-Find（并查集）合并所有共享工序到同一canonical group ID
- **V5必读**：test_share_group.py 的 test_transitive_share_group_overlap（行316-412），确保Union-Find逻辑完整复用

### 8.3 约束开关透传问题
⚠️ **Config字段未被Solver消费**
- **症状**：前端配置了约束开关（例如 `enable_share_group=False`），但Solver无视该配置
- **原因**：后端 DataAssemblerV4 未读取/透传config；或Solver registry未实现 `default_enabled` + config检查
- **修复**：每个约束模块的 `apply()` 需检查 `ctx.config.get('enable_xxx', default_enabled)` 并提前return
- **V5必验证**：test_config_toggles.py，确保所有约束都尊重config开关

### 8.4 历史工作日计数未实装
⚠️ **边界约束不完整**
- **症状**：员工在window外已排班，window内再加班导致超过连续工作日上限，但Solver未检查
- **原因**：ConsecutiveDaysConstraint 仅处理window内累计，未累加历史计数
- **修复**：后端需填充 `HistoricalShift.consecutive_work_days`；Solver需在初始化约束时读取并累加
- **V5必做**：实现 test_consecutive_days_boundary.py

### 8.5 Standard Hours 分层缺失
⚠️ **仅实现月度，未实现季度**
- **症状**：无法约束员工季度总工时 ≥ 季度标准（只能约束月度）
- **原因**：V4 StandardHoursConstraint 逻辑基于月份分组
- **修复**：拆分为 `MonthlyHoursConstraint` + `QuarterlyHoursConstraint`；可考虑合并为参数化的 `StandardHoursConstraint(scope='MONTHLY'|'QUARTERLY')`
- **V5必做**：补充 test_standard_hours_quarterly.py；在目标函数中平衡两层约束

### 8.6 法定假期成本未加权
⚠️ **目标函数缺失法定假权重**
- **症状**：日历标记了法定假期（is_triple_salary=True），但Solver不优先避免
- **原因**：目标函数未包含法定假期成本项
- **修复**：在 `_build_objectives()` 中新增 `minimize_legal_holiday_cost()`，权重高于普通工时
- **V5必考虑**：新增 LegalHolidayObjective 模块或扩展 StandardHoursConstraint 的目标处理

### 8.7 夜班约束三项合一导致复杂性
⚠️ **NightShiftConstraint 逻辑复杂，易误判**
- **症状**：员工排班顺序或夜班时间间隔检查错误
- **原因**：三项约束（夜班后休息、禁孤立、时间间隔）在同一模块，时间计算互相影响
- **修复**：V5建议拆分为三个独立约束或至少补充详尽的单元测试
- **V5必做**：补充 test_night_shift_rest.py, test_night_shift_isolated.py, test_night_shift_interval.py

### 8.8 时区与Day0换算
⚠️ **UTC与本地时间转换**
- **症状**：批次的 Day0 定义与 planned_start_date 换算错误
- **原因**：数据库存的可能是本地时间，Solver期望UTC，转换逻辑分散
- **修复**：后端 DataAssemblerV4.ts 应统一转UTC，Solver应明确文档化输入时区
- **V5建议**：在 SolverRequest 中显式添加 `timezone: str = "Asia/Shanghai"` 字段，供前端和后端参考

---

## 九、总结与交接清单

### 9.1 V5 启动前的必读顺序
1. ✅ `docs/scheduling_principles.md` — 业务规则（1小时）
2. ✅ `AGENTS.md` — 架构与硬规则（30分钟）
3. ✅ `solver_v4/contracts/request.py` — 数据契约（1小时）
4. ✅ `solver_v4/constraints/registry.py` — 约束列表（20分钟）
5. ✅ `solver_v4/core/solver.py` — 求解流程（1.5小时）
6. ✅ `solver_v4/tests/` — 单元测试（2小时）
7. ✅ `scripts/verify_v4_archive.sh` — 门禁流程（30分钟）
8. ✅ 本报告第一至四部分（1.5小时）

**总计**：约8-9小时精读

### 9.2 复用资产清单

**可直接复用的文件**（≥90%可复用）：
```
solver_v4/
├── constraints/
│   ├── frozen_range.py ✅
│   ├── share_group.py ✅ (Union-Find逻辑已熟)
│   ├── unique_employee.py ✅
│   ├── locked_operations.py ✅
│   ├── one_position.py ✅
│   ├── employee_availability.py ✅
│   ├── locked_shifts.py ✅
│   ├── leadership_coverage.py ✅
│   ├── flexible_scheduling.py ✅
│   ├── special_shift_joint_coverage.py ✅
│   ├── prefer_standard_shift.py ✅
│   ├── consecutive_work_rest_pattern.py ✅
│   └── registry.py ✅ (更新约束列表即可)
├── core/
│   ├── index.py ✅
│   ├── context.py ✅
│   ├── callback.py ✅
│   ├── precheck.py ✅
│   └── solver.py ⚠️ (Phase结构可复用，但_handle_result需审视向后兼容)
├── contracts/
│   └── request.py ✅
├── utils/
│   ├── time_utils.py ✅
│   └── logger.py ✅
└── tests/
    ├── test_shift_assignment.py ✅ (复用+新增UTC测试)
    ├── test_share_group.py ✅
    ├── test_locked_constraints.py ✅
    ├── test_special_shift_joint_coverage.py ✅
    ├── test_config_toggles.py ✅
    └── test_callback_auth.py ✅
```

**需要改进的文件**（50-90%可复用）：
```
solver_v4/constraints/
├── shift_assignment.py ⚠️ (复审UTC和跨日逻辑)
├── consecutive_days.py ⚠️ (新增历史边界计数)
├── standard_hours.py ⚠️ (拆分月度+季度)
└── night_shift.py ⚠️ (三项独立复审)
```

**需要新建的文件**（P1和P2优先级）：
```
V5新增:
├── tests/
│   ├── test_consecutive_days_boundary.py (P2)
│   ├── test_standard_hours_monthly.py (P1)
│   ├── test_standard_hours_quarterly.py (P1)
│   ├── test_night_shift_rest.py (P2)
│   ├── test_night_shift_isolated.py (P2)
│   └── test_night_shift_interval.py (P2)
├── constraints/
│   ├── quarterly_hours.py (P1, 或合并到standard_hours)
│   └── legal_holiday_objective.py (P1, 或在objectives/中)
└── objectives/
    ├── minimize_legal_holiday_cost.py (P1)
    └── minimize_fragmented_rest.py (P3, 可选)
```

### 9.3 交接文档与验收标准

**V5 MVP验收标准**：
- [ ] 所有V4 unittest 通过（无修改）
- [ ] 新增6项边界和分层测试通过
- [ ] verify_v5_archive.sh 门禁流程完成（修改后的脚本）
- [ ] 季度工时约束与月度并行运作
- [ ] 历史工作日边界计数正确
- [ ] 夜班约束三项独立验证通过
- [ ] 法定假期成本在目标函数中体现

**交接文档**：
- [ ] `docs/solver_v5/architecture.md` — V5架构说明
- [ ] `docs/solver_v5/constraint_modules.md` — 每个约束的详细说明
- [ ] `docs/solver_v5/data_contracts.md` — 请求/响应契约（复制+注解V4的）
- [ ] `docs/solver_v5/implementation_guide.md` — 逐步实现指南
- [ ] `docs/solver_v5/testing_strategy.md` — 测试计划与覆盖范围
- [ ] `docs/solver_v5/troubleshooting.md` — 常见问题与调试指南

---

## 附录：完整的测试场景矩阵

### A.1 约束覆盖测试矩阵

| 约束 | 已有单测 | 需补测 | 优先级 |
|------|---------|--------|--------|
| FrozenRangeConstraint | ❌ | 可选 | - |
| ShareGroupConstraint | ✅ (test_share_group.py) | 传递性 | P0 ✅ |
| UniqueEmployeeConstraint | ✅ (test_share_group.py豁免场景) | 基础重叠 | P0 ✅ |
| LockedOperationsConstraint | ✅ (test_locked_constraints.py) | - | - |
| OnePositionConstraint | ❌ | 可选 | - |
| EmployeeAvailabilityConstraint | ❌ | 可选 | - |
| LockedShiftsConstraint | ✅ (test_locked_constraints.py) | - | - |
| ShiftAssignmentConstraint | ✅ (test_shift_assignment.py) | UTC偏移 | P2 |
| LeadershipCoverageConstraint | ❌ | 可选 | - |
| FlexibleSchedulingConstraint | ❌ | 可选 | - |
| ConsecutiveDaysConstraint | ❌ | **历史边界** | **P2** ⚠️ |
| StandardHoursConstraint | ❌ | **月度+季度** | **P1** ⚠️ |
| NightShiftConstraint | ❌ | **三项独立** | **P2** ⚠️ |
| SpecialShiftJointCoverageConstraint | ✅ (test_special_shift_joint_coverage.py) | - | - |
| PreferStandardShiftConstraint | ❌ | 可选 | - |
| ConsecutiveWorkRestPatternConstraint | ❌ | 可选 | - |

**总计**：16个约束，5个已有单测，6个需补测（P1/P2），5个可选。

### A.2 业务场景覆盖矩阵

| 业务场景 | 对应约束/目标 | 测试文件 | V5状态 |
|---------|--------------|---------|--------|
| 日班工序覆盖 | ShiftAssignmentConstraint | test_shift_assignment.py | ✅ 复用 |
| 夜班跨日覆盖 | ShiftAssignmentConstraint | test_shift_assignment.py | ✅ 复用+UTC测 |
| 班次间隙无覆盖 | ShiftAssignmentConstraint | test_shift_assignment.py | ✅ 复用 |
| 同队必同班 | ShareGroupConstraint | test_share_group.py | ✅ 复用+传递测 |
| 员工不重叠 | UniqueEmployeeConstraint | test_share_group.py | ✅ 复用 |
| 锁定工序 | LockedOperationsConstraint | test_locked_constraints.py | ✅ 复用 |
| 锁定班次 | LockedShiftsConstraint | test_locked_constraints.py | ✅ 复用 |
| 特殊值班(HARD) | SpecialShiftJointCoverageConstraint | test_special_shift_joint_coverage.py | ✅ 复用 |
| 特殊值班(SOFT) | SpecialShiftJointCoverageConstraint | test_special_shift_joint_coverage.py | ✅ 复用 |
| 月度工时 | StandardHoursConstraint | ❌ 缺 | ⚠️ **补** |
| **季度工时** | **StandardHoursConstraint (新)** | ❌ 缺 | ⚠️ **新增** |
| 夜班后休息 | NightShiftConstraint (项1) | ❌ 缺 | ⚠️ **补** |
| 禁孤立夜班 | NightShiftConstraint (项2) | ❌ 缺 | ⚠️ **补** |
| 夜班时间间隔 | NightShiftConstraint (项3) | ❌ 缺 | ⚠️ **补** |
| 最大连续工作日 | ConsecutiveDaysConstraint | ❌ 缺 | ⚠️ **补** |
| **历史工作日边界** | **ConsecutiveDaysConstraint (扩展)** | ❌ 缺 | ⚠️ **补** |
| FLEXIBLE时间窗 | FlexibleSchedulingConstraint | ❌ 缺 | ⚠️ **可选补** |
| 员工不可用期 | EmployeeAvailabilityConstraint | ❌ 缺 | ⚠️ **可选补** |
| 领导参与三态 | LeadershipCoverageConstraint | ❌ 缺 | ⚠️ **可选补** |
| **法定假期成本** | **LegalHolidayObjective (新)** | ❌ 缺 | ⚠️ **新增** |

**优先级合计**：
- P0（必须，已有）：5项
- P1（必须，缺失）：3项（季度工时、法定假期、历史边界？）
- P2（重要）：4项（三项夜班、连续工作日）
- P3（可选）：4项（灵活调度、不可用期、领导覆盖、碎片化休息）

---

**报告完成**

**编制**：Claude Code Agent (Haiku 4.5)  
**日期**：2026-06-11  
**版本**：1.0
