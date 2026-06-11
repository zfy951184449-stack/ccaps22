# V4 约束模块 B 组精读报告（面向 V5 工程师）

> 报告路径：`docs/solver_v5/research/03_constraints_b.md`
> 覆盖模块：夜班系列、连续天数系列、弹性排班、标准班偏好、领导力覆盖、特殊班联合覆盖

---

## 第一部分：注册机制与基类

### 1.1 注册表结构（`solver_v4/constraints/registry.py`）

注册表分两个阶段：

| 阶段 | 常量名 | 说明 |
|---|---|---|
| Phase 1 | `CORE_CONSTRAINTS` | 不依赖 shift_assignments，核心变量约束 |
| Phase 2 | `SHIFT_CONSTRAINTS` | 依赖 shift_assignments，班次层约束 |

合并为 `CONSTRAINT_REGISTRY = CORE_CONSTRAINTS + SHIFT_CONSTRAINTS`，在 `solver.py` 中遍历顺序调用 `constraint.apply(ctx, data)`。

**向 registry 添加新约束的步骤**（registry.py:1-13 注释明确）：
1. 在 `constraints/` 目录创建新类，设置 `config_key` 和 `default_enabled`
2. import 并 append 到对应列表
3. 不需要修改 `solver.py`

**Phase 2 注册顺序**（与 B 组相关，registry.py:45-56）：
```
LockedShiftsConstraint
ShiftAssignmentConstraint
LeadershipCoverageConstraint          # 领导力覆盖（含 Rule 1-4）
FlexibleSchedulingConstraint
ConsecutiveDaysConstraint             # 统一：最大连班 + 最大连休
StandardHoursConstraint
NightShiftConstraint                  # 统一：夜休 + 孤立夜 + 夜班间隔 + 软性延长
SpecialShiftJointCoverageConstraint
PreferStandardShiftConstraint         # 有标准班可用时禁止特殊班
ConsecutiveWorkRestPatternConstraint  # 默认关闭
```

### 1.2 基类（`solver_v4/constraints/base.py`）

```python
class BaseConstraint(ABC):
    name: str = "BaseConstraint"
    config_key: str = ""        # 空字符串 = 无单独开关
    default_enabled: bool = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        ...  # 返回添加的约束数
```

关键点：
- `config_key` 为空时，由 solver.py 的通用判断逻辑决定是否执行（实际多数模块在 `apply()` 内自行读取 `data.config`）
- 统一的 `apply()` 签名：`ctx: SolverContext, data: SolverRequest -> int`
- 软约束不返回计数，而是向 `ctx.leadership_penalty_vars`（list of `(var, weight)`）追加惩罚项

### 1.3 SolverContext 关键字段（`solver_v4/core/context.py`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `model` | `cp_model.CpModel` | OR-Tools 模型主体 |
| `assignments` | `Dict[tuple, IntVar]` | `(op_id, position, emp_id)` → BoolVar，人员分配层 |
| `shift_assignments` | `Dict[tuple, IntVar]` | `(emp_id, date_str, shift_id)` → BoolVar，班次层 |
| `shift_index` | `ShiftIndex` | 班次时间区间查询索引 |
| `index` | `AssignmentIndex` | 操作-人员索引 |
| `special_cover_vars` | `Dict[tuple, IntVar]` | `(occurrence_id, emp_id)` → BoolVar |
| `special_shortage_vars` | `Dict[int, IntVar]` | `occurrence_id` → IntVar |
| `task_placements` | `Dict[tuple, IntVar]` | `(op_id, date, shift_id)` → BoolVar |
| `leadership_penalty_vars` | `list` | `[(var, weight), ...]`，软约束惩罚汇总 |

---

## 第二部分：遗留文件警告

以下四个文件**存在于磁盘但未注册在 registry 中**，已被统一模块取代。V5 不应复用它们：

| 遗留文件 | 取代者 |
|---|---|
| `constraints/night_rest.py` (`NightRestConstraint`) | `NightShiftConstraint._apply_night_rest()` |
| `constraints/night_shift_interval.py` (`NightShiftIntervalConstraint`) | `NightShiftConstraint._apply_interval()` |
| `constraints/no_isolated_night_shift.py` (`NoIsolatedNightShiftConstraint`) | `NightShiftConstraint._apply_no_isolated()` |
| `constraints/consecutive_rest_limit.py` (`MaxConsecutiveRestDaysConstraint`) | `ConsecutiveDaysConstraint._apply_rest_limit()` |

---

## 第三部分：各约束模块详解

---

### 3.1 `NightShiftConstraint`（统一夜班约束）

**文件**：`solver_v4/constraints/night_shift.py`  
**注册名**：`"NightShift"`  
**config_key**：无（`config_key` 未设置，always execute；子规则用各自开关）  
**默认启用**：`default_enabled = True`  
**约束类型**：硬约束为主（`is_hard = True`），含一个软子规则

#### 3.1.1 共享初始化（所有子规则共用，只构建一次）

| 步骤 | 变量 | 说明 |
|---|---|---|
| 班次分类 | `night_shift_ids`, `rest_shift_ids`, `working_shift_ids` | 按 `ShiftDefinition.is_night_shift` 和 `nominal_hours > 0.01` 分类 |
| 历史夜班索引 | `hist_night_dates[emp_id]` | window 前 `max(min_night_rest, interval-1)` 天内的历史夜班日期集合 |
| 历史前驱 | `hist_prev_day_is_work[emp_id]` | window 开始前一天是否上班（供 NoIsolated 边界用） |
| IsNight 聚合变量 | `is_night_map[(emp_id, date_str)]` | 每人每日是否夜班的 BoolVar（多夜班 shift 时引入辅助变量） |

`IsNight` 变量构建（night_shift.py:144-160）：
```python
# 单个夜班 shift 时直接复用
is_night_map[(emp_id, date_str)] = night_vars[0]
# 多个夜班 shift 时引入辅助变量
is_night = model.NewBoolVar(f"IsNight_{emp_id}_{date_str}")
model.Add(sum(night_vars) >= 1).OnlyEnforceIf(is_night)
model.Add(sum(night_vars) == 0).OnlyEnforceIf(is_night.Not())
```

#### 3.1.2 子规则 1：Night Rest（夜班后强制休息）

**config 开关**：`enable_night_rest`（默认 `True`）  
**参数**：`min_night_rest`（默认 1）  
**数学表达**：  
- 若 `is_night[emp, D] = 1`，则 `shift_assignments[(emp, D+1..D+x, working_shift)] = 0`
- 历史夜班直接 `model.Add(var == 0)`（确定事实，无 `OnlyEnforceIf`）
- 窗口内：`model.Add(var == 0).OnlyEnforceIf(is_night)`

**边界处理**：遍历 `hist_night_dates[emp_id]`，对落在 window 内的 D+1..D+x 直接封堵工作班次（night_shift.py:218-253）

#### 3.1.3 子规则 2：No Isolated Night Shift（禁止孤立夜班）

**config 开关**：`enable_no_isolated_night_shift`（默认 `True`）  
**业务含义**：夜班前一天必须是工作班，禁止"休息 → 夜班"序列  
**数学表达**（night_shift.py:256-289）：
```
model.Add(night_var[d] + rest_var[d-1] <= 1)
```
零额外变量，直接线性约束，利用 `ShiftAssignment` 保证的每日 sum=1

**边界处理**：若 `hist_prev_day_is_work[emp] is False`，则直接封堵第一天所有夜班

#### 3.1.4 子规则 3：Night Shift Interval（夜班间隔）

**config 开关**：`enable_night_shift_interval`（默认 `True`）  
**参数**：`min_night_shift_interval`（默认 7，含义：任意 7 天窗口内至多 1 次夜班，即相邻夜班间隔 ≥ 6 天）  
**数学表达**（night_shift.py:327-344）：
```
sum(is_night[i : i+interval]) <= 1   # 滑动窗口
```
- `interval < 2` 时跳过
- 窗口天数 < interval 时，对所有非常量夜班变量合并 `sum <= 1`
- 历史边界：hist_night 后 `1..interval-1` 天内直接封堵

#### 3.1.5 子规则 4：Prefer Extended Night Rest（软性延长休息）

**config 开关**：`enable_prefer_extended_night_rest`（默认 `True`），且必须 `do_rest=True` 才执行  
**参数**：`preferred_night_rest_days`（默认 2），`min_night_rest`（默认 1），`objective_weight_night_rest_extend`（默认 15）  
**约束类型**：**软约束**，惩罚进 `ctx.leadership_penalty_vars`  
**生效范围**：D+(min_night_rest+1) 至 D+preferred_night_rest_days 之间上班  
**数学表达**（night_shift.py:410-422）：
```python
penalty_var = model.NewBoolVar(f"NightExtRest_{emp_id}_{date_str}_d{offset}")
model.Add(penalty_var == 1).OnlyEnforceIf([is_night, var])
model.Add(penalty_var == 0).OnlyEnforceIf(is_night.Not())
model.Add(penalty_var == 0).OnlyEnforceIf(var.Not())
ctx.leadership_penalty_vars.append((penalty_var, weight))
```

**注意**：惩罚 channel 是 `ctx.leadership_penalty_vars`（与领导力软约束共用一个 list）

---

### 3.2 `ConsecutiveDaysConstraint`（统一连续天数约束）

**文件**：`solver_v4/constraints/consecutive_days.py`  
**注册名**：`"ConsecutiveDays"`  
**config_key**：无（两个子规则各有独立开关）  
**默认启用**：`default_enabled = True`  
**约束类型**：硬约束（`is_hard = True`）

#### 3.2.1 共享初始化

- `is_working_shift_map[shift_id]` = `nominal_hours > 0.01`
- `emp_date_vars[emp_id][date_str]` = 工作班次变量列表（按员工 + 日期分组）
- `daily_map[emp_id]` = 每日工作"表达式"列表（`0` 或 `sum(vars_today)`）

#### 3.2.2 子规则 1：最大连续工作天数

**config 开关**：`enable_max_consecutive_work_days`（默认 `True`）  
**参数**：`max_consecutive_work_days`（默认 6）  
**数学表达**（consecutive_days.py:134-144）：
```
sum(W[i : i+limit+1]) <= limit   # 任意 (limit+1) 天窗口
```
**边界处理**（consecutive_days.py:146-186）：读 `HistoricalShift.consecutive_work_days`：
- 若 `hist >= limit`：第 1 天必须休息（`model.Add(working_var == 0)`）
- 若 `hist < limit`：前 `(limit - hist + 1)` 天的工作总量 `<= (limit - hist)`

**诊断预检**（consecutive_days.py:255-310）：`_detect_unavoidable_conflicts()` 在施加约束前检测：
1. 是否有员工是某连续 N 天工序的**唯一候选人**且 N > limit
2. 鸽巢原理：总需求人次是否超过员工理论最大工作人次

#### 3.2.3 子规则 2：最大连续休息天数

**config 开关**：`enable_max_consecutive_rest_days`（默认 `True`）  
**参数**：`max_consecutive_rest_days`（默认 4）  
**数学表达**（consecutive_days.py:191-200）：
```
sum(W[i : i+limit+1]) >= 1   # 任意 (limit+1) 天窗口内至少 1 天工作
```
**边界处理**：读 `HistoricalShift.consecutive_rest_days`，镜像工作边界逻辑（consecutive_days.py:203-250）

---

### 3.3 `ConsecutiveWorkRestPatternConstraint`（连续上班/休息模式约束）

**文件**：`solver_v4/constraints/consecutive_work_rest_pattern.py`  
**注册名**：`"ConsecutiveWorkRestPattern"`  
**config_key**：`"enable_consecutive_work_rest_pattern"`  
**默认启用**：`default_enabled = False`（registry.py 注释"Default OFF"）  
**约束类型**：硬约束（`is_hard = True`）

#### 3.3.1 业务含义

强制"上班块"和"休息块"各自满足最小/最大长度，即实现"X 连上 + Y 连休"的排班模式。

**仅对有操作候选资格的员工生效**（`operation_employees` 集合，consecutive_work_rest_pattern.py:97-104）。

#### 3.3.2 配置参数

| config 字段 | 默认值 | 含义 |
|---|---|---|
| `min_consecutive_work_days_pattern` | 2 | 上班块最少天数 |
| `max_consecutive_work_days_pattern` | 3 | 上班块最多天数 |
| `min_consecutive_rest_days_pattern` | 2 | 休息块最少天数 |
| `max_consecutive_rest_days_pattern` | 3 | 休息块最多天数 |

#### 3.3.3 数学表达

设 `W[d] ∈ {0,1}`（1=上班）：

| 规则 | 约束形式 | 代码位置 |
|---|---|---|
| MAX 连续上班 | `sum(W[i:i+max_work+1]) <= max_work` | consecutive_work_rest_pattern.py:155-163 |
| MAX 连续休息 | `sum(W[i:i+max_rest+1]) >= 1` | consecutive_work_rest_pattern.py:164-171 |
| MIN 连续上班 | `W[d+j] + W[d-1] >= W[d]`，j=1..min_work-1 | consecutive_work_rest_pattern.py:173-185 |
| MIN 连续休息 | `W[d+j] + W[d-1] - W[d] <= 1`，j=1..min_rest-1 | consecutive_work_rest_pattern.py:187-198 |

MIN 约束含义解读：
- **MIN 连续上班**：若 `W[d-1]=0`（昨天休息）且 `W[d]=1`（今天上班），则 `W[d+j]=1`（后续必须上班）
- **MIN 连续休息**：若 `W[d-1]=1`（昨天上班）且 `W[d]=0`（今天休息），则 `W[d+j]=0`（后续必须休息）

窗口末尾截断（`dj >= T` 时 `break`），不强制最后一段的模式完整。

---

### 3.4 `FlexibleSchedulingConstraint`（弹性排班约束）

**文件**：`solver_v4/constraints/flexible_scheduling.py`  
**注册名**：`"FlexibleScheduling"`  
**config_key**：`"enable_flexible_scheduling"`  
**默认启用**：`default_enabled = True`  
**约束类型**：硬约束（`is_hard = True`）

#### 3.4.1 业务含义

处理 `OperationDemand.scheduling_mode == 'FLEXIBLE'` 的工序（弹性任务）。这类任务没有固定日期，需在 `[earliest_start, deadline]` 窗口内选择一个 `(date, shift)` 组合放置。

#### 3.4.2 关键变量

**task_placement 变量**（flexible_scheduling.py:73-78）：
```python
# 对每个合法 (date, shift_id) 组合创建
var = model.NewBoolVar(f"TaskPlacement_{op_id}_{d}_{s_id}")
ctx.task_placements[(op_id, d, s_id)] = var
```

#### 3.4.3 约束结构

1. **精确放置约束**（flexible_scheduling.py:85）：  
   `model.AddExactlyOne(placement_vars_list)` ← 任务恰好放置到一个 (date, shift) 槽

2. **人员-放置同步约束**（flexible_scheduling.py:106）：  
   `model.AddBoolOr([assign_var.Not(), place_var.Not(), shift_var])` ← 等价于 `assign_var AND place_var => shift_var`

**合法 (date, shift) 的确定**（flexible_scheduling.py:49-59）：
- 若 `op.preferred_shift_ids` 非空 → 只用偏好班次
- 否则 → 全部班次定义

**FLEXIBLE 任务与 `prefer_standard_shift` 约束的关系**：`PreferStandardShiftConstraint` 显式跳过 `scheduling_mode == 'FLEXIBLE'` 的任务（prefer_standard_shift.py:77-78），避免干涉弹性任务的日期未确定状态。

---

### 3.5 `PreferStandardShiftConstraint`（优先标准班次约束）

**文件**：`solver_v4/constraints/prefer_standard_shift.py`  
**注册名**：`"PreferStandardShift"`  
**config_key**：`"enable_prefer_standard_shift"`  
**默认启用**：`default_enabled = True`  
**约束类型**：硬约束（`is_hard = True`）

#### 3.5.1 业务含义

当某员工当天所有操作任务**均可被至少一个 STANDARD 班次覆盖**时，禁止该员工当天选择 SPECIAL 班次。目的是减少不必要的特殊班使用。

#### 3.5.2 班次分类（prefer_standard_shift.py:44-52）

按 `ShiftDefinition.plan_category`：
- `"STANDARD"` → `standard_shift_ids`
- `"SPECIAL"` → `special_shift_ids`
- REST 班次（`nominal_hours <= 0.01`）→ 忽略

#### 3.5.3 约束逻辑

1. 构建 `emp_day_ops[(emp_id, date_str)]` = 该员工当天作为候选人的操作集合（跳过 FLEXIBLE 任务）
2. 对每个 `(emp_id, date_str)`：检查所有 op 是否每个都有至少一个 STANDARD shift 能时间覆盖（`sh_start <= op_start AND op_end <= sh_end`）
3. 若全部可被 STANDARD 覆盖 → `model.Add(shift_assignments[(emp_id, date, spc_id)] == 0)` for all `spc_id` in `special_shift_ids`

覆盖检查使用 `ctx.shift_index.get_shift_interval(date_str, std_id)` 获取班次时间区间（prefer_standard_shift.py:110-114）。

---

### 3.6 `LeadershipCoverageConstraint`（领导力覆盖约束）

**文件**：`solver_v4/constraints/leadership_coverage.py`  
**注册名**：`"LeadershipCoverage"`  
**config_key**：`"enable_leadership_coverage"`（主开关）  
**默认启用**：`default_enabled = True`  
**约束类型**：混合（Rule 1/2 硬约束，Rule 3/4 软约束）

#### 3.6.1 领导角色定义（leadership_coverage.py:44）

```python
LEADER_ROLES = {"GROUP_LEADER", "TEAM_LEADER", "DEPT_MANAGER"}
```
**注意**：`SHIFT_LEADER`（班组长）**不被视为领导**，不受此约束管控。

员工角色来源：`EmployeeProfile.org_role`（request.py:44）

#### 3.6.2 每角色操作政策（三态）

| config 字段 | 默认值 | 含义 |
|---|---|---|
| `leader_ops_policy_group_leader` | `"soft"` | GROUP_LEADER 参与生产（软惩罚） |
| `leader_ops_policy_team_leader` | `"ban"` | TEAM_LEADER 禁止参与生产（硬封堵） |
| `leader_ops_policy_dept_manager` | `"ban"` | DEPT_MANAGER 禁止参与生产（硬封堵） |

政策值 ∈ `{'allow', 'soft', 'ban'}`

#### 3.6.3 四条规则详解

**Rule 1（硬，可关闭）：生产日领导值班覆盖**  
config 开关：`enable_leader_production_coverage`（默认 `True`）  
数学表达（leadership_coverage.py:159-172）：
```
sum(shift_assignments[(leader, date, working_shift)]) >= 1
# 对每个有生产工序的 date
```
**重要提示**：此规则与 `StandardHoursConstraint` 可能冲突（领导人数少 + 生产日多 → 超标），提供关闭开关。

**Rule 2（硬）：ban 政策领导禁止操作分配**  
直接对 `ctx.assignments` 中 `key[2] in ops_banned_emp_ids` 的变量设为 0（leadership_coverage.py:191-196）。  
注意：只禁止**操作分配**（`assignments` 层），不禁止**班次**（领导仍可排班上岗，只是不执行生产工序）。

**Rule 3（软）：领导工休日偏好**  
权重参数：
- `objective_weight_leader_nonworkday`（默认 20）：非工作日上班的惩罚
- `objective_weight_leader_workday_rest`（默认 10）：工作日休息的惩罚

行为：向 `ctx.leadership_penalty_vars` 追加 `(shift_var, weight)` 对（leadership_coverage.py:209-228）

**Rule 4（软）：领导操作最小化 + SPECIAL 班次最小化**  
权重参数：
- `objective_weight_leader_ops`（默认 30）：soft 政策领导参与操作的惩罚
- `objective_weight_leader_special`（默认 50）：所有领导使用 SPECIAL 班次的惩罚

两类惩罚均追加到 `ctx.leadership_penalty_vars`（leadership_coverage.py:244-261）

---

### 3.7 `SpecialShiftJointCoverageConstraint`（特殊班联合覆盖约束）

**文件**：`solver_v4/constraints/special_shift_joint_coverage.py`  
**注册名**：`"SpecialShiftJointCoverage"`  
**config_key**：`"enable_special_shift_coverage"`  
**默认启用**：`default_enabled = True`  
**约束类型**：混合（`fulfillment_mode == "HARD"` 时硬约束，否则软约束通过 shortage 变量）

#### 3.7.1 业务含义

特殊班次（如加班、培训等）需要满足特定人数要求（`SpecialShiftRequirement.required_people`）。此约束联合决定：哪些候选员工被选中（`cover_var`）覆盖该特殊班需求，以及缺口大小（`shortage_var`）。

#### 3.7.2 关键变量（在其他模块中预创建，存入 ctx）

| ctx 字段 | 键 | 说明 |
|---|---|---|
| `ctx.special_cover_vars` | `(occurrence_id, emp_id)` | 员工是否被选为该 occurrence 的覆盖人 |
| `ctx.special_shortage_vars` | `occurrence_id` | 该 occurrence 的缺口人数（IntVar） |

#### 3.7.3 约束结构（special_shift_joint_coverage.py:37-65）

1. **覆盖 ↔ 班次联动**（每个 candidate）：  
   - 若 `shift_var` 不存在：`model.Add(cover_var == 0)`（无法覆盖）  
   - 若存在：`model.Add(cover_var <= shift_var)`（覆盖要求实际排了对应班次）

2. **人数平衡约束**：  
   `model.Add(sum(selected_vars) + shortage_var == required_people)`

3. **硬覆盖（HARD 模式）**：  
   `model.Add(shortage_var == 0)`（缺口必须为 0）

4. **同一 (emp, date, shift) 最多覆盖一次**（防止重复计算）：  
   `model.Add(sum(cover_vars_for_emp_shift) <= 1)`

**`fulfillment_mode` 字段**：`SpecialShiftRequirement.fulfillment_mode`（默认 `"HARD"`），可设为非 `"HARD"` 允许缺口（shortage 变量将通过目标函数最小化）。

---

## 第四部分：约束间交互矩阵

| 约束 A | 约束 B | 交互说明 |
|---|---|---|
| `NightShiftConstraint` (sub1) | `ConsecutiveDaysConstraint` | 夜班后休息天计入 consecutive_rest；若 min_night_rest > max_consecutive_rest_days 可产生矛盾 |
| `NightShiftConstraint` (sub2) | `ShiftAssignmentConstraint` | NoIsolated 依赖 ShiftAssignment 保证的每日 sum=1，不引入辅助变量 |
| `LeadershipCoverageConstraint` Rule 1 | `StandardHoursConstraint` | 领导人少时 Rule 1 可能迫使领导超标准月工时 → 可能不可行，提供 `enable_leader_production_coverage` 开关 |
| `LeadershipCoverageConstraint` Rule 2 | `UniqueEmployeeConstraint` / `ShareGroupConstraint` | ban 政策只封堵 assignments 层，不影响 shift 层和 share_group 分组逻辑 |
| `FlexibleSchedulingConstraint` | `PreferStandardShiftConstraint` | PSC 显式跳过 FLEXIBLE 任务，避免在任务未落日期时错误封堵班次 |
| `FlexibleSchedulingConstraint` | `ConsecutiveDaysConstraint` | 弹性任务落到特定日期后会影响该日的 is_working 表达式，但 CDays 在 FlexSched 之后执行，此时 shift_assignments 已完整 |
| `ConsecutiveWorkRestPatternConstraint` | `ConsecutiveDaysConstraint` | 同时启用时 `max_work` 值需保持一致，否则可能矛盾（Pattern 有 max_work，CDays 有 max_consecutive_work_days） |
| `SpecialShiftJointCoverageConstraint` | `LeadershipCoverageConstraint` Rule 4 | 领导使用 SPECIAL shift 被 Rule4 惩罚；但 SSJC 要求特定人员上特定 SPECIAL shift，若候选人全是领导可能惩罚不可避免 |
| `NightShiftConstraint` sub4 | `LeadershipCoverageConstraint` Rule 3/4 | 两者软惩罚都进 `ctx.leadership_penalty_vars`，V5 需注意该 channel 命名已名实不符（不只是领导力惩罚）|

---

## 第五部分：所有 config 开关汇总（B 组）

| config 字段 | 所属约束 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `enable_night_rest` | `NightShiftConstraint` | bool | `True` | 夜班后强制休息 |
| `min_night_rest` | `NightShiftConstraint` | int | 1 | 夜班后强制休息天数（硬） |
| `enable_no_isolated_night_shift` | `NightShiftConstraint` | bool | `True` | 禁止休息-夜班序列 |
| `enable_night_shift_interval` | `NightShiftConstraint` | bool | `True` | 夜班间隔限制 |
| `min_night_shift_interval` | `NightShiftConstraint` | int | 7 | 夜班间隔窗口大小（天） |
| `enable_prefer_extended_night_rest` | `NightShiftConstraint` | bool | `True` | 软性延长夜班休息（需 enable_night_rest=True） |
| `preferred_night_rest_days` | `NightShiftConstraint` | int | 2 | 期望夜班后休息天数（软） |
| `objective_weight_night_rest_extend` | `NightShiftConstraint` | int | 15 | 延长休息违反惩罚权重 |
| `enable_max_consecutive_work_days` | `ConsecutiveDaysConstraint` | bool | `True` | 最大连续工作天数限制 |
| `max_consecutive_work_days` | `ConsecutiveDaysConstraint` | int | 6 | 最大连续工作天数 |
| `enable_max_consecutive_rest_days` | `ConsecutiveDaysConstraint` | bool | `True` | 最大连续休息天数限制 |
| `max_consecutive_rest_days` | `ConsecutiveDaysConstraint` | int | 4 | 最大连续休息天数 |
| `enable_consecutive_work_rest_pattern` | `ConsecutiveWorkRestPatternConstraint` | bool | `False` | 连续上班/休息模式约束（默认关闭） |
| `min_consecutive_work_days_pattern` | `ConsecutiveWorkRestPatternConstraint` | int | 2 | 上班块最少天数 |
| `max_consecutive_work_days_pattern` | `ConsecutiveWorkRestPatternConstraint` | int | 3 | 上班块最多天数 |
| `min_consecutive_rest_days_pattern` | `ConsecutiveWorkRestPatternConstraint` | int | 2 | 休息块最少天数 |
| `max_consecutive_rest_days_pattern` | `ConsecutiveWorkRestPatternConstraint` | int | 3 | 休息块最多天数 |
| `enable_flexible_scheduling` | `FlexibleSchedulingConstraint` | bool | `True` | 弹性任务排班 |
| `enable_prefer_standard_shift` | `PreferStandardShiftConstraint` | bool | `True` | 标准班可覆盖时禁止特殊班 |
| `enable_leadership_coverage` | `LeadershipCoverageConstraint` | bool | `True` | 领导力约束主开关 |
| `enable_leader_production_coverage` | `LeadershipCoverageConstraint` | bool | `True` | Rule 1：生产日领导必须在岗 |
| `leader_ops_policy_group_leader` | `LeadershipCoverageConstraint` | str | `"soft"` | GROUP_LEADER 参与操作政策 |
| `leader_ops_policy_team_leader` | `LeadershipCoverageConstraint` | str | `"ban"` | TEAM_LEADER 参与操作政策 |
| `leader_ops_policy_dept_manager` | `LeadershipCoverageConstraint` | str | `"ban"` | DEPT_MANAGER 参与操作政策 |
| `objective_weight_leader_nonworkday` | `LeadershipCoverageConstraint` | int | 20 | 领导非工作日上班惩罚权重 |
| `objective_weight_leader_workday_rest` | `LeadershipCoverageConstraint` | int | 10 | 领导工作日休息惩罚权重 |
| `objective_weight_leader_ops` | `LeadershipCoverageConstraint` | int | 30 | soft 政策领导参与操作惩罚权重 |
| `objective_weight_leader_special` | `LeadershipCoverageConstraint` | int | 50 | 领导使用 SPECIAL 班惩罚权重 |
| `enable_special_shift_coverage` | `SpecialShiftJointCoverageConstraint` | bool | `True` | 特殊班联合覆盖 |

---

## 第六部分：V5 设计关键建议与风险

### 6.1 统一模块设计（已有先例，V5 应继承）

V4 已将"3 夜班子规则 + 1 软规则"合并为 `NightShiftConstraint`，将"最大连班 + 最大连休"合并为 `ConsecutiveDaysConstraint`。优点是共享初始化（`is_night_map`、`daily_map` 等），避免重复构建变量。V5 设计时应保持此模式，新增子规则应优先附加到统一模块而非新建独立模块。

### 6.2 软约束 channel 命名问题

`ctx.leadership_penalty_vars` 同时被 `LeadershipCoverageConstraint`（Rule 3/4）和 `NightShiftConstraint`（sub4 延长休息）使用，名称已名实不符。V5 应改名为 `ctx.soft_penalty_vars` 或 `ctx.penalty_terms`，并统一归入同一目标函数项。

### 6.3 HistoricalShift 的字段依赖

多个约束依赖 `HistoricalShift` 的不同字段，**缺字段不报错只是静默跳过**：

| 字段 | 使用约束 | 缺失时行为 |
|---|---|---|
| `is_night` | `NightShiftConstraint` | 历史夜班边界不处理 |
| `is_work` | `NightShiftConstraint` (NoIsolated) | 第一天边界豁免 |
| `consecutive_work_days` | `ConsecutiveDaysConstraint` | 工作边界不处理 |
| `consecutive_rest_days` | `ConsecutiveDaysConstraint` | 休息边界不处理 |

V5 的 `DataAssemblerV5` 必须保证这四个字段均正确填充，建议在 precheck 阶段校验。

### 6.4 `ConsecutiveWorkRestPatternConstraint` 的边界截断

窗口末尾 `dj >= T` 时 `break`，不强制最后一段模式完整。这意味着跨求解窗口边界的上班/休息块在视觉上可能不满足 pattern。若 V5 引入滚动求解（rolling horizon），需额外传入"历史块尾状态"并在边界处补充约束。

### 6.5 `LeadershipCoverageConstraint` 读取 `org_role` 字段

代码在 leadership_coverage.py:99 读取 `getattr(ep, "org_role", "FRONTLINE")`，而 CLAUDE.md 明确指出 `org_role` 是废弃字段（真实角色应从 `primary_role_id → employee_roles` 读取）。V4 `DataAssemblerV4` 应有专门的 mapping 将 DB 中真实角色填入 `EmployeeProfile.org_role`。V5 需确认此 mapping 逻辑不丢失，或在 V5 请求 schema 中改用新的角色字段名并更新此约束。

### 6.6 `FlexibleSchedulingConstraint` 的空位处理

`model.AddExactlyOne(placement_vars_list)` 要求任务**必须**落到一个有效槽（flexible_scheduling.py:85）。注释提到 vacancy 在 assignment 层处理，但若 `valid_dates`/`valid_shifts` 为空，则会封堵所有 assignment 变量（flexible_scheduling.py:64-66）。V5 若扩展弹性任务，需显式处理"无合法槽"的不可行提示。

### 6.7 `PreferStandardShiftConstraint` 与 FLEXIBLE 任务的一致性

PSC 在 prefer_standard_shift.py:77 显式跳过 `scheduling_mode == 'FLEXIBLE'` 的任务。若 V5 引入新的调度模式（如 `SEMI_FLEXIBLE`），PSC 的跳过逻辑需同步更新，否则可能对尚未落日期的任务错误封堵班次。

### 6.8 `SpecialShiftRequirement.fulfillment_mode` 的软约束路径

当 `fulfillment_mode != "HARD"` 时，`shortage_var` 不被强制为 0。但代码中 `shortage_var` 本身只在此约束中定义，如何进入目标函数（最小化缺口）依赖 `ctx.special_shortage_vars` 被某个 objective 模块消费。V5 需确认 `objectives/` 中有对应的 minimize_shortage 目标，否则软模式实际上等于没有约束。

---

*报告结束。覆盖文件：`registry.py`（:1-59）、`base.py`（:1-43）、`night_shift.py`（:1-425）、`night_rest.py`（遗留）、`night_shift_interval.py`（遗留）、`no_isolated_night_shift.py`（遗留）、`consecutive_days.py`（:1-321）、`consecutive_rest_limit.py`（遗留）、`consecutive_work_rest_pattern.py`（:1-282）、`flexible_scheduling.py`（:1-114）、`prefer_standard_shift.py`（:1-129）、`leadership_coverage.py`（:1-270）、`special_shift_joint_coverage.py`（:1-65）、`contracts/request.py`（:1-275）、`core/context.py`（:1-42）*
