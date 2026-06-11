# V4 求解器约束模块精读报告 — A 组

> 目标读者：准备从零实现 V5 求解器的工程师。
> 本报告覆盖注册机制 + 10 个核心约束模块，精确到文件路径:行号、字段名、函数名。

---

## 1. 注册机制（registry + base）

### 1.1 BaseConstraint

文件：`solver_v4/constraints/base.py`

每个约束都必须继承 `BaseConstraint`，并实现：

| 类属性 | 类型 | 说明 |
|---|---|---|
| `name` | `str` | 用于日志前缀 |
| `config_key` | `str` | 对应 `SolverRequest.config` 中的开关 key；空字符串表示无法禁用 |
| `default_enabled` | `bool` | 当 `config_key` 缺失时的默认启用状态 |

核心接口（`base.py:26`）：

```python
def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
    ...  # 返回本次添加的约束数量
```

- `ctx: SolverContext` — 持有 `model`、`assignments`、`shift_assignments`、`shift_index`、`index(AssignmentIndex)`、`vacancy_vars`、`leadership_penalty_vars` 等求解状态（`core/context.py`）
- `data: SolverRequest` — 业务数据（工序需求、员工档案、班次定义、日历等），来自 `contracts/request.py`

### 1.2 Registry（分阶段执行）

文件：`solver_v4/constraints/registry.py`

注册表被分为两个阶段，顺序**严格有意义**：

```
CORE_CONSTRAINTS (Phase 1 — 无 shift_assignments 依赖)
  1. FrozenRangeConstraint     ← 必须第一个执行，固定区间外变量
  2. ShareGroupConstraint
  3. UniqueEmployeeConstraint
  4. LockedOperationsConstraint
  5. OnePositionConstraint
  6. EmployeeAvailabilityConstraint

SHIFT_CONSTRAINTS (Phase 2 — 需要 shift_assignments 已创建)
  7. LockedShiftsConstraint
  8. ShiftAssignmentConstraint
  9. LeadershipCoverageConstraint
  10. FlexibleSchedulingConstraint
  11. ConsecutiveDaysConstraint
  12. StandardHoursConstraint
  13. NightShiftConstraint
  ...（其余 B 组模块）
```

`CONSTRAINT_REGISTRY = CORE_CONSTRAINTS + SHIFT_CONSTRAINTS`（`registry.py:59`）

solver.py 按此顺序依次调用 `constraint.apply(ctx, data)`，跳过逻辑在 solver 中负责（根据 `config_key` 和 `default_enabled` 决定是否跳过）。

**V5 设计提示：**
- Phase 1 / Phase 2 的划分不是随意的，Phase 2 约束依赖 `ctx.shift_assignments` 非空；如果 V5 同样有班次层，必须保留此分阶段机制。
- `FrozenRangeConstraint` 注释明确写了"MUST be first"，V5 若保留区间求解特性则必须同样保持其为第一。

---

## 2. 核心数据结构说明（理解约束的前提）

### AssignmentIndex（`core/index.py`）

`ctx.index: AssignmentIndex` 是对 `assignments` dict `(op_id, pos_num, emp_id) -> BoolVar` 的四维倒排索引：

| 方法 | 复杂度 | 用途 |
|---|---|---|
| `get_vars_for_op_emp(op_id, emp_id)` | O(1) | 某员工在某工序的所有岗位变量 |
| `get_assignments_for_emp(emp_id)` | O(1) | 某员工的所有 (op_id, pos_num, var) |
| `get_assignments_for_op(op_id)` | O(1) | 某工序的所有 (pos_num, emp_id, var) |
| `get_candidates_for_op(op_id)` | O(1) | 某工序的候选员工集合 |
| `get_all_employees()` | O(1) | 全部员工 ID |

### ShiftIndex（`core/index.py:90`）

`ctx.shift_index: ShiftIndex` 提供：
- `get_shift_interval(date_str, shift_id)` → `(start_ts, end_ts)` Unix 时间戳（处理夜班跨日）
- `get_covering_shifts(op_start, op_end, window_dates)` → `List[(date_str, shift_id)]` 完全覆盖工序时间的班次列表

### SolverRequest.config 字段汇总

`config` 是 `Optional[Dict[str, Any]]`，各约束通过 `data.config or {}` 读取，相关 key 包括：

| Key | 类型 | 默认值 | 被哪个约束使用 |
|---|---|---|---|
| `enable_share_group` | bool | true | ShareGroupConstraint |
| `enable_unique_employee` | bool | true | UniqueEmployeeConstraint |
| `enable_locked_operations` | bool | true | LockedOperationsConstraint |
| `enable_one_position` | bool | true | OnePositionConstraint |
| `enable_employee_availability` | bool | true | EmployeeAvailabilityConstraint |
| `enable_locked_shifts` | bool | true | LockedShiftsConstraint |
| `strict_locked_shifts` | bool | false | LockedShiftsConstraint（不可缺班次时是否强制 infeasible）|
| `enable_shift_assignment` | bool | true | ShiftAssignmentConstraint |
| `enable_standard_hours` | bool | true | StandardHoursConstraint |
| `monthly_hours_lower_offset` | float | 4.0 | StandardHoursConstraint |
| `monthly_hours_upper_offset` | float | 32.0 | StandardHoursConstraint |
| `enable_max_consecutive_work_days` | bool | true | ConsecutiveDaysConstraint |
| `enable_max_consecutive_rest_days` | bool | true | ConsecutiveDaysConstraint |
| `max_consecutive_work_days` | int | 6 | ConsecutiveDaysConstraint |
| `max_consecutive_rest_days` | int | 4 | ConsecutiveDaysConstraint |

`FrozenRangeConstraint` 的 `config_key = ""`，**不可通过 config 禁用**。

---

## 3. 约束模块详析

---

### 3.1 FrozenRangeConstraint

**文件：** `solver_v4/constraints/frozen_range.py`

| 项目 | 值 |
|---|---|
| `name` | `"FrozenRange"` |
| `config_key` | `""` （无法通过 config 禁用） |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 1 位，**必须最先执行** |

**业务含义：**

支持"区间求解"（Interval Solve）模式：前端选择一个子区间（`solve_range`），求解器只优化该区间，区间外的班次和工序分配固定不变。全月数据全部建模，通过此约束将区间外的变量固定为已知值，从而让跨边界约束（连续工作日、夜班间隔、共享组等）能正确感知边界外的历史状态。

**数学表达：**

对 `shift_assignments` 中每个 `(emp_id, date, shift_id)` 变量：
- 若 `date < solve_start` 或 `date > solve_end`：
  - 若存在对应 `FrozenShift` 记录：`var == (1 if shift_id == frozen_shift_map[(emp_id, date)] else 0)`
  - 若不存在对应记录：不固定（允许求解器决定，见代码 `frozen_range.py:83`）

对 `assignments` 中每个 `(op_id, pos_num, emp_id)` 变量：
- 若工序的 `planned_start` 日期在区间外：
  - 查找 `frozen_assignments` 记录：`var == (1 if emp_id == frozen_assign_map[(op_id, pos_num)] else 0)`

**关键输入字段：**

```
data.solve_range: {start_date, end_date}    # 子区间
data.frozen_shifts: List[FrozenShift]       # (employee_id, date, shift_id)
data.frozen_assignments: List[FrozenAssignment]  # (operation_plan_id, position_number, employee_id)
data.window: {start_date, end_date}         # 全量窗口
```

**注意：** 当 `solve_range == window` 时跳过（全月求解模式），见 `frozen_range.py:42-43`。

**与其他约束的交互：**
- 此约束固定变量后，所有后续约束（包括 Phase 2）都在固定边界上操作，因此必须排第一。
- `ConsecutiveDaysConstraint`、`NightShiftConstraint` 等跨日约束依赖此约束已经固定了区间外的变量，才能正确计算边界历史。

**V5 风险：**
- 如果 V5 采用增量求解或区间求解，必须保留此机制，且要保证 `frozen_shifts` 和 `frozen_assignments` 的数据完整性。区间外没有 frozen 数据但存在工序时，当前代码不会固定变量（`frozen_range.py:83` 的 `pass`），这可能导致区间外的变量被意外重排。

---

### 3.2 ShareGroupConstraint

**文件：** `solver_v4/constraints/share_group.py`

| 项目 | 值 |
|---|---|
| `name` | `"ShareGroup"` |
| `config_key` | `"enable_share_group"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 2 位 |

**业务含义：**

"共享组"（Share Group）指一批工序共享同一支团队。例如，某工序 A 需要 2 人，工序 B 需要 3 人，它们属于同一共享组，则 A 的 2 人必须是 B 的 3 人的子集（相同员工）。若两工序需求人数相同，则必须完全一致（等集合约束）。

**核心数据结构：**

```python
SharedPreference:
    share_group_id: int
    share_group_name: str
    members: List[{operation_plan_id, required_people}]
    share_mode: str = "SAME_TEAM"
```

**数学表达：**

对同一组内按 `required_people` 升序排列的工序链 `[op_0, op_1, ..., op_n]`，对相邻对 `(op_i, op_{i+1})`：

设 `assigned_i(e)` 为员工 e 是否被分配到 op_i（任意岗位，由 `_get_employee_assigned_var` 创建 OR 辅助变量）：

- 若 `size_i < size_{i+1}`（子集规则）：
  `AddImplication(assigned_i(e), assigned_{i+1}(e))` — 即 op_i 中有员工 e → op_{i+1} 也必须有员工 e（`share_group.py:121`）

- 若 `size_i == size_{i+1}`（等集合规则）：
  `Add(assigned_i(e) == assigned_{i+1}(e))` （`share_group.py:123`）

- 若员工 e 在 op_i 有分配变量但不是 op_{i+1} 的候选人：
  `Add(assigned_i(e) == 0)`（自动禁止，`share_group.py:127`）

链式约束（O(n)，非 O(n²)）：`share_group.py:95-128`。

**重要实现细节：**

- `_emp_in_op_cache: Dict[(op_id, emp_id), BoolVar]`（`share_group.py:38`）：缓存 OR 辅助变量，避免重复创建。每次 `apply()` 开始时清空（`share_group.py:44`）。
- 若某组成员的 `operation_plan_id` 不在本次 `operation_demands` 中（孤儿成员），会被过滤掉（`share_group.py:75-79`），并打 WARNING。

**与其他约束的交互：**

- `UniqueEmployeeConstraint` 对同一共享组内的工序豁免互斥约束（用 Union-Find 合并同组工序，`unique_employee.py:35-74`）。若二者顺序颠倒，UniqueEmployee 会先看到所有工序互相重叠并添加过于严格的互斥约束，导致 ShareGroup 的蕴含约束永远无解。

**V5 风险：**
- 链式约束只对相邻对有效，具有传递性（因为链是有序的），但如果成员数量分布复杂（例如 [2, 2, 3, 3, 5]），需确认等集合 + 子集链的组合覆盖了所有语义。
- 跨批次共享组（孤儿成员过滤）可能隐藏数据不一致问题，V5 应考虑更严格的告警或拒绝策略。

---

### 3.3 UniqueEmployeeConstraint

**文件：** `solver_v4/constraints/unique_employee.py`

| 项目 | 值 |
|---|---|
| `name` | `"UniqueEmployee"` |
| `config_key` | `"enable_unique_employee"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 3 位 |

**业务含义：**

同一员工不能同时被分配到时间重叠的两个工序，除非这两个工序属于同一共享组（此时员工出现在两个工序是语义上合理的，即"同一支队伍"）。

**数学表达：**

使用扫描线（Sweep-Line）算法找出每位员工在其所有候选工序中的"最大重叠团"（Maximal Clique），对每个最大团添加：

```
Sum(bucket_vars) <= 1
```

其中 `bucket_vars` 按共享组分桶：
- 独立工序（无共享组）：每个工序一个 var
- 同一共享组的工序：用 `AddMaxEquality(bv, vars_list)` 合并为一个 OR 变量（`unique_employee.py:199`），整个组视为一个"槽位"

关键方法：

- `_build_op_to_group_uf(shared_preferences)` — Union-Find 构建 op_id → 规范化 group_id 映射（`unique_employee.py:35-74`）；处理跨组传递（A∩B∩C 自动合并）
- `_constrain_employee(...)` — 扫描线算法（`unique_employee.py:121-208`）：
  1. 生成 `(time, type, op_id)` 事件列表（Start=+1, End=-1）
  2. 同时刻 End 排在 Start 前（接触不算重叠，`unique_employee.py:155-156`）
  3. 收集所有"当前活跃集合"快照作为 raw_cliques
  4. 保留最大团（去掉子集，`unique_employee.py:170-176`）
  5. 对每个最大团按共享组分桶，添加 `Sum(bucket_vars) <= 1`

**与 ShareGroupConstraint 的交互：**

ShareGroupConstraint 在第 2 位已经建立了"共享组内员工集合一致"的蕴含约束，UniqueEmployeeConstraint 在第 3 位豁免共享组内的互斥，两者协同实现：同组工序员工相同 + 不同工序间员工不冲突。

**V5 风险：**
- 扫描线只基于工序的 `planned_start` / `planned_end`，未考虑 FLEXIBLE 模式工序（`scheduling_mode="FLEXIBLE"`）。FLEXIBLE 工序的时间区间在求解时动态确定，当前实现中固定用其 `planned_start`/`planned_end` 参与扫描线，可能不准确。
- 若某员工的 op 数量很大（例如某员工候选了 50 个工序），最大团算法的最坏情况可能较慢，需要关注性能。

---

### 3.4 LockedOperationsConstraint

**文件：** `solver_v4/constraints/locked_operations.py`

| 项目 | 值 |
|---|---|
| `name` | `"LockedOperations"` |
| `config_key` | `"enable_locked_operations"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 4 位 |

**业务含义：**

前端"锁定"某工序的人员分配后，再次求解时必须保留该分配不变。这是排班交互的核心场景：调度员手动确认某位员工后，其他工序继续优化，但已确认的分配不得改变。

**核心数据结构：**

```python
LockedOperation:
    operation_plan_id: int
    enforced_employee_ids: List[int]
```

**数学表达：**

对每个 `LockedOperation` 中的 `(op_id, emp_id)` 对：

```
Sum(index.get_vars_for_op_emp(op_id, emp_id)) == 1
```

即该员工必须被分配到该工序（任意一个岗位），`locked_operations.py:57`。

**特殊行为：**

若锁定的员工不是该工序的任何岗位的候选人（`get_vars_for_op_emp` 返回空），则添加：
```
model.Add(0 == 1)  # 强制不可行
```
这会使整个模型 INFEASIBLE（`locked_operations.py:53`）。调用方需确保数据一致性，否则求解必然失败。

**V5 风险：**
- 没有"软锁定"模式，一旦数据不一致就直接 infeasible，缺少降级处理。V5 可考虑提供 `strict_locked_operations` 开关，类似 `LockedShiftsConstraint` 的 `strict_locked_shifts`。
- `enforced_employee_ids` 列表内部做了去重（`locked_operations.py:40-44`），但未验证同一工序是否有足够的岗位容纳所有锁定员工。

---

### 3.5 OnePositionConstraint

**文件：** `solver_v4/constraints/one_position.py`

| 项目 | 值 |
|---|---|
| `name` | `"OnePosition"` |
| `config_key` | `"enable_one_position"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 5 位 |

**业务含义：**

同一员工在同一工序中最多担任一个岗位。防止员工被重复分配到同一工序的不同岗位（例如在某工序中同时担任操作员和质检员），确保岗位填充的有效性。

**数学表达：**

仅对多岗位工序（`len(op.position_qualifications) > 1`）生效：

```
Sum(index.get_vars_for_op_emp(op_id, emp_id)) <= 1
```

即对同一 (op_id, emp_id) 的所有岗位变量之和不超过 1（`one_position.py:73`）。

**实现细节：**

- 先筛选出有多个岗位的工序列表（`one_position.py:39-42`），单岗位工序不添加此约束（隐式满足，因为只有一个变量）。
- 候选员工集合从 `op.position_qualifications[*].candidate_employee_ids` 收集并去重（`one_position.py:63-65`）。
- 实际上只有在某员工同时是多个岗位的候选人时，`get_vars_for_op_emp` 才会返回多个变量，此时才真正添加约束（`one_position.py:72`）。

**与其他约束的交互：**

`ShareGroupConstraint` 中的 `_get_employee_assigned_var` 通过 `AddMaxEquality` 将同 (op, emp) 的多个变量合并为一个 OR 变量，依赖 `OnePositionConstraint` 保证这些变量中至多一个为 1，从而 OR 变量语义正确。

---

### 3.6 EmployeeAvailabilityConstraint

**文件：** `solver_v4/constraints/employee_availability.py`

| 项目 | 值 |
|---|---|
| `name` | `"EmployeeAvailability"` |
| `config_key` | `"enable_employee_availability"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 1 第 6 位（最后） |

**业务含义：**

员工在其"不可用时段"（如请假、培训、调休等）内不得被分配到任何工序。这是一个**防御性约束**——正常情况下后端 `DataAssemblerV4.ts` 在组装请求时已经预过滤了候选人列表，此约束作为安全网，防止数据不一致导致违规分配。

**注意：** 此约束**不影响班次分配**，员工在不可用期间仍可以有班次变量（包括 REST 班次）以满足工时约束。

**核心数据结构：**

```python
EmployeeProfile.unavailable_periods: List[{start_datetime, end_datetime}]
```

**数学表达：**

对每个员工 `emp`，对其每个 `unavailable_period` `[unavail_start, unavail_end]`（Unix 时间戳）：
对每个与该期间时间重叠的工序 `op`（判断：`op_start < unavail_end AND op_end > unavail_start`）：

```
for var in index.get_vars_for_op_emp(op_id, emp_id):
    model.Add(var == 0)
```

（`employee_availability.py:79-83`）

**V5 风险：**
- 如果前端已经充分过滤候选人，此约束大多情况下添加 0 个约束，没有性能问题。但如果 DataAssembler 上游有 bug，此约束会"默默地"封锁变量，不会产生明显的 INFEASIBLE 信号（不同于 `LockedOperationsConstraint` 那样直接 infeasible）。调度结果可能出现空位而不报错，需要结合空缺目标函数（vacancy_vars）来发现。

---

### 3.7 LockedShiftsConstraint

**文件：** `solver_v4/constraints/locked_shifts.py`

| 项目 | 值 |
|---|---|
| `name` | `"LockedShifts"` |
| `config_key` | `"enable_locked_shifts"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 2 第 1 位 |

**业务含义：**

前端锁定某员工某天的班次（包括 REST）后，求解器必须保持该班次不变。是班次层面的人工确认机制，与 `LockedOperationsConstraint`（工序层面）相对应。

**核心数据结构：**

```python
LockedShift:
    employee_id: int
    date: str                    # YYYY-MM-DD
    plan_category: str = "WORK"  # WORK | REST
    shift_id: Optional[int]      # REST 类别可为 None，由约束自动解析
```

**数学表达：**

对每个 `LockedShift`：
1. 若 `shift_id` 为 None 且 `plan_category == "REST"`：自动找到 `nominal_hours <= 0.01` 的班次作为 `target_shift_id`（`locked_shifts.py:38-39`）
2. `target_var = shift_assignments[(emp_id, date, target_shift_id)]`
3. `model.Add(target_var == 1)`（`locked_shifts.py:66`）

`ShiftAssignmentConstraint` 已保证每天只选一个班次（Sum == 1），因此锁定一个班次为 1 会隐式将同天其他班次变量强制为 0，无需额外约束（`locked_shifts.py:68`）。

**宽松/严格模式（`strict_locked_shifts`）：**

若 `target_var` 不在模型中（数据不一致）：
- 默认模式（`strict_locked_shifts=False`）：跳过，打 WARNING（`locked_shifts.py:63`）
- 严格模式（`strict_locked_shifts=True`）：`model.Add(0 == 1)` 强制 INFEASIBLE（`locked_shifts.py:56-59`）

**V5 风险：**
- REST 班次自动解析逻辑（`nominal_hours <= 0.01`）依赖 `shift_definitions` 的数据质量。若有多个 REST 班次，取 `rest_shift_ids[0]`（`locked_shifts.py:39`），存在不确定性。V5 应考虑将 REST 班次标识更明确（例如增加 `plan_category` 字段到 `ShiftDefinition`，事实上 `ShiftDefinition.plan_category` 已存在但此处未用）。
- `LockedShiftsConstraint` 在 Phase 2 第 1 位，早于 `ShiftAssignmentConstraint`（第 2 位），因此锁定约束先于"每天一个班次"约束添加，顺序依赖于求解器内部的约束传播，实际无问题，但 V5 设计时应注意文档化此依赖。

---

### 3.8 ShiftAssignmentConstraint

**文件：** `solver_v4/constraints/shift_assignment.py`

| 项目 | 值 |
|---|---|
| `name` | `"ShiftAssignment"` |
| `config_key` | `"enable_shift_assignment"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 2 第 2 位 |

**业务含义（双重职责）：**

1. **每人每天恰好一个班次**：确保班次层面的完整性。
2. **工序-班次正向蕴含**：若某员工被分配到某工序，则其当天的班次必须能覆盖该工序的时间范围（`shift_start <= op_start` 且 `op_end <= shift_end`）。

**数学表达：**

**规则 1**（每人每天一个班次，`shift_assignment.py:52-54`）：

```
For each (emp_id, date):
    Sum(shift_assignments[(emp_id, date, *)] for all shift_ids) == 1
```

**规则 2**（正向蕴含，`shift_assignment.py:153-156`）：

```
For each op with scheduling_mode != "FLEXIBLE":
    covering_shifts = shift_index.get_covering_shifts(op_start, op_end, window_dates)
    For each emp_id candidate of op:
        valid_emp_shift_vars = [shift_assignments[(emp_id, date, s_id)] for (date, s_id) in covering_shifts if key exists]
        For each av in assign_vars[(op_id, emp_id)]:
            model.Add(av <= sum(valid_emp_shift_vars))
```

即"员工被分配到工序 → 员工当天的班次是覆盖该工序的班次之一"。

**边界情况处理（`shift_assignment.py:89-95`）：**

若某工序没有任何覆盖班次（`covering_shifts` 为空），则对该工序的所有分配变量强制 `var == 0`，等效于工序无法分配任何人。

若某员工在合法覆盖班次中没有对应的班次变量（可能因为某天该员工不在排班范围内），同样强制其分配变量为 0（`shift_assignment.py:140-144`）。

**与其他约束的交互：**

- FLEXIBLE 模式工序跳过此约束（`shift_assignment.py:73-74`），由 `FlexibleSchedulingConstraint` 负责。
- 依赖 `ShiftIndex.get_covering_shifts` 的"完全包含"覆盖语义（`sh_start <= op_start && op_end <= sh_end`，`index.py:143-144`），夜班跨日情况已在 `ShiftIndex.get_shift_interval` 中处理。

**V5 风险：**
- `op_coverage_cache`（`shift_assignment.py:66`）按 `op_id` 缓存覆盖班次，但多个员工共享同一工序的覆盖班次列表，这是正确的优化——注意 V5 如果增加员工个性化班次限制（`preferred_shift_ids` 已存在于 `OperationDemand`），需要在员工粒度上做进一步过滤，目前该字段在此约束中未被使用。
- `get_covering_shifts` 遍历整个 `window_dates`（全月日期），当工序较多时，外层 O(ops) × 内层 O(days × shifts) 复杂度需要评估。

---

### 3.9 StandardHoursConstraint

**文件：** `solver_v4/constraints/standard_hours.py`

| 项目 | 值 |
|---|---|
| `name` | `"StandardHours"` |
| `config_key` | `"enable_standard_hours"` |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 2 第 6 位 |

**业务含义（H8/H9 规则）：**

控制每位员工的月度总工时：
- **H9（下限）**：总工时 ≥ 月度标准工时 − `lower_offset`（默认 4h）
- **H8（上限）**：总工时 ≤ 月度标准工时 + `upper_offset`（默认 32h）

月度标准工时 = 该月工作日数 × 8 小时（根据 `calendar` 中 `is_workday` 字段计数）。

跨月窗口时，每个月独立计算标准工时和约束（`standard_hours.py:156-170`）。

**数学表达：**

对每个月份桶 `[bucket_start, bucket_end]`，对每位候选员工 `emp_id`：

```
total_hours_expr = Sum(shift_hours_map[shift_id] * 100 * var 
                       for (emp_id, date, shift_id) in bucket_dates × non_rest_shifts
                       if key in shift_assignments)

model.Add(total_hours_expr >= (standard_hours - lower_offset) * 100)   # H9
model.Add(total_hours_expr <= (standard_hours + upper_offset) * 100)   # H8
```

**精度处理：** 所有工时值乘以 100 转为整数（`standard_hours.py:55`），支持 0.01h 精度（即 0.6 分钟），避免浮点误差。

**配置字段（均在 `data.config` 中）：**

| Key | 默认值 | 说明 |
|---|---|---|
| `monthly_hours_lower_offset` | `4.0` | 下限容差（小时） |
| `monthly_hours_upper_offset` | `32.0` | 上限容差（小时） |

**员工筛选：** 只对"至少是一个工序候选人"的员工添加约束（`standard_hours.py:79-82`），减少无效约束数量。

**与其他约束的交互：**

- REST 班次（`nominal_hours <= 0.01`）的变量不参与工时加总（`standard_hours.py:119-121`），休息班次贡献 0 工时。
- `ShiftAssignmentConstraint` 保证每人每天恰好一个班次，`StandardHoursConstraint` 依赖这一性质确保工时加总逻辑正确。

**V5 风险：**
- `lower_offset` 默认只有 4h，这是一个很紧的下限（每月允许少工作 4h），容易在假期较多的月份（如春节月）因工作日少而导致 INFEASIBLE。实际部署时建议根据业务规则动态计算或放宽。
- `all_employees` 是通过遍历 `operation_demands` 收集的候选员工，若某员工只有班次排班需求（无工序分配候选资格），则不会被约束工时，可能造成工时失控。V5 应明确"所有需要约束工时的员工"的来源。
- 月份桶切分逻辑（`_split_window_by_month`，`standard_hours.py:144-176`）依赖 `window` 的 `start_date`/`end_date` 字符串格式为 `%Y-%m-%d`，若上游传入其他格式会抛异常。

---

### 3.10 ConsecutiveDaysConstraint（含 work_days_limit.py 关系说明）

**文件：** `solver_v4/constraints/consecutive_days.py`

> 注意：目录中同时存在 `work_days_limit.py`（`MaxConsecutiveWorkDaysConstraint`），但 **registry.py 中注册的是 `ConsecutiveDaysConstraint`**（`consecutive_days.py`），后者是前者的统一重构版本，新增了休息日上限子规则（Rest Limit）。`work_days_limit.py` 目前仍保留在目录中但未在注册表中使用，可视为废弃代码。

| 项目 | 值 |
|---|---|
| `name` | `"ConsecutiveDays"` |
| `config_key` | `""` （无法通过顶层开关禁用，但子规则各自有开关） |
| `default_enabled` | `True` |
| 硬/软 | 硬约束 |
| Registry 位置 | Phase 2 第 5 位 |

**业务含义（两个子规则）：**

**子规则 1 — Work Limit（`enable_max_consecutive_work_days`）**

员工不得连续工作超过 `max_consecutive_work_days`（默认 6）天。

**子规则 2 — Rest Limit（`enable_max_consecutive_rest_days`）**

员工不得连续休息超过 `max_consecutive_rest_days`（默认 4）天（防止员工长期"消失"）。

两个子规则共享班次数据预处理逻辑（`consecutive_days.py:58-99`），仅遍历一次 `shift_assignments`。

**配置字段（均在 `data.config` 中）：**

| Key | 默认值 | 说明 |
|---|---|---|
| `enable_max_consecutive_work_days` | `True` | 启用工作天数上限 |
| `enable_max_consecutive_rest_days` | `True` | 启用休息天数上限 |
| `max_consecutive_work_days` | `6` | 最大连续工作天数 |
| `max_consecutive_rest_days` | `4` | 最大连续休息天数 |

**数学表达（滑动窗口）：**

构建 `daily_map[emp_id] = [expr_0, expr_1, ..., expr_{total_days-1}]`，其中 `expr_i` = 当天工作班次变量之和（若当天无工作班次变量则为 `0`）。

Work Limit（`_apply_work_limit`，`consecutive_days.py:134-144`）：

```
For each window of size (work_limit + 1) in daily_map[emp_id]:
    model.Add(sum(window) <= work_limit)
```

Rest Limit（`_apply_rest_limit`，`consecutive_days.py:191-200`）：

```
For each window of size (rest_limit + 1) in daily_map[emp_id]:
    model.Add(sum(window) >= 1)   # 窗口内至少有一天工作
```

**历史边界约束（`_apply_work_boundary` / `_apply_rest_boundary`）：**

读取 `data.historical_shifts: List[HistoricalShift]` 中每位员工的：
- `consecutive_work_days`：窗口开始前已连续工作的天数
- `consecutive_rest_days`：窗口开始前已连续休息的天数

根据历史在窗口开始后的若干天内添加补充约束，使滑动窗口约束在跨月边界时仍然有效。

Work Boundary（`consecutive_days.py:146-187`）：
- `remaining = limit - hist_consecutive`
- 若 `remaining <= 0`：第 1 天必须休息（封锁所有工作班次变量）
- 否则：前 `remaining + 1` 天中工作天数 `<= remaining`

Rest Boundary（`consecutive_days.py:203-250`）：对称逻辑，保证连续休息天数在窗口边界正确截断。

**诊断功能（`_detect_unavoidable_conflicts`，`consecutive_days.py:255-311`）：**

求解前预检两类潜在 INFEASIBLE：
1. 某员工是某岗位的唯一候选人，且其连续必须工作天数 > limit
2. 鸽巢原理：总需求工时 > 所有员工理论最大工时

这些诊断仅打日志，不终止求解（`level="error"`），但帮助快速定位 INFEASIBLE 原因。

**与其他约束的交互：**

- 依赖 `ShiftAssignmentConstraint` 已定义 REST 班次（`nominal_hours <= 0.01`），否则所有班次都视为工作，Work Limit 无法成立。
- `FrozenRangeConstraint` 固定区间外的班次变量后，`ConsecutiveDaysConstraint` 在全月时间轴上构建 `daily_map`，区间外的固定变量贡献正确的历史值（但因全月建模，这些贡献已隐含在变量固定值中）。
- `historical_shifts` 的边界约束是对 `FrozenRangeConstraint` 的补充：若 V4 采用区间求解，`FrozenRangeConstraint` 固定的是"窗口内区间外"的变量，而 `historical_shifts` 覆盖的是"窗口外"（前一个月末）的历史，二者互补。

**V5 风险：**
- `work_days_limit.py` 中的 `MaxConsecutiveWorkDaysConstraint` 与 `consecutive_days.py` 存在逻辑重复，但前者未被注册，需在 V5 中彻底清理，避免混淆。
- `daily_map` 基于全月时间轴（`w_start` 到 `w_end`），与 `solve_range` 无关——即使只求解一个子区间，仍然对全月所有员工构建 `daily_map`，如果窗口很长（如季度排班），这可能导致约束数量显著增加。
- Rest Limit 的 `max_consecutive_rest_days` 默认 4 天，对于法定长假（如春节 7 天）可能强制员工在假期工作，需要根据 `calendar.is_workday` 剔除法定假日，或将假日的 REST 班次排除在连续休息计数之外（当前实现未区分"法定假日 REST"和"主动休息 REST"）。

---

## 4. 约束交互总结图

```
Phase 1 (Core):
  FrozenRange → 固定区间外变量
       ↓（为后续约束提供正确的变量初始值）
  ShareGroup → 共享组员工子集/等集合蕴含
       ↓（共享组信息传给 UniqueEmployee）
  UniqueEmployee → 时间冲突互斥（豁免共享组）
       ↓
  LockedOperations → 锁定工序分配（硬固定）
       ↓
  OnePosition → 同工序同员工最多一岗
       ↓
  EmployeeAvailability → 请假封锁（防御性）

Phase 2 (Shift-dependent):
  LockedShifts → 锁定班次（硬固定）
       ↓
  ShiftAssignment → 每天一班次 + 工序覆盖蕴含
       ↓（保证班次层完整性，后续约束依赖此）
  ConsecutiveDays → 连续工/休天数滑动窗口
       ↓
  StandardHours → 月工时上下限（H8/H9）
```

---

## 5. 对 V5 设计的建议

1. **保留 Phase 1 / Phase 2 双阶段机制**，以支持独立的操作分配层和班次排班层。若 V5 要解耦两层，需重新设计 `SolverContext` 以明确各层依赖。

2. **`FrozenRangeConstraint` 必须最先执行**，且要确保 `frozen_shifts`/`frozen_assignments` 数据在区间外无遗漏，否则区间外变量会被"自由"——当前代码在 `frozen_range.py:83` 有 `pass` 留白，是一个潜在 bug。

3. **`work_days_limit.py` 应删除**，已被 `consecutive_days.py` 完全替代，继续保留会误导 V5 开发者。

4. **`StandardHoursConstraint` 的员工范围**应从 `employee_profiles` 而非 `operation_demands` 候选人中获取，否则无操作排班任务的员工工时不受约束。

5. **`ShiftDefinition.plan_category` 字段（"STANDARD"/"SPECIAL"/"TEMPORARY"）已存在**但 `LockedShiftsConstraint` 在识别 REST 班次时仍用 `nominal_hours <= 0.01`（`locked_shifts.py:37`），V5 应统一用 `plan_category == "REST"` 或增加专用 `is_rest: bool` 字段，避免数值判断带来的歧义。

6. **FLEXIBLE 工序在 `UniqueEmployeeConstraint` 中的处理**需要特别设计：当前实现用固定的 `planned_start/planned_end` 参与扫描线，但 FLEXIBLE 工序的实际时间是决策变量，V5 需要在 `IntervalVar` 层面处理时间冲突（CP-SAT 的 `AddNoOverlap`）。

7. **`ShareGroupConstraint` 的孤儿成员过滤**（`share_group.py:75-79`）在跨批次共享组场景下会静默丢弃成员，V5 应考虑是否需要严格模式（类似 `strict_locked_shifts`）或者记录详细告警。
