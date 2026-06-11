# V4 系统全景图 + V5 机会点（综合文档）

> 综合自本目录 7 份调研报告（01_solver_core / 02_constraints_a / 03_constraints_b / 04_objectives / 05_backend_chain / 06_frontend / 07_docs_tests），并对存疑点抽查源码核实。
> 目标：让 V5 实现者在**不改动 solver_v4** 的前提下，新建 solver_v5 + 后端链路 + 精细前端（核心新增：求解过程图形可视化；加分项：无解原因分析），且**求解结果不能比 V4 差，使用体验不大幅改变**。
> 编写日期：2026-06-11，基于 commit a237777（main）。代码符号保持英文。

---

## 1. V4 端到端流程图（文字版）

下面这条链路横跨前端 / 后端 / 求解器三个服务。每一跳标注**触发文件**与**协议**。V5 必须逐跳镜像（绝大多数原样复刻），只在标 `[V5 扩展点]` 处加料。

```
① 用户点击「确认并排班」
   前端 OperationReviewModal.tsx → fetch
   POST /api/v4/scheduling/solve  body={batch_ids, start_date, end_date, config:SolverConfig}
   协议: HTTP JSON（相对路径，经 setupProxy 转发到 backend:3001）

② 后端建 run + 立即返回 runId（异步求解）
   backend routes/schedulingV4.ts → controllers/schedulingV4/solveOrchestrator
   - createRunRecord → INSERT scheduling_runs (run_code='V4-{ts}', status=QUEUED, summary_json.scope 快照)
   - 立即 res.json({ data:{ runId } })，前端拿到 runId 打开进度弹窗
   - triggerSolveAsync(...) 异步起飞（不阻塞响应）

③ 后端组装求解请求（DataAssemblerV4）
   backend/src/services/schedulingV4/DataAssemblerV4.ts
   - status=RUNNING, stage=ASSEMBLING
   - Promise.all 并行读 ~12 张 DB 表（见 §2.5），候选人在此**预筛**（资质+不可用时间）
   - 工厂时区固定 +08:00，planned_start/end UTC 化 → V4SolverRequest
   - 区间求解时追加 solve_range / frozen_shifts / frozen_assignments

④ 后端 → 求解器（同步阻塞 HTTP，10 分钟网络超时）
   triggerSolveAsync → fetch POST {SOLVER_V4_URL}/api/v4/solve
   协议: HTTP JSON；AbortController + setTimeout(10min)
   - config.metadata.run_id 注入；solver 据此决定是否回调

⑤ 求解器 6 阶段流水线
   solver_v4/app.py:/solve → SolverV4.solve()  (core/solver.py:49)
   - 落盘 logs/request_{id}.json（V5 调试可复用）
   Phase1 _init_callback → APICallback（仅 run_id 存在时建）
   Phase1.5 run_precheck（纯 Python，不阻断）
   Phase2 _build_variables（无候选+不许空岗 → INFEASIBLE early-exit dict）
   Phase3 _apply_constraints（registry 驱动，CORE→SHIFT 两段）
   Phase4 _build_objectives（加权和 → model.Minimize）
   Phase5 _run_solver（monitor 线程 + solver.Solve(model, callback)）
   Phase6 _handle_result / _extract_solution → result dict

⑥ 求解器 → 后端：进度回调（求解期间，每 1s flush）
   solver_v4/core/callback.py → POST {BACKEND_API_URL}/api/v4/scheduling/callback/progress
   协议: HTTP JSON + header X-Solver-Callback-Token=SOLVER_CALLBACK_SECRET
   - 并发模型: 不在 CP-SAT worker 线程同步发 HTTP；begin_deferred() 期间只写内存，
     monitor 线程每 1s flush()（只留最新解 + 按序 LOG）。这是 V5 必须复刻的并发模型。
   - backend updateSolveProgressV4 → UPDATE scheduling_runs.solver_progress (JSON_MERGE_PATCH)
     + JSON_ARRAY_APPEND logs → progressEmitter.emit('run:{id}')

⑦ 后端 → 前端：SSE 实时进度
   backend getSolveProgressSSEV4: GET /api/v4/scheduling/runs/{runId}/progress
   协议: SSE，命名事件 'progress'（前端必须 addEventListener('progress')）
   - 双路: progressEmitter 实时 + setInterval(5s) 兜底轮询 DB
   - payload: { status, stage, error, solver_progress:{progress, metrics, message, logs[]} }
   前端 SolveProgressV4Modal.tsx 消费 → 进度条 + KPI 卡 + 实时日志面板

⑧ 求解器 → 后端：最终结果回写（双保险）
   callback.push_final_result:
   - POST …/callback/progress  type=FINAL status=COMPLETED|FAILED progress=100
   - POST …/callback/result    {run_id, result(完整JSON)}  timeout=30
   backend receiveSolveResultV4 → saveResults(UPDATE result_summary+summary_json)
     → updateRunStatus(COMPLETED|FAILED, stage=DONE) → emit SSE DONE
   （同时主 HTTP ④ 也会返回完整 result；两条路径有竞态保护：DB 已 COMPLETED 则跳过 FAILED）

⑨ 前端展示结果
   SolveProgressV4Modal「查看结果」→ SolveResultV4Page.tsx（100vw 全屏抽屉）
   GET /api/v4/scheduling/runs/{runId}/result → 富化 ResultData（含员工名/班次定义/资质）
   - 顶部 KPI 横排（前端实时计算质量分/均衡指数）
   - Tab: 排班矩阵(ScheduleMatrix, react-window) | 操作分配明细(AssignmentsView)
   - 可人工编辑班次/派工（editHistory 撤销栈）+ 导出 Excel/PDF

⑩ 用户应用结果（事务落库）
   POST /api/v4/scheduling/runs/{runId}/apply → applyResultController.ts
   单事务: scope-aware DELETE（保留 is_locked 行）→ INSERT bpa/esp/standalone/special
   → UPDATE scheduling_runs.status=APPLIED
   - 结果格式双轨兼容: rawResult.schedules（新）vs rawResult.assignments+shift_schedule（旧）

辅助旁路（不创建 run、不落库）:
   - 预检 POST /precheck → 30s 转发 solver /api/v4/precheck
   - 纯预览 POST /preview-proposal → 60s 转发 solver /api/v4/solve（config.metadata.preview_only=true）
   - 停止 POST /runs/{id}/stop → backend 改 status=STOPPING + 向 solver POST /abort
   - solver 轮询 GET /runs/{id}/status（poll_server_stop，跨进程 abort 的可靠路径）
```

**抽查核实结论**（与报告一致，无偏差）：
- callback `_send_now` payload 字段实测为 `{run_id, status, type}` + 可选 `progress/metrics/message/log_line`（`callback.py:289-302`）——V5 事件流必须**向后兼容**这套字段，扩展只能加字段不能改名。
- solver 参数实测：`num_workers=max(4,cpu-2)`、`linearization_level=2`、`symmetry_level=2`、`absolute_gap_limit=0.99`、`log_search_progress=env SOLVER_DEBUG`（`solver.py:35-43`）。
- **整个 solver 源码（core/constraints/objectives/contracts/app.py）零处** `AddAssumption` / `AddHint` / warm start / `ResponseStats` / `num_branches` / `num_conflicts` / `presolve` 引用——这四类（无解定位 / 解提示 / 暖启动 / 搜索统计）全是 V5 的**绿地**，不会与 V4 冲突。

---

## 2. 完整清单表

### 2.1 约束模块清单（16 个注册 + 4 个废弃）

注册顺序严格有意义。`config_key` 空串=不可关闭恒开。硬/软见末列。

| # | 阶段 | 类名 | config_key | 默认 | 硬/软 | 含义（一句话） |
|---|---|---|---|---|---|---|
| 1 | CORE | FrozenRangeConstraint | `""` | on | 硬 | **必须第一**：区间求解时钉死 solve_range 外的班次/分配变量 |
| 2 | CORE | ShareGroupConstraint | `enable_share_group` | on | 硬 | 共享组内工序按人数升序成链：子集/等集合蕴含（Union-Find 合传递性）|
| 3 | CORE | UniqueEmployeeConstraint | `enable_unique_employee` | on | 硬 | 时间重叠工序互斥（扫描线找最大团），豁免同共享组 |
| 4 | CORE | LockedOperationsConstraint | `enable_locked_operations` | on | 硬 | 锁定工序的 enforced_employee 必须分配；非候选→直接 INFEASIBLE |
| 5 | CORE | OnePositionConstraint | `enable_one_position` | on | 硬 | 同员工在同工序最多担一岗（仅多岗工序生效）|
| 6 | CORE | EmployeeAvailabilityConstraint | `enable_employee_availability` | on | 硬 | 不可用时段封锁分配变量（防御性安全网，静默封锁）|
| 7 | SHIFT | LockedShiftsConstraint | `enable_locked_shifts` | on | 硬 | 锁定某员工某天班次（REST 自动解析）；`strict_locked_shifts`(默false) 决定缺班次是否 INFEASIBLE |
| 8 | SHIFT | ShiftAssignmentConstraint | `enable_shift_assignment` | on | 硬 | 每人每天恰一班次 + 分配↔覆盖班次正向蕴含（FLEXIBLE 跳过）|
| 9 | SHIFT | LeadershipCoverageConstraint | `enable_leadership_coverage` | on | 混合 | Rule1/2 硬（生产日领导在岗 / ban 政策封锁），Rule3/4 软 |
| 10 | SHIFT | FlexibleSchedulingConstraint | `enable_flexible_scheduling` | on | 硬 | FLEXIBLE 任务在 [earliest,deadline] 内 AddExactlyOne 落一个(date,shift)|
| 11 | SHIFT | ConsecutiveDaysConstraint | `""`（子规则各开关）| on | 硬 | 最大连续工作日(默6)+最大连续休息日(默4)滑动窗口+历史边界 |
| 12 | SHIFT | StandardHoursConstraint | `enable_standard_hours` | on | 硬 | 月度工时 H8 上限(+32h)/H9 下限(-4h)，按月分桶，工时×100 整数 |
| 13 | SHIFT | NightShiftConstraint | `""`（4 子规则各开关）| on | 混合 | 夜班后休息/禁孤立夜班/夜班间隔（硬）+ 软性延长休息（软）|
| 14 | SHIFT | SpecialShiftJointCoverageConstraint | `enable_special_shift_coverage` | on | 混合 | 专项班次覆盖：cover_var↔shift 联动 + shortage 平衡；HARD 时 shortage==0 |
| 15 | SHIFT | PreferStandardShiftConstraint | `enable_prefer_standard_shift` | on | 硬 | 当天所有任务都能被 STANDARD 班覆盖时，禁用 SPECIAL 班 |
| 16 | SHIFT | ConsecutiveWorkRestPatternConstraint | `enable_consecutive_work_rest_pattern` | **off** | 硬 | 强制「N 连上 + M 连休」模式（仅操作候选员工）|

**废弃文件（在磁盘但未注册，V5 不要复用）**：`night_rest.py`、`night_shift_interval.py`、`no_isolated_night_shift.py`（均被 `NightShiftConstraint` 子规则取代）、`consecutive_rest_limit.py` + `work_days_limit.py`（被 `ConsecutiveDaysConstraint` 取代）。

**新约束扩展契约（注释明示）**：建类设 `config_key`/`default_enabled` → append 到 registry 列表 → **不改 solver.py**。`apply(ctx, data) -> int` 返回新增约束条数。软约束不返回计数，而是向 `ctx.leadership_penalty_vars` 追加 `(var, weight)`。

### 2.2 目标清单（9 项，单层加权求和）

无 Lexicographic，无 Pareto，**纯权重差形成优先级**。`model.Minimize(sum(objective_terms))`。

| 编号 | 目标类 | 触发条件 | 权重 config key（默认）| 量纲/优先级 |
|---|---|---|---|---|
| O0 | MinimizeSpecialCoverageShortage | 有 special_shortage_vars | 硬编 PRIORITY_WEIGHTS（CRITICAL 200000/HIGH 100000/NORMAL 50000）| **最高**，每缺 1 人 5万~20万 |
| O1 | MinimizeVacancies | vacancy_vars 非空 | `objective_weight_vacancy`(10000)/`_standalone_vacancy`(5000)/`off_hours_multiplier`(1.5)| 第二高，每空缺 1万~3万 |
| O2 | MinimizeSpecialCoverageImpact | 有 special_cover_vars | `objective_weight_special_coverage_impact`(1)| 极低，几乎被掩盖 |
| O3 | MinimizeHoursDeviation | `enable_minimize_deviation`(on)&shift | `objective_weight_deviation`(1)| 极低（×100 缩放后权重 1，实际近乎无效）|
| O4 | MinimizeSpecialShifts | `enable_minimize_special_shifts`(on)&shift | `objective_weight_special_shifts`(100)| 每个 SPECIAL 班次 ×100 |
| O5 | BalanceNightShifts | `enable_balance_night_shifts`(on)&shift | `objective_weight_night_balance`(5)| L2 范数（平方和，非线性！）|
| O6 | BalanceWeekendWork | `enable_balance_weekend_work`(on)&shift | `objective_weight_weekend_balance`(5)| L2 范数（非线性）|
| O7 | MinimizeTripleSalaryCost | `enable_minimize_triple_salary`(on)&shift | `objective_weight_triple_salary`(10)| 节假日工作班次数 ×10 |
| O8 | LeadershipCoverage 软惩罚（非独立类）| 有 penalty_vars | 内嵌 `(var, weight)`，权重 20/10/30/50 | 由约束层注入 ctx.leadership_penalty_vars |

量级链：**O0 > O1 >> O4 ≈ O3 ≈ O5/O6 >> O7 > O8**。

坑：`minimize_hours.py`（MinimizeTotalHours）export 了但**从不被调用**。`total_deviation_hours = objective_value/100` 命名误导——是**总加权目标值÷100**，非工时偏差小时数。O0/O1 无 `enable_*` 开关（靠数据存在与否激活）。

### 2.3 API 端点清单

**求解器端（solver_v4/app.py，port 5005）**：

| 端点 | 方法 | 作用 |
|---|---|---|
| `/api/v4/health` | GET | 健康检查 |
| `/api/v4/precheck` | POST | 只跑 precheck 不求解 |
| `/api/v4/solve` | POST | 主求解（同步阻塞）|
| `/api/v4/abort/<request_id>` | POST | 查 ACTIVE_CALLBACKS → request_stop |

**后端端（/api/v4/scheduling，port 3001）**：

| # | Method | Path | 鉴权 | 作用 |
|---|---|---|---|---|
| 0 | GET | `/runs` | SOLVER_RUN_READ | 列最近 50 条 run |
| 1 | POST | `/solve` | SOLVER_RUN_EXECUTE | 触发求解，立即返回 runId |
| 2 | GET | `/runs/:runId/progress` | SOLVER_RUN_READ | **SSE** 进度流 |
| 3 | POST | `/callback/progress` | requireServiceAuth | solver 推进度 |
| 3b | POST | `/callback/result` | requireServiceAuth | solver 推最终结果 |
| 4 | GET | `/runs/:runId/result` | SOLVER_RUN_READ | 富化结果 |
| 5 | POST | `/runs/:runId/stop` | SOLVER_RUN_ABORT | 手动停止 |
| 6 | GET | `/runs/:runId/status` | requireServiceAuth | solver 轮询停止信号 |
| 7 | POST | `/runs/:runId/apply` | SOLVER_RESULT_APPLY+scope | 落库 |
| 8 | POST | `/precheck` | SOLVER_RUN_READ | 同步预检 |
| 9 | POST | `/preview-proposal` | SOLVER_RUN_READ | 纯预览 |

鉴权双轨：人类端点走 JWT `requirePermission`；机器回调（3/3b/6）走 `requireServiceAuth`（`X-Solver-Callback-Token` timingSafeEqual）。

### 2.4 SSE / 回调事件清单

**solver → backend 回调（progress payload）**：`type ∈ {STATUS, SOLUTION, LOG, FINAL, INFO}`，`status ∈ {RUNNING, COMPLETED, FAILED}`。

| type | 触发 | metrics 内容 |
|---|---|---|
| SOLUTION | on_solution_callback 发现新解 | solution_count, objective_value, best_bound, gap, wall_time |
| LOG | log_section/log_metric/log | — |
| STATUS/INFO | 心跳/段落 | — |
| FINAL | push_final_result | 全量 metrics + progress=100 |

**backend → frontend SSE（命名事件 `progress`）**：`status ∈ {INIT, RUNNING, STOPPING, COMPLETED, APPLIED, FAILED}`，payload `{status, stage, error, solver_progress:{progress, metrics, logs/logs_full}}`。日志双格式：旧 `logs:string[]` + 新 `logs_full:[{time,message,level,category}]`，`category ∈ {GENERAL,CONSTRAINT,CONFLICT,SOLVER,PROGRESS}`。

### 2.5 DB 表清单

**读（DataAssemblerV4）**：`batch_operation_plans`, `production_batch_plans`, `operations`, `employees`, `employee_roles`, `employee_qualifications`, `employee_unavailability`, `shift_definitions`, `calendar_workdays`, `holiday_salary_config`, `batch_share_groups`(+members), `batch_personnel_assignments`, `employee_shift_plans`, `operation_qualification_requirements`, `standalone_tasks`(+qualifications), `resources`, `resource_calendars`, `maintenance_windows`, `operation_resource_requirements`(+快照表), special shift 系列。

**写（apply）**：`batch_personnel_assignments`, `standalone_task_assignments`, `standalone_tasks`(status), `employee_shift_plans`, `special_shift_occurrence_assignments`, `special_shift_occurrences`(status), `scheduling_runs`(status=APPLIED)。

**run 主表 `scheduling_runs`**：`id, run_code(V4-{ts}), run_key, status, stage, window_start/end, solve_start/end, target_batch_ids(JSON), result_summary(LONGTEXT), summary_json(JSON 含 scope), solver_progress(JSON), error_message, created_at, completed_at`。**V4 无运行中内存 Map，状态全在 DB**；SSE 广播经 `progressEmitter`（EventEmitter 单例，事件名 `run:{id}`）。

---

## 3. 「结果不能降低」的客观判定标准

给定**完全相同的输入**（同一 `V4SolverRequest` JSON），对 V4 与 V5 两次求解结果按下面**分层字典序**比较。V5 在任一更高层严格劣于 V4 即判定为「降低」，不可发布。

### 3.1 判定层级（从高到低，逐层短路）

| 层 | 指标 | 来源 | V5 不降低标准 |
|---|---|---|---|
| L0 可行性 | `status` | result.status | V4 找到解（OPTIMAL/FEASIBLE）时，V5 不得 INFEASIBLE/FAILED；V4 INFEASIBLE 时 V5 也应 INFEASIBLE（除非证明 V4 误判）|
| L1 专项满足 | `special_shift_shortage_total` | metrics | V5 ≤ V4（专项欠配人次不增）|
| L2 岗位填充 | `vacant_positions` / `fill_rate` | metrics | V5 vacant ≤ V4（填充率不降）|
| L3 总目标值 | `objective_value` | metrics | 同为 OPTIMAL 时**必须相等**；V4 OPTIMAL 而 V5 FEASIBLE 则 V5.obj ≤ V4.obj（更优或相等）|
| L4 各分量 | breakdown（V5 新增）| 见 §4b | 在 L0-L3 相等时，逐分量不显著劣化 |

### 3.2 L4 分量（V5 必须新增 `objective_breakdown` 上报才能逐项比对）

V4 **只上报总加权 objective_value，无分解**，所以 V4 vs V5 的细粒度比对必须靠 V5 端新增 breakdown，并对 V4 结果做**外部重算**（用同一份 result 重算下列量，因 V4 result 含 schedules 明细可重算）：

```jsonc
"objective_breakdown": {
  "special_shortage_penalty": ...,   // O0
  "vacancy_penalty": ...,            // O1
  "special_impact": ...,            // O2
  "hours_deviation_scaled": ...,     // O3：Σ|actual_h[e]-std_h[e]|×100
  "special_shift_count": ...,        // O4
  "night_shift_variance": ...,       // O5：Var(NightCount[e])
  "weekend_work_variance": ...,      // O6：Var(WeekendCount[e])
  "triple_salary_count": ...,        // O7
  "leadership_penalty": ...          // O8
}
```

### 3.3 落地建议

- 写一个**离线对比脚本**：喂同一批 `logs/request_{id}.json`（V4 已落盘每个请求），分别 POST 到 V4(5005) 与 V5(新端口)，按上表逐层比对，输出回归报告。
- **核心铁律**：V5 若想换目标组合方式 / 调权重 / 加 warm start，凡可能影响 L3 的改动，都必须保证「同输入下 OPTIMAL 的 objective_value 与 V4 逐字节相等」——即**保持目标函数数学等价**（权重、量纲、`absolute_gap_limit=0.99` 整数最优判据不变）。V5 的「增强」只能体现在「同等最优解里挑更好的 L4 分量」或「V4 超时只到 FEASIBLE 时 V5 用同样时间预算找到 ≤ 的解」。

---

## 4. 【V5 机会点】（最重要章节）

### 4a. 求解能力增强

**前提铁律**：V4 已是 OPTIMAL 时，目标函数数学不变 → V5 也只能给出同样的最优 objective_value（CP-SAT 对同模型最优值唯一）。所以「增强」的真实含义是两类：①**更快收敛 / 在相同时间预算内把 FEASIBLE 推到 OPTIMAL**（V4 超时只到 FEASIBLE 的场景，V5 严格变好）；②**在多个等价最优解中挑 L4 分量更好的那个**（不破坏 L0-L3）。下表每项都附「不降低保障手段」。

| 机会 | 做法 | 风险 | 不降低结果的保障 |
|---|---|---|---|
| **Solution hint / warm start** | 把「上一次 run 的解」或「贪心启发式解」作为 `model.AddHint(...)` 喂给 CP-SAT，加速首解 | hint 不一致会被 CP-SAT 忽略（不影响正确性，但若搭配 `fix_variables_to_their_hinted_value` 会锁死搜索→可能错过更优解）| **绝不**用 fix-hint；只用软 hint（CP-SAT 仅当 hint 可行时利用）。目标/约束不变 → 最优值不变。回归脚本验证 obj 相等 |
| **分阶段求解（lexicographic）** | 先 minimize O0+O1（可行性主目标）求最优值 v*，加约束 `O0+O1 == v*` 再 minimize 次级目标 | 阶段间 plumbing 复杂；若第二阶段约束写错可能 INFEASIBLE | 等价于 V4 单层加权当权重差足够大时的极限；**只在 L4 层（O3-O8）做 lexicographic**，L0-L3 仍是硬主目标。保证 L0-L3 不劣于单层加权 |
| **对称性破除** | 对「可互换员工」（同资质同可用性）加 `lex` 顺序约束，砍掉对称分支 | 误判对称会砍掉合法解 → 可能漏最优 | 只对**可证明同质**的员工对加；保守起见先在等价最优解集合内验证。symmetry_level=2 已开，额外手工对称破除需回归验证 obj 相等 |
| **求解参数微调** | 调 `num_search_workers` 组合、`max_time_in_seconds`、开 `interleave_search`、`probing` 等 | 参数只影响搜索路径/速度，不影响最优值；但 portfolio 改动可能在超时场景给出不同 FEASIBLE | 参数类改动**永不降低 OPTIMAL 结果**（最优值唯一）。超时场景用回归脚本确认 V5.obj ≤ V4.obj |
| **目标分量显式建模 + breakdown** | 把每个 objective 项单独建 IntVar（如 `vac_penalty_total`），既供 breakdown 上报又供 lexicographic | 多几个辅助变量，模型略大 | 纯观测变量（`== 原表达式`），不改优化方向。obj 不变 |
| **非线性 L2 范数线性化** | O5/O6 的平方和（AddMultiplicationEquality）在员工多时拖慢；可换 max-min 差值线性近似 | **改变目标语义**（L2→L∞），最优解可能不同 → 直接违反 L4 不降低 | **默认保留 V4 的 L2**；线性化仅作为「可配置 fast 模式」开关，且默认 off。属 L4 风险项，需 A/B 验证均衡度不劣 |
| **增量 / rolling-horizon 求解** | 大窗口切片，warm-start 衔接 | 边界 frozen 数据不全会错排（frozen_range.py:83 的 pass 留白）| 已有 solve_range/frozen 机制；V5 复用且补全边界 frozen。回归对比整窗 vs 切片 |
| **precheck 升级为「可解性诊断」** | 复用 precheck 的鸽巢/单点检查，提前给 hint 或提示 | 仅诊断，无副作用 | 不进求解器，零风险 |

> 优先级建议：**solution hint（最稳收益）→ breakdown 显式建模（为对比/可视化铺路）→ lexicographic（L4 改善）→ 对称性破除（高风险后置）**。

### 4b. 过程可视化数据源（核心新需求）

目标：让用户「看懂求解器正在发生什么」，不只是进度条。下面列出 CP-SAT 内部**可导出**的事件/数据，以及 V4 callback 协议怎样**向后兼容地**扩展成 V5 事件流。

**可用数据源（CP-SAT / solver 内部，当前 V4 未导出）**：

| 数据 | 来源 | 可视化形态 |
|---|---|---|
| 模型构建规模 | 每个约束 `apply()` 返回的 count + 变量字典 size（assignments/shift/vacancy/special）| 「模型构建」阶段条形图：各约束贡献的约束数 + 变量数 |
| Presolve 前后规模 | `solver.parameters.log_search_progress` 日志 / `CpSolverResponse` 的 presolved 统计 | presolve 压缩比卡片（变量/约束 before→after）|
| 每个 incumbent 解 | `on_solution_callback`（V4 已发 SOLUTION，但只有总 obj/bound/gap）| **目标值收敛曲线**（obj 与 best_bound 随时间双线，gap 阴影收窄）|
| 每个 incumbent 的**分量** | V5 新增：用 4a 的显式分量 IntVar，在 callback 里 `self.Value(vac_penalty_total)` 等 | 收敛曲线下方堆叠面积图：各目标分量随解演进 |
| 搜索统计 | `solver.NumBranches()` / `NumConflicts()` / `NumBooleans()`（V4 零引用，全新）| 「搜索强度」仪表：分支数/冲突数随时间 |
| 求解阶段 | Phase1-6 的进入/退出时刻 | 阶段时间轴（甘特式：组装/建模/求解/提取各占多久）|
| 中间解快照 | `_cache_current_solution` 已缓存最佳解全量变量（V4 仅用于结果提取）| 「最新方案预览」：拿缓存解渲染一张缩略排班矩阵，每次改进刷新 |
| precheck 问题 | run_precheck 返回的 PrecheckIssue 列表 | 求解前的「风险雷达」 |

**V4 callback → V5 事件流的扩展方式（不动 V4）**：

V5 起独立 callback（继承 `cp_model.CpSolverSolutionCallback`），走**独立的 V5 回调端点**（如 `/api/v5/scheduling/callback/progress`），payload **在 V4 字段基础上只增不改**：

```jsonc
// V5 progress payload（V4 字段全保留，新增 phase/event/breakdown/stats）
{
  "run_id", "status", "type",                    // V4 原字段，语义不变
  "progress", "metrics", "message", "log_line",  // V4 可选字段
  // ↓ V5 新增（V4 前端忽略未知字段，天然兼容）
  "phase": "BUILDING|PRESOLVE|SOLVING|EXTRACTING",
  "event": "MODEL_STATS|NEW_INCUMBENT|SEARCH_STATS|PHASE_ENTER",
  "model_stats": { "num_vars", "num_constraints", "by_constraint": {...} },
  "incumbent": { "obj", "bound", "gap", "wall_time", "breakdown": {...} },
  "search_stats": { "branches", "conflicts", "booleans" }
}
```

**事件流并发模型必须复刻 V4**：不在 worker 线程同步发 HTTP；`begin_deferred()` 期间写内存，monitor 线程每 1s flush。可视化的「实时」其实是 1s 节流——V5 前端动画要按这个节拍设计（别期望毫秒级）。SSE 侧同样**只增字段**，前端 `solver_progress` 解析对未知 `phase/event` 字段优雅降级。

### 4c. 无解原因分析（加分项）

基于 CP-SAT **assumption literal** 做不可行子集（IIS-like）定位。V4 完全没有这套（零 `AddAssumption`），是绿地。

**CP-SAT 机制**：给每组「可疑硬约束」挂一个 assumption BoolVar（`model.AddAssumption(lit)` 或把约束 `OnlyEnforceIf(lit)` 后 `AddAssumptions([lits])`），求解后若 INFEASIBLE，`solver.SufficientAssumptionsForInfeasibility()` 返回**导致无解的最小 assumption 子集**——即「关掉这几组约束就有解」。

**在 V4 代码结构上的落地点（哪些约束组适合挂 assumption literal）**：

| 约束组 | 为何适合挂 assumption | 业务可读性 |
|---|---|---|
| StandardHoursConstraint（H8/H9）| 假期多的月份下限最易撞墙（lower_offset 仅 4h）| 「工时下限太紧，建议放宽月度容差」|
| LockedOperationsConstraint | 锁定非候选直接 `Add(0==1)`，是 INFEASIBLE 高发源 | 「锁定的员工 X 不是工序 Y 的候选人」|
| ConsecutiveDaysConstraint（含历史边界）| 唯一候选人连上 > limit（已有 _detect_unavoidable_conflicts 诊断但只打日志）| 「员工 X 连续工作超限且无人可替」|
| SpecialShiftJointCoverage（HARD）| shortage==0 在候选不足时必无解 | 「专项班次 Z 候选人不足 N 人」|
| LeadershipCoverage Rule1 | 领导少 + 生产日多易冲突（报告已点名）| 「生产日 D 没有可用领导」|
| LockedShiftsConstraint（strict）| strict 模式缺班次→INFEASIBLE | 「锁定班次数据缺失」|
| 每个 (op,pos) 的「必须有人」硬约束（不许空岗）| `Add(sum==1)` 候选为空即无解 | 「岗位 P 无合格候选人」|

**落地方式（V5，不动 V4）**：
1. V5 的约束类在「硬且可能无解」的关键约束上，把 `model.Add(...)` 改成 `model.Add(...).OnlyEnforceIf(group_lit)`，并 `model.AddAssumption(group_lit)`（group_lit 按**业务约束组**粒度，不是每条约束一个，否则子集太碎）。
2. 主求解 INFEASIBLE 时，**二次求解一个「带 assumption 的诊断模型」**（或直接在主模型调 `SufficientAssumptionsForInfeasibility`），把返回的 literal 集合映射回业务文案。
3. 前端把无解原因渲染成「冲突清单 + 一键放宽建议」（复用 precheck 的告警栏 UI）。

**性能注意**：assumption 求解比普通求解慢，建议**仅在主求解 INFEASIBLE 时触发诊断 pass**，正常可行时零开销。`category="CONFLICT"` 的日志通道（V4 已预留）正好承载这类输出。

---

## 5. 【V5 边界】必须保持不变的东西

为保证「使用体验不大幅改变」+「不改动 solver_v4」，下列契约/格式/流程 V5 **必须原样保持**：

**A. 请求字段语义（V4SolverRequest / SolverRequest）**
- 顶层结构与所有 dataclass 字段名/默认值（`contracts/request.py`）。
- `operation_plan_id` 负值 = standalone（`-task.id`）的约定。
- 候选人**后端预筛**（`position_qualifications[].candidate_employee_ids`），solver 只为这些人建变量。
- `window`（全窗）vs `solve_range`（求解子区间）vs `frozen_shifts/frozen_assignments`（区间外快照）三者语义。
- 时区：planned_start/end 一律 UTC ISO（带 Z）；shift start/end 为 HH:MM 单日；夜班跨日靠 `is_night_shift`。
- **`_shift_relevant_employee_ids` 铁律**：任何「按 employee_id 点名」的字段都必须并入 shift 变量员工集合，否则相关硬约束静默失效（领导/专项/锁定/冻结）。

**B. config 开关全集**：前端 `SolverConfig`（87 字段）的所有 `enable_*` / `objective_weight_*` / 领导三态 / 时间参数键名与默认值。V5 只能**加新键**，不能改名/改默认（否则用户存的配置错位、结果漂移）。

**C. 回调 / SSE 协议**
- 回调鉴权：同一 `SOLVER_CALLBACK_SECRET` + header `X-Solver-Callback-Token`，timingSafeEqual。
- progress payload 的 V4 字段（`run_id/status/type/progress/metrics/message/log_line`）只增不改。
- SSE 命名事件 `progress`；日志双格式（`logs` + `logs_full`）；`status` 枚举值；前端对未知字段降级。
- 并发模型：deferred + monitor 线程 1s flush（不在 worker 同步发 HTTP）。

**D. 结果 payload 形状**
- 「班次锚定」结构：`schedules[].{employee_id,date,shift,tasks[]}` + `unassigned_jobs` + `special_shift_assignments/shortages` + `share_group_compliance` + `metrics`。
- 双轨兼容：新 `schedules` / 旧 `assignments+shift_schedule`，apply 和 result 读取都依赖此判断。
- metrics 字段名（含误导性的 `total_deviation_hours`）保持，前端依赖。
- 超时/中断仍返回已找到最佳解（强制 FEASIBLE）。

**E. DB 写入格式 / apply 流程**
- `scheduling_runs` 表字段、status/stage 状态机、`summary_json.scope` 快照三段式写入。
- apply 的 scope-aware delete + 保留 is_locked 行 + I1/I2/I3 不变量（责任域外零影响）。
- 落库 UPSERT 目标表与外键（`scheduling_run_id` 回填）。
- 特殊班次全生命周期（OVERTIME 类别 / lock_after_apply）。

**F. 前端体验旁路**
- 4 个 Tab（批次列表/区间求解/值班任务/历史记录）+ 高级配置弹窗 + 预检/预览旁路。
- 进度弹窗 → 全屏结果抽屉 → 人工编辑 → 导出 → 应用 的完整链路与交互。
- preview_only 旁路（不建 callback、不回写、纯同步返回）。

> V5 的「不大幅改变体验」= 上面 A-F 全保留；新增只体现在**结果同等或更好** + **进度弹窗里多一块「求解过程可视化」面板** + **无解时多一块「原因分析」面板**。可考虑 V5 走全新路由（如 `/solver-v5`）与全新后端前缀（如 `/api/v5/scheduling`），与 V4 并存、零耦合。

---

## 附：抽查核实记录

- `core/solver.py:35-43` 求解参数：与报告 §10 一致。
- `core/callback.py:289-302` `_send_now` payload 字段：与报告 §7.3 一致。
- `core/callback.py:75-141` `on_solution_callback`：SOLUTION 事件 metrics 字段（solution_count/objective_value/best_bound/gap/wall_time）核实无误。
- 全 solver 源码 grep `AddAssumption|AddHint|warm|num_branches|num_conflicts|ResponseStats|presolve|hint`：**零业务命中**（仅第三方库），证实 4a/4b/4c 三类增强均为绿地。
- `callback.py:197 register_variables` / `:209 _cache_current_solution`：确认最佳解全量变量已被缓存，可供「中间解快照」可视化复用。
