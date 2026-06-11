# V4 求解器核心精读报告（写给 V5 实现者）

> 范围: `solver_v4/app.py`、`contracts/request.py`、`core/{solver,context,callback,precheck,index}.py`，并交叉确认了 `constraints/registry.py`、`constraints/base.py`、`objectives/base.py`、`backend/src/routes/schedulingV4.ts`。
> 所有行号基于阅读时的当前版本。代码符号保持英文。

---

## 0. 一句话架构

`Flask app.py` 接 HTTP → 解析成 `SolverRequest` dataclass → `SolverV4.solve()` 跑 6 阶段流水线（callback / precheck / 建变量 / 加约束 / 建目标 / 求解 + 结果提取）→ 同步 HTTP 返回完整结果 JSON；**同时**通过 `APICallback` 把进度/最终结果异步 POST 回 backend（带共享密钥），让前端 SSE 实时看到进度。abort 靠一个进程内全局 `ACTIVE_CALLBACKS` 字典 + monitor 线程轮询后端 status。

---

## 1. 完整 solve 流程（HTTP 请求 → 返回）

### 1.1 Flask 端点（`app.py`）

四个端点，全部在 `app.py` 内定义，`CORS(app)` 全开（`app.py:26`）：

| 端点 | 方法 | 行号 | 作用 |
|---|---|---|---|
| `/api/v4/health` | GET | `app.py:30` | 返回 `{status, version=4.0.0-alpha, service}` |
| `/api/v4/precheck` | POST | `app.py:38` | 只跑 `run_precheck`，不进求解器；返回 `{status, checks[], total_checks}` |
| `/api/v4/abort/<request_id>` | POST | `app.py:85` | 查 `ACTIVE_CALLBACKS[request_id]` → `callback.request_stop()` |
| `/api/v4/solve` | POST | `app.py:108` | 主求解端点（同步阻塞） |

**端口/启动**: `main()` 在 `app.py:214`，端口取 `PORT` → `SOLVER_V4_PORT` → 默认 `5005`；`FLASK_DEBUG=1` 开 debug。`host=0.0.0.0`。生产用 gunicorn（见 `start_all.sh`，本报告未读）。

### 1.2 `/solve` 端到端时序（`app.py:108-212`）

1. `request.get_json()` 取 payload，空则 400（`app.py:119-121`）。
2. **preview_only 判定**（`app.py:126-129`）: 从 `config.metadata.preview_only` / `config.preview_only` / `payload.preview_only` 任一为真即预览模式。`request_id = config.metadata.run_id or payload.request_id or 'N/A'`。
3. 创建 `SolveRunLogger(request_id)`（`utils/logger.py`，本报告未深入）。
4. **把整个 payload 落盘**到 `solver_v4/logs/request_{request_id}.json`（`app.py:136-141`）—— V5 调试可直接复用这份 dump。
5. `req = SolverRequest.from_dict(payload)`（`app.py:144`）—— 见 §3 schema。
6. 日志打印请求摘要 + config 开关（统计 `enable_*` 的启/禁）（`app.py:147-165`）。
7. **registry 注入**（`app.py:170-182`）: `solver = SolverV4()`；非预览时把全局 `ACTIVE_CALLBACKS` 写进 `req.config["metadata"]["registry"]`，并写 `run_id`。预览模式则 **pop 掉** `registry` 和 `run_id`（这样不会建 callback，不会回写后端，因为没有持久化的 `scheduling_runs` 记录）。
8. `result = solver.solve(req)`，`finally` 里删 `ACTIVE_CALLBACKS[request_id]` 防内存泄漏（`app.py:184-189`）。
9. 把 `solve_time`（wall）注入 `result["metrics"]`（`app.py:200-202`）。
10. `jsonify(result)` 同步返回。

错误分两类: `ValueError` → 400 `VALIDATION_ERROR`；其它 `Exception` → 500 `INTERNAL_ERROR`（`app.py:207-212`）。

### 1.3 `SolverV4.solve()` 6 阶段（`core/solver.py:49-104`）

```
config = req.config or {}
Phase 1   _init_callback(config)            → (callback, run_id)        [solver.py:110]
Phase 1.5 run_precheck(req)                 → 日志 + callback.log_metric [solver.py:61-74]
Phase 2   _build_variables(...)             → 变量元组 或 early-exit dict [solver.py:180]
Phase 3   _apply_constraints(...)           → registry 驱动             [solver.py:299]
Phase 4   _build_objectives(...)            → 加权和 Minimize           [solver.py:361]
Phase 5   _run_solver(...)                  → monitor 线程 + Solve      [solver.py:500]
Phase 6   _handle_result(...)               → 提取解 / 错误 → dict       [solver.py:580]
```

**关键**: Phase 2 若返回 `dict`（不是元组），是 INFEASIBLE early-exit（无候选人且不允许空岗），直接返回不进求解（`solver.py:77-80`）。

---

## 2. CP-SAT 决策变量结构（建在 `_build_variables`，`solver.py:180-293`）

所有变量都建在 `self.model = cp_model.CpModel()`（`solver.py:31`）。下面是 V5 必须复刻的变量字典:

### 2.1 `assignments` — 操作×岗位×员工分配（核心）
- key: `(operation_plan_id, position_number, emp_id)`，value: `BoolVar`，名 `Assign_Op{op}_Pos{pos}_Emp{emp}`（`solver.py:198-199`）。
- 只为 `position_qualifications[].candidate_employee_ids` 里的员工建变量（**预筛候选**，不是全员）。
- 每个 `(op, pos)` 的填岗逻辑（`solver.py:215-238`）:
  - `is_standalone = op.source_type == "STANDALONE"`。
  - standalone 用 `config.allow_standalone_vacancy`（默认 **True**），batch 用 `config.allow_position_vacancy`（默认 **False**）。
  - `is_mandatory = op_id in config.mandatory_operation_ids` → mandatory 强制不允许空岗。
  - 允许空岗: `Add(sum(cands) <= 1)` + 建 `var_vacant`（`Vacant_Op{op}_Pos{pos}`），用 `OnlyEnforceIf` 双向绑定 `sum==0 ⇔ vacant`，存入 `vacancy_vars[(op_id, pos_num)]`。
  - 不允许空岗: `Add(sum(cands) == 1)`（硬性必须有人）。
  - **零候选人**: 允许空岗 → `NewConstant(1)` 当 vacancy；不允许 → **直接返回** `{"status":"INFEASIBLE","message":...}`（`solver.py:234-238`）。

### 2.2 `vacancy_vars` — 空岗指示
- key: `(operation_plan_id, position_number)`，value: `BoolVar`（或 `NewConstant(1)`）。仅在允许空岗且确实建了才有条目。

### 2.3 `shift_assignments` — 员工×日期×班次（排班层）
- key: `(emp_id, date, shift_id)`，value: `BoolVar`，名 `Assign_Shift_{emp}_{date}_{shift}`（`solver.py:262-263`）。
- 仅当 `req.window` 且 `req.shift_definitions` 存在才建（`solver.py:252`）。
- `dates = get_date_range(window.start_date, window.end_date)`（`utils/time_utils`）。
- **关键优化 P0-2**: 员工集合**不是全员**，而是 `_shift_relevant_employee_ids(req, index)`（`solver.py:149-178`）。该集合 = 操作候选 ∪ 领导（`org_role ∈ LEADER_ROLES`）∪ 专项班次 `eligible_employee_ids`+`candidates` ∪ `locked_operations.enforced_employee_ids` ∪ `locked_shifts.employee_id` ∪ `frozen_shifts.employee_id` ∪ `frozen_assignments.employee_id`。
  - **V5 铁律（代码注释明确警告）**: 任何新增的「按 employee_id 点名班次/分配」的契约字段都必须并入此集合，否则该员工缺 shift 变量 → 相关硬约束（领导在岗/专项覆盖/锁定/冻结）会**静默失效**（不报错，但排出违约班次）。

### 2.4 `special_cover_vars` / `special_shortage_vars` — 专项班次
- `special_shortage_vars[occurrence_id]`: `IntVar(0, required_people)`，名 `SpecialShortage_{occ}`（`solver.py:270-274`）。
- `special_cover_vars[(occurrence_id, employee_id)]`: `BoolVar`，名 `SpecialCover_{occ}_Emp{emp}`（`solver.py:280-284`）。候选取 `requirement.candidates[].employee_id`，无则退回 `eligible_employee_ids`（`solver.py:277-279`）。

### 2.5 `task_placements` — 柔性任务落点（不在 `_build_variables`，在约束里建）
- 存于 `ctx.task_placements[(op_id, date, shift_id)]`，由 `FlexibleSchedulingConstraint.apply` 动态创建（`constraints/flexible_scheduling.py:69-77`），名 `TaskPlacement_{op}_{date}_{shift}`。`AddExactlyOne` 保证柔性任务恰好落一个 (date,shift)。结果提取时读它（`solver.py:744-758`）。

### 2.6 两个索引（`core/index.py`）
- `AssignmentIndex(assignments)`（`index.py:17`）: 单遍构建 4 个反向索引（`_by_op_emp`、`_by_emp`、`_by_op`、`_candidates_by_op`），把 O(N) 遍历变 O(1) 查询。常用方法: `get_vars_for_op_emp`、`get_assignments_for_op`、`get_candidates_for_op`、`get_all_employees`、`get_all_operations`。
- `ShiftIndex(req)`（`index.py:90`）: `shift_map`、`working_shifts`（`nominal_hours > 0.01`）、`rest_shifts`。核心方法:
  - `get_shift_interval(date, shift_id)` → `(start_ts, end_ts)` unix，夜班用 `next_day=is_night_shift` 跨天（`index.py:105-123`，带 `_interval_cache`）。
  - `get_covering_shifts(op_start, op_end, window_dates)` → 找**完全包住** `[op_start,op_end]` 的所有 `(date, shift_id)`（`sh_start <= op_start and op_end <= sh_end`，`index.py:125-153`）。这是「操作↔班次」匹配的唯一判据，V5 必须保留语义。

---

## 3. 完整请求 schema（`contracts/request.py`，逐字段）

`SolverRequest.from_dict(data)`（`request.py:194-275`）是唯一入口。所有嵌套用 dataclass，`from_dict` 手动逐层构造（**未做强类型校验，缺字段会 KeyError/TypeError 抛 ValueError 路径**）。

### 3.1 顶层 `SolverRequest`（`request.py:172-192`）
| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `request_id` | str | — | |
| `window` | `{start_date, end_date}` | — | 排班全窗口；驱动 shift 变量的日期范围 |
| `operation_demands` | `List[OperationDemand]` | — | |
| `employee_profiles` | `List[EmployeeProfile]` | — | |
| `calendar` | `List[CalendarDay]` | — | |
| `shift_definitions` | `List[ShiftDefinition]` | — | |
| `shared_preferences` | `List[SharedPreference]` | — | 共享组 |
| `special_shift_requirements` | `List[SpecialShiftRequirement]` | `[]` | |
| `locked_operations` | `List[LockedOperation]` | `[]` | |
| `locked_shifts` | `List[LockedShift]` | `[]` | |
| `historical_shifts` | `List[HistoricalShift]` | `[]` | 边界约束用 |
| `resources` | `List[Resource]` | `[]` | 资源（当前求解器主要建模人员，资源字段多为透传/预留） |
| `resource_calendars` | `List[ResourceCalendarEntry]` | `[]` | |
| `operation_resource_requirements` | `List[OperationResourceRequirement]` | `[]` | |
| `maintenance_windows` | `List[MaintenanceWindow]` | `[]` | |
| `solve_range` | `{start_date, end_date}` 或 None | None | 求解**子区间**（窗口内只解一段，区间外靠 frozen 固化） |
| `frozen_shifts` | `List[FrozenShift]` | `[]` | 区间外已有班次快照 |
| `frozen_assignments` | `List[FrozenAssignment]` | `[]` | 区间外已有分配快照 |
| `config` | `Dict` 或 None | None | 所有开关/权重（见 §6） |

### 3.2 `OperationDemand`（`request.py:15-34`）
`operation_plan_id, batch_id, batch_code, operation_id, operation_name, planned_start, planned_end, planned_duration_minutes, required_people, position_qualifications: List[PositionQualification]`，外加柔性扩展:
- `scheduling_mode`（默认 `"FIXED"` | `"FLEXIBLE"`）
- `earliest_start` / `deadline`（FLEXIBLE 窗口，如 `"2026-02-01"`）
- `source_type`（默认 `"BATCH"` | `"STANDALONE"`）
- `standalone_task_id`
- `preferred_shift_ids: List[int]`（柔性任务允许班次）

### 3.3 `PositionQualification`（`request.py:9-13`）
`position_number, qualifications: List[{qualification_id, min_level, is_mandatory}], candidate_employee_ids: List[int]`（**后端已预筛的候选人**，求解器只为这些人建变量）。

### 3.4 `EmployeeProfile`（`request.py:37-44`）
`employee_id, employee_code, employee_name, qualifications: List[{qualification_id, level}], unavailable_periods: List[{start_datetime, end_datetime}], org_role`（默认 `"FRONTLINE"`，枚举 `FRONTLINE|SHIFT_LEADER|GROUP_LEADER|TEAM_LEADER|DEPT_MANAGER`）。注: `org_role` 在主仓 CLAUDE 记忆中标注为废弃字段（真实角色走 `primary_role_id`），但**求解器目前确实读它**判定领导。

### 3.5 班次/日历
- `ShiftDefinition`（`request.py:72-81`）: `shift_id, shift_code, shift_name, start_time, end_time, nominal_hours: float, is_night_shift: bool, plan_category`（默认 `"STANDARD"`，另有 `SPECIAL`/`TEMPORARY`）。`nominal_hours <= 0.01` 视为休息班（REST）。
- `CalendarDay`（`request.py:66-70`）: `date, is_workday, is_triple_salary`。

### 3.6 共享/锁定/冻结/历史
- `SharedPreference`（`request.py:83-88`）: `share_group_id, share_group_name, members: List[{operation_plan_id, required_people}], share_mode`（默认 `"SAME_TEAM"`）。
- `LockedOperation`（`request.py:90-93`）: `operation_plan_id, enforced_employee_ids`。
- `LockedShift`（`request.py:95-100`）: `employee_id, date, plan_category`（默认 `"WORK"`）, `shift_id?`。
- `FrozenShift`（`request.py:102-107`）: `employee_id, date, shift_id`。
- `FrozenAssignment`（`request.py:109-114`）: `operation_plan_id, position_number, employee_id`。
- `HistoricalShift`（`request.py:116-124`）: `employee_id, date, is_work, is_night, consecutive_work_days, consecutive_rest_days`（连续工作/休息边界约束用）。

### 3.7 专项班次
- `SpecialShiftRequirement`（`request.py:46-59`）: `occurrence_id, window_id, date, shift_id, required_people, eligible_employee_ids, window_code?, fulfillment_mode`（默认 `"HARD"`）, `priority_level`（默认 `"HIGH"`）, `candidates: List[SpecialShiftCandidate]`, `plan_category`（默认 `"BASE"`）, `lock_after_apply`（默认 True）。
- `SpecialShiftCandidate`（`request.py:61-64`）: `employee_id, impact_cost`（默认 0，进影响目标）。

### 3.8 资源类（多为透传，求解器当前少用）
`Resource`（`request.py:126-140`）、`ResourceCalendarEntry`（`142-150`）、`OperationResourceRequirement`（`152-161`，含 `prep_minutes/changeover_minutes/cleanup_minutes`）、`MaintenanceWindow`（`163-170`）。

---

## 4. 约束/目标的注册与调用机制

### 4.1 约束 registry（`constraints/registry.py`）
两段式列表，**按列表顺序应用**:
- `CORE_CONSTRAINTS`（`registry.py:35-42`，与 shift 无关）: `FrozenRangeConstraint`(必须第一，钉住 solve_range 外变量) → `ShareGroupConstraint` → `UniqueEmployeeConstraint` → `LockedOperationsConstraint` → `OnePositionConstraint` → `EmployeeAvailabilityConstraint`。
- `SHIFT_CONSTRAINTS`（`registry.py:45-56`，需 `shift_assignments`）: `LockedShiftsConstraint` → `ShiftAssignmentConstraint` → `LeadershipCoverageConstraint` → `FlexibleSchedulingConstraint` → `ConsecutiveDaysConstraint` → `StandardHoursConstraint` → `NightShiftConstraint` → `SpecialShiftJointCoverageConstraint` → `PreferStandardShiftConstraint` → `ConsecutiveWorkRestPatternConstraint`(默认 OFF)。

### 4.2 约束基类接口（`constraints/base.py`）
`BaseConstraint(ABC)`，类属性: `name`、`config_key`（如 `"enable_share_group"`，空串=不可关闭恒开）、`default_enabled`。唯一抽象方法:
```python
def apply(self, ctx: SolverContext, data: SolverRequest) -> int   # 返回新增约束条数
```
`__init__(logger)`，`log(message, level)` 加 `[name]` 前缀。

### 4.3 约束调用（`solver.py:299-355`）
1. 建统一 `SolverContext`（见 §5），存到 `self.solver_context`。
2. `from constraints.registry import CORE_CONSTRAINTS, SHIFT_CONSTRAINTS`。
3. 对每个 `cls`: `enabled = config.get(cls.config_key, cls.default_enabled) if cls.config_key else True`；启用则 `count = cls(logger=logger).apply(ctx, req)`，否则记 `"OFF"`。
4. `shift_assignments` 为空时**跳过整个 Phase 2**（`solver.py:338-339`）。
5. 结果汇总成中文行通过 `callback.log_section` 推前端。

**V5 加约束方法（注释明示）**: 新建约束类（带 `config_key`/`default_enabled`）→ import 并 append 到 registry → 完事，**不改 solver.py**。

### 4.4 目标基类与调用（`objectives/base.py` + `solver.py:361-494`）
`ObjectiveBase(ABC)`: 类属性 `name`、`weight`；抽象方法 `build_expression(model, shift_assignments, data) -> Optional[LinearExpr]`。
> 注意: 目标基类签名只是约定，**实际各目标 `build_expression` 签名并不一致**（如 `MinimizeVacanciesObjective.build_expression(model, vacancy_vars, data, op_metadata)` 多一个 `op_metadata` 参数，`objectives/minimize_vacancies.py:23-29`）。`_build_objectives` 对每个目标手写调用，不是统一循环。V5 若想统一，需先收敛签名。

目标按**加权和**拼进 `model.Minimize(sum(objective_terms))`（`solver.py:488-489`）。各项与权重 config key（`solver.py:367-485`）:

| 顺序 | 目标类 | 触发条件 | 权重 config key（默认） |
|---|---|---|---|
| O0 专项欠配(最高软优先) | `MinimizeSpecialCoverageShortageObjective` | 有 `special_shortage_vars` | 硬编 1（无权重 key，直接入项） |
| O1 岗位填报 | `MinimizeVacanciesObjective` | `vacancy_vars` 非空 | 内部 `objective_weight_vacancy`(10000)/`objective_weight_standalone_vacancy`(5000)/`off_hours_multiplier`(1.5) |
| O2 专项工艺影响 | `MinimizeSpecialCoverageImpactObjective` | 有 `special_cover_vars` | `objective_weight_special_coverage_impact`(1) |
| O3 工时偏差 | `MinimizeHoursDeviationObjective` | `enable_minimize_deviation`(True) & shift | `objective_weight_deviation`(1) |
| O4 特殊班次 | `MinimizeSpecialShiftsObjective` | `enable_minimize_special_shifts`(True) & shift | `objective_weight_special_shifts`(100) |
| O5 夜班均衡 | `BalanceNightShiftsObjective` | `enable_balance_night_shifts`(True) & shift | `objective_weight_night_balance`(5) |
| O6 周末均衡 | `BalanceWeekendWorkObjective` | `enable_balance_weekend_work`(True) & shift | `objective_weight_weekend_balance`(5) |
| O7 三倍薪日 | `MinimizeTripleSalaryCostObjective` | `enable_minimize_triple_salary`(True) & shift | `objective_weight_triple_salary`(10) |
| O8 管理岗软偏好 | 直接读 `ctx.leadership_penalty_vars` 求和 | `enable_leadership_coverage`(True) & 有 penalty | 权重内嵌在 `(var, weight)` 元组 |

注: 权重在 `solver.py:409-414` 读取。`objective_value / 100` 当 `total_deviation_hours`（`solver.py:811-813`），说明工时偏差以「分钟级整数×100」为基础尺度——V5 改权重量级时要留意这个隐含约定。

---

## 5. `SolverContext`（`core/context.py`）

所有约束/目标共享的参数容器（dataclass，`context.py:13-41`），消除了不一致的 `apply()` 签名:
- `model`、`assignments`、`index: AssignmentIndex`（必填）。
- `shift_assignments`、`shift_index: ShiftIndex`（无窗口时空/None）。
- `vacancy_vars`、`special_cover_vars`、`special_shortage_vars`。
- `task_placements`（柔性任务落点，约束动态填）。
- `config`（= `req.config`）。
- `leadership_penalty_vars: list`——**软约束惩罚的共享通道**: 元素为 `(var, weight)` 元组，生产者有 `LeadershipCoverageConstraint`、`NightShiftConstraint`（加长休息）等，由 `_build_objectives` 的 O8 统一求和入目标。V5 若做软约束，沿用这个通道是最省事的扩展点。

---

## 6. config 开关全清单（从代码反查）

**约束开关**（`config.get(config_key, default_enabled)`，键名为各约束类的 `config_key`，逐个去对应模块确认。已知）:
- `enable_shift_assignment`(True)、`enable_flexible_scheduling`(True)、`enable_leadership_coverage`(True)、`enable_leader_production_coverage`(True, Rule1)。
- 领导每角色策略: `leader_ops_policy_group_leader`(默认 `soft`)、`leader_ops_policy_team_leader`(默认 `ban`)、`leader_ops_policy_dept_manager`(默认 `ban`)，值 ∈ `{allow, soft, ban}`（`constraints/leadership_coverage.py:44-60`）。
- `enable_standard_hours`(precheck 也读，默认 True)。

**空岗/必做**（`solver.py:192,209-213`）:
- `allow_position_vacancy`(False, batch)、`allow_standalone_vacancy`(True, standalone)、`mandatory_operation_ids`(list)。
> 历史坑（主仓记忆）: `allow_standalone_vacancy` 曾是「死开关」（config 透传但 solver 不消费），现已在 `_build_variables` 消费，V5 切勿回退。

**时间/停止**（`solver.py:112-113,503-504`）:
- `max_time_seconds`(300)、`stagnation_limit`(90)。

**目标权重**: 见 §4.4 表格。

**metadata**（`config["metadata"]`）: `run_id`、`registry`（app 注入的 `ACTIVE_CALLBACKS` 引用）、`preview_only`、`_op_count`（仅日志）。

---

## 7. 进度回调协议（`core/callback.py` + backend route）

`APICallback(cp_model.CpSolverSolutionCallback)`（`callback.py:11`）。仅当 `run_id` 存在才创建（`solver.py:120-132`）。

### 7.1 目标 URL
- 进度基址 `SOLVER_API_URL = env BACKEND_API_URL or "http://localhost:3001/api/v4/scheduling/callback/progress"`（`solver.py:26`）。
- 由 `api_url` 派生（`callback.py:71-73, 388-390`）:
  - 进度 POST: `…/callback/progress`
  - 结果 POST: `base.replace("/callback/progress","") + "/callback/result"` → `…/callback/result`
  - 状态轮询 GET: `api_url.split("/callback/progress")[0] + "/runs/{run_id}/status"` → `…/runs/{run_id}/status`
- backend 实际路由（`backend/src/routes/schedulingV4.ts`，挂在 `/api/v4/scheduling`，`server.ts:165`）:
  - `POST /callback/progress` → `updateSolveProgressV4`（`schedulingV4.ts:42`）
  - `POST /callback/result` → `receiveSolveResultV4`（`schedulingV4.ts:45`）
  - `GET /runs/:runId/status` → `getSolveStatusV4`（`schedulingV4.ts:75`）

### 7.2 鉴权
- 共享密钥 env `SOLVER_CALLBACK_SECRET`（`callback.py:32`）。请求头 `X-Solver-Callback-Token: <secret>`（`_auth_headers`，`callback.py:244-249`）。
- backend 端 `requireServiceAuth` 用 `timingSafeEqual` 校验该 header（`schedulingV4.ts:42/45/75`）；`/callback/*` 与 `/runs/:id/status` 被 `server.ts` 排除在全局人类 JWT 之外（`server.ts:121-127`）。
- 未配置密钥时不带 header，新版 backend 直接 **401**（进度/结果无法回写），仅 console warn（`callback.py:33-37`）。
> V5 必须沿用同一密钥与 header 名，否则进度/结果静默丢失。

### 7.3 progress payload（`_send_now`，`callback.py:284-316`）
固定 `{run_id, status, type}`，可选 `progress, metrics, message, log_line`。`type` 取值: `STATUS`/`SOLUTION`/`LOG`/`FINAL`/`INFO`。`status` 取值: `RUNNING`/`COMPLETED`/`FAILED`。
- 新解（`on_solution_callback`，`callback.py:108-120`）: `type="SOLUTION"`，`status="RUNNING"`，`metrics={solution_count, objective_value, best_bound, gap, wall_time}`，`log_line` 为「发现新方案 #n …」。
- POST 用 `timeout=2`，失败重试 2 次、间隔 0.5s（仅 Timeout 重试，其它错误立即放弃，`callback.py:303-316`）。

### 7.4 频率与异步推送（**V5 必须复刻的并发模型**）
- **不在 CP-SAT worker 线程同步发 HTTP**（避免阻塞求解）。求解期 `begin_deferred()`（`callback.py:275`）把 `_defer_sends=True`；`push_progress` 只写内存（`_latest_solution` 仅留最新解、`_pending` 按序留 LOG），由后台 monitor 线程每 1s `flush()` 实发（`callback.py:251-273`）。
- monitor 线程 `_monitor_loop`（`solver.py:540-573`）每 1s: `cb.flush()` → 检查 `should_stop` → 每 5s `log_heartbeat` → 超 `max_time_seconds` 则 `request_stop` → gap 有解且停滞超 `stagnation_limit` 则 `request_stop` → 每 `poll_interval`(5s) `poll_server_stop()` 轮询后端 status。
- `end_deferred()`（`callback.py:279`）退出求解期、发完残留、恢复同步（之后 final/result_summary 直接发）。

### 7.5 最终结果回写（`push_final_result`，`callback.py:353-404`）
1. 先 POST `…/callback/progress`，`type="FINAL"`，`status=COMPLETED|FAILED`（依 `result.status ∈ {OPTIMAL,FEASIBLE,FEASIBLE (Forced)}`），`progress=100`，带 `metrics`。
2. 再 POST `…/callback/result`，`{run_id, result}`（完整 result JSON，`timeout=30`，存 `result_summary`）。这条是「即使主 HTTP 响应失败也能落库」的保险。

---

## 8. 求解结果 payload 完整结构（`_extract_solution`，`solver.py:668-920`）

返回 dict（成功）:
```jsonc
{
  "status": "OPTIMAL" | "FEASIBLE",
  "schedules": [                     // 班次锚定：每个员工每个被排班次一条
    {
      "employee_id", "date",
      "shift": { "shift_id","name","code","start"(ISO Z),"end"(ISO Z),"is_night" },
      "tasks": [ { "operation_id","operation_name","batch_code","position_number","start","end" } ]
    }
  ],
  "unassigned_jobs": [               // 分到人但找不到覆盖班次的「孤儿任务」
    { "operation_id","position_number","employee_id","reason" }
  ],
  "special_shift_assignments": [ { "occurrence_id","employee_id","date","shift_id" } ],
  "special_shift_shortages":   [ { "occurrence_id","shortage_people" } ],
  "share_group_compliance": [        // 共享组合规自检（事后核验，非约束）
    { "group_id","group_name","compliant"(bool),"violations":[...],"teams":{ "op_id":[emp...] } }
  ],
  "metrics": {
    "assigned_count", "scheduled_shifts", "total_deviation_hours",
    "objective_value", "best_bound", "gap"(百分比,2位),
    "vacant_positions", "total_positions", "fill_rate"(百分比,2位),
    "special_shift_shortage_total",
    "solve_time"                     // 由 app.py 注入（wall）
  }
}
```

**提取要点**:
- 用 `get_var_value(key, var)`（`solver.py:679-686`）: 优先 `solver.Value(var)`，RuntimeError 则退回 `cached_solution`；`use_cache_only=True` 时只读 cache。
- schedules 骨架先从 `shift_assignments==1` 建（`solver.py:695-720`），shift 区间转 UTC ISO（带 `Z`）。
- task 挂载分两路（`solver.py:728-796`）: FLEXIBLE 读 `ctx.task_placements`，FIXED 用 `shift_index.get_covering_shifts` 缓存匹配；挂不上 → 进 `unassigned_jobs`（reason 见代码）。
- gap = `|obj-bound|/|obj|*100`；`total_deviation_hours = objective_value/100`（`solver.py:805-813`）。
- `share_group_compliance`（`solver.py:854-899`）: 对每组按 `required_people` 升序排序，小队必须是大队子集 / 同规模队必须相等，否则记 violation——纯事后核验。

错误/无解返回（`_handle_result`，`solver.py:580-662`）:
- INFEASIBLE/MODEL_INVALID: callback 推中文建议；返回 `{status: status_name, schedules:[], unassigned_jobs:[]}`。
- 求解器状态非 OPTIMAL/FEASIBLE 但 callback 有解 → **强制 FEASIBLE**（`solver.py:603-606`，超时/中断仍返回已找到最佳解）。
- `solver.Value()` RuntimeError 且有缓存 → 用缓存重抽（`use_cache_only=True`）；无缓存 → `{status:"FAILED_TO_EXTRACT", metrics:{solution_count,best_objective}}`。
- 早期无候选 INFEASIBLE（Phase 2）: `{status:"INFEASIBLE", message}`。

---

## 9. precheck（`core/precheck.py`）

纯 Python，无 CP-SAT，目标 <1ms，config-aware（`run_precheck`，`precheck.py:37-65`）。返回 `List[PrecheckIssue(severity, check_name, message, details)]`，`severity ∈ {ERROR, WARNING}`。四个检查:
1. `_check_candidate_coverage`（`precheck.py:68`）: 每个 op×pos，统计在该操作**所有日期都可用**的候选人；0 候选 → 不允许空岗(`allow_position_vacancy=False`)记 ERROR，允许记 WARNING。`check_name="CandidateZeroCoverage"`。
2. `_check_single_point_failure`（`precheck.py:132`）: 候选人恰好 1 个 → WARNING（单点故障）。
3. `_check_date_overload`（`precheck.py:169`）: 逐日 `sum(required_people)` vs 可用员工数，超出记 WARNING。
4. `_check_standard_hours_bound`（`precheck.py:222`）: `enable_standard_hours` 开时，员工 `可用天数×最长班 nominal_hours < (standard_hours - standard_hours_delta)` → WARNING。

调用点两处: `/precheck` 端点（`app.py:51-52`，纯校验不求解）、`solve()` Phase 1.5（`solver.py:61-74`，错误/警告进日志+callback，**不阻断求解**，仅前 5 条警告推 callback）。

---

## 10. CP-SAT 求解参数（`SolverV4.__init__`，`solver.py:30-43`）

| 参数 | 值 | 来源 |
|---|---|---|
| `log_search_progress` | `env SOLVER_DEBUG=="1"` | `solver.py:36` |
| `num_workers` | `env SOLVER_WORKERS` 或 `max(4, cpu_count-2)`（留 2 核给系统/backend/MySQL/codex） | `solver.py:38-39` |
| `linearization_level` | `2` | `solver.py:40` |
| `symmetry_level` | `2` | `solver.py:41` |
| `absolute_gap_limit` | `0.99`（目标为整数，绝对 gap<1 即最优，让 C++ 层自动终止） | `solver.py:43` |
| `max_time_in_seconds` | 有 callback: `max_time_seconds + 10.0`；无 callback: `max_time_seconds` | `solver.py:506/535` |

求解执行（`_run_solver`，`solver.py:500-538`）: 有 callback 时 `register_variables`(assignments/shift/vacancy/special_cover/special_shortage 全注册以便缓存) → 起 monitor 线程 → `begin_deferred` → `solver.Solve(model, callback)` → `finally` 置 `stopping_event`、join 线程、`end_deferred`。无 callback 时 `solver.Solve(model)` 裸跑。

**双层提前停止**（两套并行）:
- callback 内 `on_solution_callback`（`callback.py:75-141`）: 每发现新解算 gap；`abs(obj-bound)<0.99` 或 `gap<0.01%` → `StopSearch`；`_should_stop_now`（`callback.py:154-191`）含外部停止、硬超时、深停滞(`>stagnation_limit`)、智能停滞(gap<5% 且 30s 无改进)。
- monitor 线程（`solver.py:540-573`）: 同样判超时/停滞/外部信号，调 `request_stop`。

---

## 11. abort 实现（`app.py:82-106` + `callback.py:227-242`）

1. 进程内全局 `ACTIVE_CALLBACKS = {}`（`app.py:83`），`/solve` 处理时把 callback 注册进去（`solver.py:129-132`，key=`str(run_id)`），`finally` 删除（`app.py:188-189`）。
2. `POST /api/v4/abort/<request_id>`（`app.py:85`）: 查表拿 callback → `callback.request_stop("API Abort Request")`；查不到返回 404。
3. `request_stop`（`callback.py:227-242`）: 置 `should_stop=True` + `_stop_reason`，并**直接** `self._solver.StopSearch()`（`set_solver` 在 `solver.py:126` 注入 solver 引用）立即停。
4. **第二条 abort 路径**: backend 把 run 状态置 `STOPPING/STOPPED`，monitor 线程每 5s `poll_server_stop()`（`callback.py:318-331`）GET status 命中后 `request_stop`。即前端「停止」按钮→backend 改状态→solver 轮询感知。

> **abort 的进程边界陷阱（V5 关键）**: `ACTIVE_CALLBACKS` 是**单进程内存字典**。若 V5 用 gunicorn 多 worker，`/abort` 命中的 worker 不一定是跑 `/solve` 的那个，直接 abort 会 404 失效——必须靠「backend 改 status + solver 轮询」这条跨进程路径，或改用共享存储（Redis 等）。

---

## 12. 给 V5 的设计提示（综合）

- **同步阻塞模型**: `/solve` 是长阻塞 HTTP（求解几分钟内同步占着连接）。gunicorn 需配足够 worker/超时，否则求解中途被 worker 超时杀掉。V5 可考虑改为「`/solve` 立即返回 run_id + 全程异步回调」。
- **变量集合收窄**是性能命脉，但也是静默 bug 温床（§2.3 铁律）。V5 若重构候选筛选，务必有测试覆盖「领导/专项/锁定/冻结员工是否都建了 shift 变量」。
- **目标函数签名不统一**（§4.4），`_build_objectives` 是手写胶水。V5 想做注册表式目标，先统一 `build_expression` 签名（统一传 `ctx`）。
- **gap/尺度耦合**: `total_deviation_hours = objective_value/100` 隐含「工时偏差以 ×100 整数编码」；动权重时别破坏整数最优判据（`absolute_gap_limit=0.99`）。
- **结果是「班次锚定」结构**（schedules→tasks 嵌套），前端依赖此形状；改 payload 形状要同步 `frontend/src/components/SolverV4/`。
- **预览模式**（`preview_only`）不建 callback、不回写后端、纯同步返回——V5 要保留这个旁路。
