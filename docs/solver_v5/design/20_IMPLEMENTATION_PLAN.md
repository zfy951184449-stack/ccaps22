# V5 实施计划（冻结契约 + 工作分解 + 验证）

> 作者：V5 总架构师
> 基线 commit：a237777（main）。环境：OR-Tools 9.15.6755 / Python 3.9 / Flask 3.1 / React 18 + TS 4.9 + CRA。
> 上游设计：`10_solver_design.md`（求解器）、`11_backend_design.md`（后端链路）、`12_frontend_design.md`（前端）。三份设计已按本计划的裁决回改，各文档末尾有「评审修订记录」。
> 本文档的 **§1 冻结契约是唯一权威**——三份设计如与本节冲突，以本节为准（设计已同步）。
> 锚定 R1-R6 用户冻结需求 + D1-D6 指挥官决策（见任务书）。

---

## 0. 评审裁决总览（BLOCKER/MAJOR 逐条）

| 裁决 | finding | 处置 |
|---|---|---|
| ✅采纳 | model_stats.by_constraint 三方 schema 不一致 | 冻结 `{count, ms, vars}`（solver 源头）；三文档已改 |
| ✅采纳 | 无解诊断 schema 三方不一致 | 双路径：实时 `infeasibility.groups[]` / 结果 `infeasibility_analysis.minimal_conflict_groups[]`，组项字段统一；三文档已改 |
| ✅采纳 | objective_breakdown 嵌套位置 | 冻结 `result.metrics.objective_breakdown`；backend §7.3/§7.6 已改 |
| ✅采纳 | phase 枚举不一致 | solver 5 值含 DIAGNOSING、不含 ASSEMBLING；ASSEMBLING 是 backend `stage`；三文档已改 |
| ✅采纳 | incumbent snapshot vs preview | 字段名统一 `preview`，采**方案 A 轻量聚合**（fill_rate/vacant_positions）；三文档已改 |
| ✅采纳 | enable_objective_breakdown 缺失于 solver config 表 | solver §11 已补，solver.py 消费 |
| ✅采纳 | server.ts isSolverMachinePath 漏改 | backend §0 R1 措辞已改为「两处增量」；归集成工单 I1 |
| ✅采纳 | model_stats 缺 by_layer/presolve | backend §7.2 已补 |
| ✅采纳 | 缺 config.hint.previous_solution 注入 | backend §1.4.1 新增注入逻辑（含安全降级 + 结构校验） |
| ✅采纳 | callback phase 缺 DIAGNOSING | backend §2.1/§7.2 已补 |
| ✅采纳 | convergence 点 t 字段来源不明 | 统一用 `wall_time`（= incumbent.wall_time）；三文档已改 |
| ✅采纳 | 第 7 组 group 标识符不一致 | 冻结 `POSITION_MUST_FILL`；frontend §7.1 已改 |
| ✅采纳 | 诊断模型同构性漏洞 | solver §6.3 改 `diag_ctx.model=diag_model` 跑全约束 + 同构性回归门禁 |
| ✅采纳 | lexicographic 第二阶段重建矛盾 | 统一 `CpModel.Clone()` + `_extract_solution(solver_override)` |
| ✅采纳 | gunicorn 多线程 ACTIVE_CALLBACKS 竞态 | solver §7.4 加 `_callback_lock` 包四访问点 |
| ✅采纳 | breakdown 等价断言 O0/O1/O8 权重歧义 | solver §3.3 显式标注外层权重=1 + 动态权重场景验证 |
| ✅采纳 | lex 失败回退/L3 上界边界 | solver §5.5 明确回退切 phase1_solver + obs_total 前置 |
| ✅采纳 | hint previous_solution 跨输入失配/崩溃 | solver §4.2 apply_hint try/except 大包围 + backend 入口校验 |
| ✅采纳 | L4 代理目标量级溢出 | solver §5.3 C 常量按 E/D 动态累乘 + 超 1e15 降级 |
| ✅采纳 | monitor max_time 重置 start_time 误判 | solver §5.4 phase-2 新 callback/reset_phase2 |
| ✅采纳 | metadata.solver_generation 选回调端点表述 | 改纯诊断标记，回调 URL 静态固定；solver/backend 已改 |
| ✅采纳 | 区块 b WxbBarChart 无 horizontal | frontend §5.1 改垂直柱 + 旋转标签 |
| ⚠️部分驳回 | R6 范围过度膨胀，建议砍 InfeasibilityPanel | **保留**完整 R6（D6 明确要求诊断 pass）；但①同构性回归门禁设为 CI 不可绕过（已入设计）；②无解面板工单（F8）标 sonnet 且**最低优先级**，若工期紧可降级为「仅 CONFLICT 日志着色」（设计 §3.7 降级路径已覆盖）。理由：D6 是冻结决策，不得擅自砍；但通过测试门禁兜住「误报无解」风险，并允许工期驱动的降级 |
| ✅采纳 | §1.6 RocketOutlined（icon） | 改 antd `ExperimentOutlined`（TopNavigation 全用 antd 图标，wxb-ui 规则只约束新建组件）|

---

## 1. 冻结契约（唯一权威）

### 1.1 端点表

| 服务 | 端点 | 方法 | 说明 |
|---|---|---|---|
| solver_v5 (5006) | `/api/v5/health` | GET | `{status, version:"5.0.0-alpha", service:"Solver V5"}` |
| solver_v5 | `/api/v5/precheck` | POST | `run_precheck` 不求解 |
| solver_v5 | `/api/v5/solve` | POST | 主求解（同步阻塞），body=`SolverRequest`（V4 schema） |
| solver_v5 | `/api/v5/abort/<request_id>` | POST | 进程内 abort（单 worker 100% 命中） |
| backend (3001) | `/api/v5/scheduling/solve` | POST | `SOLVER_RUN_EXECUTE` |
| backend | `/api/v5/scheduling/precheck` | POST | `SOLVER_RUN_READ` |
| backend | `/api/v5/scheduling/preview-proposal` | POST | `SOLVER_RUN_READ` |
| backend | `/api/v5/scheduling/runs` | GET | `SOLVER_RUN_READ`，`WHERE run_code LIKE 'V5-%'` |
| backend | `/api/v5/scheduling/runs/:id/progress` | GET(SSE) | `SOLVER_RUN_READ`，命名事件 `progress` |
| backend | `/api/v5/scheduling/runs/:id/result` | GET | `SOLVER_RUN_READ` |
| backend | `/api/v5/scheduling/runs/:id/stop` | POST | `SOLVER_RUN_ABORT` |
| backend | `/api/v5/scheduling/runs/:id/apply` | POST | `SOLVER_RESULT_APPLY` + `requireScope` |
| backend | `/api/v5/scheduling/callback/progress` | POST(机器) | `requireServiceAuth`（X-Solver-Callback-Token），**isSolverMachinePath 豁免** |
| backend | `/api/v5/scheduling/callback/result` | POST(机器) | 同上 |
| backend | `/api/v5/scheduling/runs/:id/status` | GET(机器) | solver 轮询，**isSolverMachinePath 豁免** |
| frontend | 路由 `/solver-v5` → `SolverV5Page` | — | 菜单「V5 自动排班（增强可视化）」 |

权限码**沿用 V4**（`SOLVER_RUN_READ/EXECUTE/ABORT` + `SOLVER_RESULT_APPLY`），不新增。

### 1.2 callback payload 全 schema（solver → backend `/callback/progress`）

V4 字段只增不改。完整冻结 schema：

```jsonc
{
  // V4 原字段（语义/类型/默认不变）
  "run_id": <int|str>, "status": "RUNNING|COMPLETED|FAILED",
  "type": "STATUS|SOLUTION|LOG|FINAL|INFO",
  "progress": <int 0-100, optional>,
  "metrics": { ... , optional },           // SOLUTION 时含 solution_count/objective_value/best_bound/gap/wall_time
  "message": <str, optional>, "log_line": <str, optional>,

  // V5 新增（互斥：一个 payload 只带与 event 对应的那一个对象）
  "phase": "BUILDING|PRESOLVE|SOLVING|EXTRACTING|DIAGNOSING",   // optional，5 值
  "event": "PHASE_ENTER|MODEL_STATS|NEW_INCUMBENT|SEARCH_STATS|DIAGNOSIS", // optional

  "model_stats": {                          // 仅 event=MODEL_STATS（一次性，BUILDING 末）
    "num_vars": <int>, "num_constraints": <int>,
    "by_layer": { "assignments":<int>,"shift":<int>,"vacancy":<int>,
                  "special_cover":<int>,"special_shortage":<int>,"task_placement":<int> },
    "by_constraint": { "<Name>": {"count": <int|"OFF">, "ms": <float>, "vars": <int>} },  // OFF 时 ms=0,vars=0
    "presolve": { "vars_before","vars_after","ctrs_before","ctrs_after" }   // optional，仅 SOLVER_DEBUG=1
  },
  "incumbent": {                            // 仅 event=NEW_INCUMBENT（伴 type=SOLUTION）
    "obj": <float>, "bound": <float>, "gap": <float>, "wall_time": <float>,
    "solution_count": <int>,
    "breakdown": {                          // 仅 enable_objective_breakdown=true（默认）
      "special_shortage_penalty":<int>,"vacancy_penalty":<int>,"special_impact":<int>,
      "hours_deviation_scaled":<int>,"special_shift_count":<int>,"night_shift_variance":<int>,
      "weekend_work_variance":<int>,"triple_salary_count":<int>,"leadership_penalty":<int>
    },
    "preview": {                            // 轻量聚合（方案 A），可 null；下采样 §2.5
      "fill_rate":<float>,"vacant_positions":<int>,"scheduled_shifts":<int>,
      "top_assignments":[ {"op":<int>,"pos":<int>,"emp":<int>} ]   // 可选明细，≤ snapshot_top_n
    }
  },
  "search_stats": { "branches":<int>,"conflicts":<int>,"booleans":<int> }, // 仅 event=SEARCH_STATS
  "infeasibility": {                        // 仅 event=DIAGNOSIS（type=LOG, phase=DIAGNOSING）
    "located": <bool>,
    "groups": [ { "group":"<7组之一>","lit_key":"<lit_*>",
                  "message_zh":"<文案>","suggestion_zh":"<建议>","config_keys":["<key>"] } ]
  }
}
```

> 缺省字段一律**省略键**，绝不发 `null` 覆盖（避免 backend JSON_MERGE_PATCH 删字段）。

### 1.3 SSE payload（backend → frontend，命名事件 `progress`）

```jsonc
{
  "status": "INIT|RUNNING|STOPPING|COMPLETED|APPLIED|FAILED",
  "stage":  "INIT|ASSEMBLING|SOLVING|DONE",   // 组装段在此（非 solver phase）
  "error":  <string|null>,
  "solver_progress": {           // 可能是字符串，前端需先 JSON.parse
    "progress": <int>, "metrics": {...}, "message": <str>,
    "logs": [ "..." ], "logs_full": [ {time,message,level,category} ],
    // V5 累积结构
    "phase": "BUILDING|PRESOLVE|SOLVING|EXTRACTING|DIAGNOSING|null",
    "phase_timings": { "BUILDING":<ms>, ... },
    "model_stats": <见 1.2 | null>,
    "search_stats": <{branches,conflicts,booleans} | null>,
    "convergence": [ {"wall_time":<float>,"obj","bound","gap","breakdown"} ],  // ≤300 点（裁剪）
    "events": [ {"wall_time","type","phase","payload"} ],                       // ≤200（FIFO）
    "infeasibility": <{located,groups:[...]} | null>,                          // DIAGNOSIS 写入
    "viz_meta": { "convergence_count":<int>, "events_count":<int> }
  }
}
```

### 1.4 result.metrics.objective_breakdown（终解，冻结路径）

```jsonc
"result": {
  ... V4 班次锚定结构（schedules/unassigned_jobs/special_shift_*/share_group_compliance）...,
  "metrics": {
    ... V4 既有键（assigned_count/objective_value/best_bound/gap/total_deviation_hours/...）...,
    "objective_breakdown": {        // 仅 enable_objective_breakdown=true
      "special_shortage_penalty":<int>, ... 9 分量 ...,
      "weights_applied": { "special_impact":<w_impact>,"hours_deviation":<w1>,
        "special_shifts":<w2>,"night_balance":<w3>,"weekend_balance":<w4>,"triple_salary":<w5> }
    }
  },
  "infeasibility_analysis": <见 1.5 | 省略（有解时）>
}
```

> 后端/前端**一律从 `result.metrics.objective_breakdown` 读**，不是 result 顶层。
> breakdown 等价断言权重集（冻结）：`{O0:1, O1:1, O2:w_impact, O3:w1, O4:w2, O5:w3, O6:w4, O7:w5, O8:1}`（O0/O1/O8 权重内嵌，外层乘子=1）。

### 1.5 infeasibility_analysis（result 落库/下发路径，冻结）

```jsonc
"infeasibility_analysis": {
  "is_infeasible": true, "located": <bool>, "diagnosed_at": "<ISO>",
  "minimal_conflict_groups": [
    { "group":"<7组之一>","lit_key":"<lit_*>","message_zh":"<文案>",
      "suggestion_zh":"<建议>","config_keys":["<key>"],
      "related_employees":[<int>],"related_dates":["<ISO date>"] }  // related_* 可选
  ]
}
```

**七组 group 标识符（冻结，三方逐字符一致）**：
`STANDARD_HOURS` / `LOCKED_OPERATIONS` / `CONSECUTIVE_DAYS` / `SPECIAL_SHIFT_COVERAGE` / `LEADERSHIP_COVERAGE` / `LOCKED_SHIFTS` / `POSITION_MUST_FILL`。

**lit_key → group 映射（solver LITERAL_TO_BUSINESS_TEXT 输出）**：
`lit_hours→STANDARD_HOURS`,`lit_locked_op→LOCKED_OPERATIONS`,`lit_consec→CONSECUTIVE_DAYS`,`lit_special→SPECIAL_SHIFT_COVERAGE`,`lit_leader→LEADERSHIP_COVERAGE`,`lit_locked_shift→LOCKED_SHIFTS`,`lit_fill→POSITION_MUST_FILL`。

> 实时路径 `solver_progress.infeasibility.groups[]` 与结果路径 `infeasibility_analysis.minimal_conflict_groups[]` **组项字段集相同**，仅外层键名/数组名不同。

### 1.6 config 新键 + 默认值（冻结）

| key | 默认 | 消费方 | 作用 |
|---|---|---|---|
| `enable_solution_hint` | `true` | solver | 软 hint 注入（绝不 fix） |
| `enable_objective_breakdown` | `true` | solver | 建 O0-O8 观测变量并上报；false 省略 breakdown |
| `enable_lexicographic_l4` | `false` | solver | L4 第二阶段；关=与 V4 逐字节等价 |
| `lex_phase1_budget_ratio` | `0.7` | solver | 阶段一时间占比 |
| `lex_phase2_min_seconds` | `30` | solver | 阶段二最小预算 |
| `enable_infeasibility_diagnosis` | `true` | solver | 无解诊断 pass 开关 |
| `diag_time_seconds` | `30` | solver | 诊断 pass 超时 |
| `snapshot_min_interval` | `8` | solver | preview 最小间隔(s) |
| `snapshot_top_n` | `50` | solver | preview top_assignments 条数 |
| `enable_viz_telemetry` | `true` | solver | viz 遥测总门控（preview 聚合 + 逐解 search_stats 缓存）。false 时 worker 线程逐解零额外工作，callback 与 V4 逐指令等价——回归 A 轮(全关档)必关（2026-06-11 等价审计修订） |
| `config.hint.previous_solution` | 无 | solver | backend 注入的上次解种子 `{assignments:[{op,pos,emp}], shifts:[{emp,date,shift}]}` |

> 全是加法。前端 SolverConfigV5Extension 暴露三键：`enable_solution_hint/enable_lexicographic_l4/enable_objective_breakdown`；其余键走默认（高级/隐藏）。不开任何键时 V5 行为 == V4。

### 1.7 环境变量表（冻结）

| 变量 | 默认 | 位置 | 说明 |
|---|---|---|---|
| `SOLVER_V5_URL` | `http://localhost:5006` | backend/.env | 后端→solver_v5 |
| `SOLVER_V5_PORT` | `5006` | start_all.sh / solver_v5/.env | solver 监听端口 |
| `BACKEND_API_URL`（solver_v5 侧） | `http://localhost:3001/api/v5/scheduling/callback/progress` | solver_v5 进程 env | **静态固定**回调端点 |
| `SOLVER_CALLBACK_SECRET` | （沿用 V4 同一条） | backend/.env + solver_v5 env | D4 共用密钥 |

### 1.8 gunicorn 启动参数（冻结）

solver_v5：`gunicorn app:app --bind 0.0.0.0:5006 --workers 1 --threads 4 --timeout 600`。
单 worker 消除多 worker abort 陷阱；`_callback_lock` 保护 ACTIVE_CALLBACKS 的 4 个访问点（多线程竞态）。

---

## 2. 工作分解（可并行工单）

> 工单号：S*=solver / B*=backend / F*=frontend / I*=集成 / V*=验证。
> 模型等级：**opus**=核心算法/复杂组件；**sonnet**=常规实现；**haiku**=机械复制样板。
> 每张工单含：文件清单 / 关键要点（工单级摘录）/ 验收命令 / 依赖。

### Solver 工单

#### S0 — solver_v5 骨架生成（机械复制）  · haiku
- **文件**：`scripts/init_solver_v5.sh`（新）；生成 `solver_v5/` 全目录（见 10_solver §1.2）。
- **要点**：从 `solver_v4/` 复制 → 删 6 废弃文件（night_rest/night_shift_interval/no_isolated_night_shift/consecutive_rest_limit/work_days_limit.py + objectives/minimize_hours.py）→ 改类名 `SolverV4→SolverV5`/`APICallback→APICallbackV5`、version `5.0.0-alpha`、端口 5006、端点前缀 `/api/v5/*`。`contracts/request.py` **逐字节复制零改动**。约束/目标类名不变。
- **验收**：`python3 -m compileall solver_v5/{contracts,core,constraints,objectives}` 通过；`rg 'import solver_v4|from solver_v4' solver_v5/` 无命中；6 废弃文件不存在。
- **依赖**：无。

#### S1 — 端口/health/基线对齐（常规）  · sonnet
- **文件**：`solver_v5/app.py`（增 4 端点 + `_callback_lock`）、`requirements.txt`、`.env.sample`、`Procfile`、`Dockerfile`。
- **要点**：4 端点 `/api/v5/{health,precheck,solve,abort}`；`ACTIVE_CALLBACKS` 4 访问点用 `with _callback_lock:` 包裹，删除用 `pop(id,None)`（10_solver §7.4）；preview_only 旁路照搬；`request_{id}.json` 落盘。callback `BACKEND_API_URL` 默认指 v5 端点。
- **验收**：起 `gunicorn ... --workers 1 --threads 4`，`curl :5006/api/v5/health` 返回 `version:5.0.0-alpha`；喂一份 `solver_v4/logs/request_*.json` 到 5006，`status/schedules/metrics` 与 5005 **逐字节一致**（此时无任何增强）。
- **依赖**：S0。

#### S2 — stats_collector + phase/model_stats 事件（常规）  · sonnet
- **文件**：`solver_v5/core/stats_collector.py`（新）、`core/callback.py`（增 `emit_model_stats/emit_phase`）、`core/solver.py`（registry 处包计时胶水）、`core/context.py`（+stats 钩子）。
- **要点**：在 `_apply_constraints` registry 调用处包 `collector.measure()`（不改约束类）；`by_constraint` 每条目 `{count, ms, vars}`（vars 来自 by_layer 对应层，无则 0）；`num_constraints==Σcount`（OFF 计 0）；MODEL_STATS 一次性发（BUILDING 末）。phase：BUILDING/SOLVING/EXTRACTING（+INFEASIBLE 分支 DIAGNOSING），每条带 wall_time。Python 3.9 `@contextmanager`。
- **验收**：抓 v5 回调含 `phase/event/model_stats.by_constraint`，断言 `by_constraint[*]` 含 count/ms/vars 三键且 `num_constraints==Σcount`；S1 的 obj 不变。
- **依赖**：S1。

#### S3 — breakdown 观测变量 + metrics.objective_breakdown（核心数学）  · opus
- **文件**：`solver_v5/core/breakdown.py`（新）、`core/solver.py`（`_build_objectives` 旁挂观测变量 + 总目标观测 obs_total）、`tests/test_breakdown_equivalence.py`（新）。
- **要点**：为 O0-O8 各建 `obs == exprN_unweighted`（用与 objective_terms 同一个 exprN 对象，不可漂移，10_solver §3.2 表）；`enable_objective_breakdown=false` 时跳过建变量、省略字段；额外建 `obs_total == sum(objective_terms)`（lex 路径必需）；`metrics.objective_breakdown`（在 metrics 内）+ `weights_applied`。**等价断言权重集 `{O0:1,O1:1,O2:w_impact,O3:w1,O4:w2,O5:w3,O6:w4,O7:w5,O8:1}`**（O0/O1/O8 外层=1，10_solver §3.3）。
- **验收**：`python3 -m unittest tests.test_breakdown_equivalence`——`Σ(权重·breakdown[k])==solver.ObjectiveValue()` 整数严格相等，覆盖「峰值日有空缺」「非标时段有空缺」「有专项欠配」「无空缺」多场景；回归脚本 v4.obj==v5.obj。
- **依赖**：S1（建议 S2 后）。

#### S4 — incumbent.breakdown + preview 下采样 + search_stats（常规）  · sonnet
- **文件**：`core/callback.py`（on_solution_callback 取 breakdown 值 + preview 聚合 + search_stats 心跳）。
- **要点**：每解读 `self.Value(obs)` 组 breakdown；preview **方案 A 聚合**（fill_rate/vacant_positions/scheduled_shifts，从 cached_solution 直接数，O(vars)，worker 线程算 <1ms）+ 频率下采样（首解/≥snapshot_min_interval/obj 改善≥5%，否则 preview=null）；search_stats 随 monitor 5s 心跳；1s flush 天然节流（`_latest_solution` 覆盖）。
- **验收**：长求解抓回调流——每秒 ≤1 条 SOLUTION，含 `incumbent.breakdown`，preview 频率符合 §2.5，单 payload < 5KB。
- **依赖**：S3。

#### S5 — solution hint（核心，安全降级）  · opus
- **文件**：`core/hint_provider.py`（新）、`core/solver.py`（`_build_objectives` 后 `_run_solver` 前注入）、`tests/test_hint_no_fix.py`（新）。
- **要点**：来源双层兜底——首选 `config.hint.previous_solution`（backend 注入），兜底 `greedy_hint`。`apply_hint` 入口 **try/except 大包围**，任何异常静默跳过（绝不抛出，10_solver §4.2）；只 `AddHint(v,1)`，**绝不** `fix_variables_to_their_hinted_value`、绝不基于 hint 加硬约束；缺失变量 `.get()→None→跳过`。开关 `enable_solution_hint`（默 on）。
- **验收**：`python3 -m unittest tests.test_hint_no_fix`——喂部分不可行 hint，obj 仍==无 hint；空 dict / 乱序 / 多余字段均正常求解；反射断言 `fix_variables_to_their_hinted_value` 从未被设 True；关 hint 时 == S1 基线。
- **依赖**：S1。

#### S6 — lexicographic L4 第二阶段（核心算法）  · opus
- **文件**：`core/lexicographic.py`（新）、`core/solver.py`（两阶段编排 + `_extract_solution(solver_override)`）、`core/callback.py`（reset_phase2 或 phase-2 新实例）、`tests/test_lexicographic.py`（新）。
- **要点**：默认 **off**。phase-1==OPTIMAL 才进 phase-2；**`phase2_model = phase1_model.Clone()`**（不重建变量，10_solver §5.2）；clone 上 Add 锁定（O0/O1 ==、obs_total<=v*）+ 代理目标；`phase2_solver` 独立实例，`_extract_solution` 传 `solver_override=phase2_solver`，回退传 phase1_solver；**C 常量按 E/D 动态累乘上界**，超 1e15 降级 O5+O6 等权（10_solver §5.3）；monitor 用 `phase_start_time`（reset_phase2 重置 start/last_solution/best_obj，保留 solution_count，10_solver §5.4）；失败全回退 S1。
- **验收**：`python3 -m unittest tests.test_lexicographic`——(a) 成功时 L0-L3 不变 & L4≤phase1 & obj==phase2_solver.ObjectiveValue()；(b) 失败回退 == phase1 & obj==phase1_solver.ObjectiveValue()；(c) phase1 FEASIBLE 不进 phase2；(d) 员工>50 数值稳定；默认关时 == S1。
- **依赖**：S3（需 obs_total/分量观测变量）。

#### S7 — 无解诊断 pass（核心，同构性关键）  · opus
- **文件**：`core/infeasibility.py`（新，含七组带-literal 等价重写 + LITERAL_TO_BUSINESS_TEXT）、`core/solver.py`（INFEASIBLE 分支调 diagnose）、`tests/test_infeasibility.py`（新）。
- **要点**：仅 INFEASIBLE 触发（可行零开销，主模型无 assumption）。**新建 `diag_ctx` 且 `diag_ctx.model=diag_model`，用 diag_ctx 跑全约束**（同构铁律，10_solver §6.3）；七组走带 `OnlyEnforceIf(lit)` 等价版 + `diag_model.AddAssumptions([lits])`，其余 16-7 组走原 apply（ctx→diag_model）；`SufficientAssumptionsForInfeasibility()→lit_key→group/文案`；短超时 `diag_time_seconds`；输出实时 `event=DIAGNOSIS`（infeasibility.groups）+ result `infeasibility_analysis.minimal_conflict_groups`。group 字符串用 §1.5 冻结集。开关 `enable_infeasibility_diagnosis`（默 on）。
- **验收**：`python3 -m unittest tests.test_infeasibility`——7 个单组无解用例各命中对应 group/lit_key；**同构性门禁：同一可行输入喂 diag_model 必判可行**；可行用例 diagnose 不被调（mock 计数=0）；诊断后主结果 payload 形状 == V4 INFEASIBLE。
- **依赖**：S1（独立于 S3-S6，可并行）。

### Backend 工单

#### B1 — schedulingV5 骨架（机械复制）  · haiku
- **文件**：`backend/src/routes/schedulingV5.ts`（新）；`backend/src/controllers/schedulingV5/`（11 文件：index/types/helpers/solveOrchestrator/solveProgressSSE/solveResultHandler/applyResultController/solveLifecycle/precheckHandler/previewProposalController + types）。**不碰 server.ts**（归 I1）。
- **要点**：复制 V4 → 全局 V4→V5 字面量、`SOLVER_V5_URL`(默 5006)、`run_code='V5-${Date.now()}'`、回调前缀 `/api/v5/scheduling/callback/*`；函数名加 V5 后缀；**独立 `progressEmitter`**（不共用 V4 单例）；`listRunsV5` `WHERE run_code LIKE 'V5-%'`；权限码沿用 V4。**直接 import `DataAssemblerV4`**（不复制），其余 service 复用。
- **验收**：`cd backend && npm run build` 通过；（接 I1 后）`curl -XPOST /api/v5/scheduling/solve` 建 run（solver 未起则 FAILED 但 run_code=V5-）；`GET /api/v5/scheduling/runs` 仅 V5。
- **依赖**：无（build 验证需 I1 挂载，但代码可先写）。

#### B2 — orchestrator 接 DataAssembler + request_id + previous_solution 注入（常规）  · sonnet
- **文件**：`controllers/schedulingV5/solveOrchestrator.ts`、`helpers.ts`（findLatestAppliedV5Run/compactSolution/validateHintShape）。
- **要点**：`DataAssemblerV4.assemble(...)` 复用后外层覆盖 `request_id='V5-${runId}-${ts}'`；注入 `config.metadata.{run_id, solver_generation:'V5'}`（solver_generation 纯诊断标记）；**注入 `config.hint.previous_solution`**（查最近 APPLIED/COMPLETED V5 同 batchIds+window run→精简→`validateHintShape`→注入；任何失败 try/catch 静默跳过，11_backend §1.4.1）。指向 SOLVER_V5_URL。
- **验收**：`npx vitest run src/tests/schedulingV5.request-id.test.ts`——覆盖后 request_id 为 V5-前缀、注入 hint 结构合法、其余字段深比对全等（除 request_id/config.hint）；mock 5006 验证 run 走到 COMPLETED。
- **依赖**：B1。

#### B3 — updateSolveProgressV5 viz 写入 + 裁剪（核心，有界增长）  · opus
- **文件**：`controllers/schedulingV5/solveProgressSSE.ts`、`helpers.ts`（solver_progress 初始结构 + appendVizEvents/pushConvergencePoint/clampVizArrays/extractInfeasibilityAnalysis）。
- **要点**：初始结构含 `phase/model_stats/search_stats/convergence/events/infeasibility/viz_meta`（11_backend §2.1）。读-改-写 + 裁剪（非 JSON_ARRAY_APPEND）：MODEL_STATS/SEARCH_STATS 覆盖；PHASE_ENTER 覆盖 phase(含 DIAGNOSING)+push event；NEW_INCUMBENT push `{wall_time=incumbent.wall_time, obj,bound,gap,breakdown}`（**字段名 wall_time，非 t**）；**DIAGNOSIS 覆盖 infeasibility**；裁剪 convergence≤300（保头+下采样+保尾）、events≤200(FIFO)、logs≤1000(保尾)。`progress/metrics/status/message` 仍走 JSON_MERGE_PATCH。
- **验收**：`npx vitest run src/tests/schedulingV5.viz-clamp.test.ts`——350 个 NEW_INCUMBENT→`convergence.length<=300` 且 `viz_meta.convergence_count==350`；250 event→≤200；DIAGNOSIS→infeasibility 非空；convergence 点含 wall_time 键。
- **依赖**：B1。

#### B4 — SSE 透传 + 节流 + result 端点附字段（常规）  · sonnet
- **文件**：`solveProgressSSE.ts`（getSolveProgressSSEV5）、`solveResultHandler.ts`（getSolveResultV5/receiveSolveResultV5）。
- **要点**：SSE payload 形状不变（`{status,stage,error,solver_progress}`），V5 字段在 solver_progress 内；独立 progressEmitter，事件 `run:{id}`；200ms 合并节流（RUNNING 合并，STATUS/FINAL 必发）；每次回调仍落 DB。result 端点附 `infeasibility_analysis`（extractInfeasibilityAnalysis）+ `objective_breakdown`（从 **result.metrics.objective_breakdown** 读）+ `viz`（从 solver_progress 读）。
- **验收**：`npm run test:db` 集成——SSE 客户端收到的 solver_progress 含 convergence/phase 且 V4 字段不丢；mock result 含 infeasibility_analysis → `GET /runs/:id/result` 的 `data.infeasibility_analysis` 非空、`data.objective_breakdown` 来自 metrics。
- **依赖**：B3。

#### B5 — apply/stop/status/precheck/preview 复刻验证（机械复制）  · haiku
- **文件**：`applyResultController.ts`/`solveLifecycle.ts`/`precheckHandler.ts`/`previewProposalController.ts`（均零逻辑差异，仅 URL/日志前缀）。
- **要点**：apply 零逻辑差异（落库/scope-aware delete/双轨/special shift 生命周期/I1-I3 不变量全保留）；stop→`SOLVER_V5_URL/api/v5/abort/:id`；precheck/preview→V5 端点；`capability_gap.code='SOLVER_V5_PREVIEW_UNAVAILABLE'`；preview 仍用 `preview-` request_id 前缀。
- **验收**：`npm run test:db`——V5 run 跑完整 apply，落库表（bpa/esp）与同输入 V4 一致。
- **依赖**：B1。

### Frontend 工单

#### F1 — types + service 层（常规）  · sonnet
- **文件**：`frontend/src/types/solverV5.ts`、`services/schedulingV5Api.ts`、`components/SolverV5/monitor/monitorTypes.ts`、`monitor/monitorColors.ts`。
- **要点**：`SolverConfig = SolverConfigV4Base & SolverConfigV5Extension`（87 字段不动 + 3 增强键 hint=on/lex=off/breakdown=on，§1.6）；schedulingV5Api 集中所有 API，相对 `/api/v5/scheduling/*`，无硬编码 host；monitorColors 全 `var(--wx-*)`；monitorTypes 含 SolveStreamState/PhaseInfo/IncumbentPoint/ModelStat/InfeasibilityGroup（字段对齐 §1.2-1.5）。
- **验收**：`tsc` 编译通过；`npm run test:ci -- schedulingV5Api.test.ts` 断言全走相对路径、无硬编码 host；config 默认值断言。
- **依赖**：无。

#### F2 — 复制 V4 组件为 SolverV5 基线（机械复制）  · haiku
- **文件**：`pages/SolverV5Page.tsx` + `components/SolverV5/*`（主组件 10 + 子组件/views 6，见 12_frontend §1.2-1.3）。**不碰 App.tsx/TopNavigation**（归 I1）。
- **要点**：复制 V4 SolverV4 全部 → 改名 V5、API→`/api/v5/*`；交互/数据流/结果格式原样；`SolveResultV5Page` 换 WxbDrawer/WxbButton/CSS 变量（修 06 坑 A1）；列头汉化（坑 G）。
- **验收**：（接 I1 后）访问 `/solver-v5` 页面与 V4 视觉一致、4 Tab 可点；`npm run build`（CI=false）通过。
- **依赖**：F1。

#### F3 — useSolveStreamV5 hook + 进度小窗（常规）  · sonnet
- **文件**：`monitor/useSolveStreamV5.ts`、`SolverV5/SolveProgressV5Modal.tsx`。
- **要点**：单 EventSource `addEventListener('progress')` + onmessage 兜底；solver_progress 字符串先 JSON.parse；日志增量切片（logs_full 优先 + stripLogIcons）；NEW_INCUMBENT push incumbents（≤300 降采样）+ 刷 latestPreview；phase/phaseTimings 更新；DIAGNOSIS→infeasibility；terminal close。小窗概览（进度条+4 KPI+迷你 sparkline+阶段点+展开监视器按钮+折叠日志）；**V5 字段缺失全降级**（§3.7）。
- **验收**：`npm run test:ci -- useSolveStreamV5.test.tsx`——喂 V4-only/V4+V5/缺失/INFEASIBLE 序列，断言累积正确、incumbent≤300、terminal close、日志无重复；mock EventSource 断言 new 调用=1。
- **依赖**：F1。

#### F4 — 监视器抽屉 + 日志面板（常规）  · sonnet
- **文件**：`monitor/SolveMonitorV5Drawer.tsx`、`monitor/SolveLogPanel.tsx`、`monitor/SolveMonitor.css`。
- **要点**：100vw WxbDrawer，左主栏/右侧栏/底部全宽日志；共享 useSolveStreamV5 实例（props 传 state，不双开连接）；关闭不断 SSE；SolveLogPanel 沿用 V4 双格式 + category pill + stripLogIcons。CSS 仅变量。
- **验收**：点展开开 100vw 抽屉、日志全宽、关闭不断流（mock 断言 EventSource 不重连）。
- **依赖**：F3。

#### F5 — 区块 c 收敛 + 区块 d 分量堆叠（核心可视化）  · opus
- **文件**：`monitor/ConvergenceChart.tsx`、`monitor/ObjectiveBreakdownChart.tsx`。
- **要点**：c 用 `WxbChartCard` 多系列（obj 实线/bound 虚线 line + gap region 阴影 + referenceLine），X 轴读 `incumbents[i].wall_time`；d 用 `WxbChartCard` geometry=bar 堆叠（O0-O8 一柱一时刻），与 c 共用 incumbents 降采样数组；配色 monitorColors；React.memo（比 length+末点）；缺 breakdown 时 d 隐藏。
- **验收**：`npm run test:ci`——喂 incumbents mock 曲线增长、堆叠正确；缺字段降级；收敛终点 obj == 结果页 metrics.objective_value（自洽）。
- **依赖**：F3。

#### F6 — 区块 a/b/e/f（常规可视化）  · sonnet
- **文件**：`monitor/PhaseTimeline.tsx`、`monitor/ModelBuildStats.tsx`、`monitor/IncumbentPreview.tsx`、`monitor/SearchIntensity.tsx`。
- **要点**：a 手写 SVG 横向甘特，**ASSEMBLING 从外层 stage 渲染 + solver phase(5 值含 DIAGNOSING) 拼接**；b `WxbBarChart` **垂直柱+旋转/缩写标签**（无 horizontal prop），约束数读 `by_constraint.count`、变量数读 `by_constraint.vars`；e **WxbGauge 覆盖率环 + WxbBadge 空缺数**（方案 A 聚合，非热力图）；f WxbSparkline×2（searchHistory≤60 点）。各区块缺数据降级。
- **验收**：`npm run test:ci`——各区块 null/正常/异常数据 snapshot + 降级 UI 出现不崩溃。
- **依赖**：F3。

#### F7 — 配置弹窗 V5 增强分区（常规）  · sonnet
- **文件**：`SolverV5/SolverConfigurationModalV5.tsx`。
- **要点**：复用 87 字段 + 追加「V5 求解增强」分区（enable_solution_hint/enable_lexicographic_l4/enable_objective_breakdown）；lex 打开显 WxbTag amber「实验」+ tooltip；文案「不影响最优结果」。无 emoji，WxbIcon/内联 SVG。
- **验收**：`npm run test:ci -- SolverConfigurationModalV5`——87 V4 字段全在、默认值与 V4 一致、3 增强键默认 hint=on/lex=off/breakdown=on。
- **依赖**：F1、F2。

#### F8 — InfeasibilityPanel 无解面板（常规，最低优先级/可降级）  · sonnet
- **文件**：`monitor/InfeasibilityPanel.tsx`。
- **要点**：实时读 `solver_progress.infeasibility.groups[]`，结果读 `infeasibility_analysis.minimal_conflict_groups[]`（组项字段同：group/lit_key/message_zh/suggestion_zh/config_keys）；WxbCard+WxbTag red 每组一卡；「跳到配置→」关结果抽屉→开 SolverConfigurationModalV5 并 scrollIntoView+高亮 config_keys 开关；group 文案 mapping 用 §1.5 七组（含 **POSITION_MUST_FILL**）。缺字段降级为 V4 无解红字。
- **降级开关**：工期紧时可砍交互、仅保 CONFLICT 日志着色（设计 §3.7 已覆盖）。
- **验收**：`npm run test:ci`——喂 INFEASIBLE+infeasibility mock 卡片显示、点跳配置高亮；缺字段降级。
- **依赖**：F3、F7。

### 集成工单（共享文件唯一入口）

#### I1 — 共享文件纯增量注册（集成，唯一触碰共享文件）  · sonnet
- **文件（唯一允许多工单触碰的共享文件，全部收敛此工单）**：
  - `backend/src/server.ts`：①`import schedulingV5Routes` + `app.use('/api/v5/scheduling', schedulingV5Routes)`；②`isSolverMachinePath` 内追加 2 行 v5 匹配（`/api/v5/scheduling/callback/` + `/api/v5/scheduling/runs/:id/status`）。
  - `frontend/src/App.tsx`：`import SolverV5Page`（第 17 行后）+ `/solver-v5` Route（第 226 行后，allowAnonymousInShadow + SOLVER_RUN_READ）。
  - `frontend/src/components/Navigation/TopNavigation.tsx`：第 97 行 solver-v4 后加 solver-v5 项，**icon=`<ExperimentOutlined />`**（区分 V4 的 RocketOutlined）。
  - `backend/.env.sample`：`# --- Solver ---` 段加 `SOLVER_V5_URL=http://localhost:5006`（SOLVER_CALLBACK_SECRET 沿用）。
  - `start_all.sh`：新增 V5 solver 启动块（端口 5006、`gunicorn --workers 1 --threads 4 --timeout 600`、`BACKEND_API_URL=http://localhost:3001/api/v5/scheduling/callback/progress`、共用 SOLVER_CALLBACK_SECRET、ensure_port_available 5006、wait_for_url `/api/v5/health`）。
- **要点**：**纯增量**，不改任何现有行为行。其他所有工单**严禁**触碰这 5 个文件。
- **验收**：`cd backend && npm run build` + `cd frontend && CI=false npm run build` 通过；`./start_all.sh` 后 `curl :5006/api/v5/health` + `curl :3001/api/v5/scheduling/runs` 双通；菜单出现「V5 自动排班」、`/solver-v5` 可达；AUTH_ENFORCE=true 下机器回调不被 401。
- **依赖**：B1、F2（代码就绪后挂载）。

### 验证工单

#### V1 — verify_v5_archive.sh（验证门禁）  · sonnet
- **文件**：`scripts/verify_v5_archive.sh`（新）。
- **规格**（仿 verify_v4_archive.sh，步骤）：
  ```
  [1] solver_v5 compileall（contracts core constraints objectives）
  [2] solver_v5 unittest（复制 5 用例 + 新增 test_breakdown_equivalence/test_hint_no_fix/test_lexicographic/test_infeasibility/test_callback_auth）
  [3] Guardrail: rg 'import solver_v4|from solver_v4' solver_v5/ 必须无命中
  [4] Guardrail: diff solver_v5/contracts/request.py solver_v4/contracts/request.py 必须空
  [5] Guardrail: 6 废弃文件不存在于 solver_v5/
  [6] backend build + frontend build（CI=false）
  [7] 回归对比 A 轮（compare_v4_v5.py --mode all-off）抽样 N 个 request json：
      OPTIMAL 档逐字节一致；超时(TIMEOUT-NOISY)档 L0 不退化 + L1-L3 ≤ noise-tolerance（默认 5%）
  ```
- **验收**：`./scripts/verify_v5_archive.sh` 全绿（exit 0）。
- **依赖**：S0-S7、B1-B5、F1-F8、I1。

#### V2 — compare_v4_v5.py 回归对比（核心验证）  · opus
- **文件**：`scripts/compare_v4_v5.py`（新）。
- **规格**：
  ```
  对每个 solver_v4/logs/request_*.json：
    r4 = POST :5005/api/v4/solve
    r5 = POST :5006/api/v5/solve（按 --mode 设 config）
    L0 status:  V4 有解(OPTIMAL/FEASIBLE) → V5 不得 INFEASIBLE/FAILED
    L1 special_shift_shortage_total: V5 ≤ V4
    L2 vacant_positions:             V5 ≤ V4
    L3 objective_value: 同 OPTIMAL → 整数严格相等；V4 FEASIBLE → V5.obj ≤ V4.obj
    L4 breakdown:  L0-L3 相等时逐分量不显著劣化（lex on 时 V5 ≤）
    额外: Σ(权重·v5.metrics.objective_breakdown) == v5.objective_value（权重集 §1.4）
  --mode all-off（enable_solution_hint=false, enable_lexicographic_l4=false, enable_objective_breakdown=false）
        → A 轮「真·全关」同模型对照（见下「裁判语义（修订）」）。
          【修订原因】breakdown=true 会为 O0-O8 各建一个观测 IntVar（obs==exprN）并
          finalize obs_total，这些变量进 CP-SAT 模型、改变 presolve/搜索轨迹，故 A 轮必须
          关掉 breakdown 才是真正的「同模型」对照。Σ 加权和等价自检改在 --mode default 做。
  --mode default（hint on / lex off / breakdown on）
        → B 轮：OPTIMAL 场景 obj==V4；超时场景 obj≤V4。产出 objective_breakdown，
          做 Σ(权重·分量)==objective_value 加权和等价自检（§1.4）。
  --mode lex-on（enable_lexicographic_l4=true）
        → C 轮：L0-L3==V4，L4 各分量 ≤ V4（字典序改善）
  输出：每请求一行 PASS/FAIL + 劣化分量；非零退出码即门禁失败
  ```
- **裁判语义（修订）**：CP-SAT 多 worker、无固定 random_seed、命中墙钟时间上限时**非确定性**——
  同输入 V4-vs-V4 两次都不可复现（超时档 objective/best_bound/gap/schedules 随墙钟漂移，方向随机）。
  故逐字节门禁**仅对 OPTIMAL 档成立**：
  - **双方都 OPTIMAL**（gap=0、确定性收敛）→ 既有决策 metrics（objective_value / shortage /
    vacancy / assigned_count / fill_rate / total_positions / scheduled_shifts / deviation /
    best_bound / gap）**逐字节硬门禁**；schedules 等价最优解差异记软提示不判 FAIL。
  - **任一方非 OPTIMAL**（超时 FEASIBLE，输出标 `TIMEOUT-NOISY`）→ 只 **L0 status 硬门禁**
    （V4 有解 V5 不得退化为 INFEASIBLE/FAILED）；**L1/L2/L3 用对称噪声判定**：仅当 V5 相对 V4
    劣化 > `--noise-tolerance`（默认 5%）才 FAIL，噪声带内的好/坏方向**都打印**（V5 better /
    V5 worse-within-noise）供人工裁断，不据此判 FAIL。
- **自校验**：`--v5-url` 指向 V4 服务即 V4-vs-V4 对照，量化墙钟噪声底噪；若 V4-vs-V4 自身就
  触发某档 FAIL，说明阈值过紧（放宽 `--noise-tolerance`），而非 V5 引入系统漂移。
- **验收**：
  - `python3 scripts/compare_v4_v5.py --mode all-off`：**OPTIMAL 档**全 PASS（逐字节一致）；
    **超时(TIMEOUT-NOISY)档** L0 不退化、L1-L3 不超过 `--noise-tolerance`（默认 5%）劣化，
    方向随机（V5 两好两坏）属墙钟噪声、非系统漂移。
  - `python3 scripts/compare_v4_v5.py --mode default`：无 L0-L3 劣化；Σ 加权和等价自检通过。
- **依赖**：S1-S7（求解器全功能）、I1（双服务起）。

#### V3 — 事件流抓取测试（验证）  · sonnet
- **文件**：`scripts/capture_v5_events.py`（新）。
- **规格**：mock backend 收 v5 回调，跑中等规模 solve，断言：phase 序列 BUILDING→SOLVING→EXTRACTING（无解含 DIAGNOSING）；恰一条 MODEL_STATS（num_constraints==Σcount、by_constraint 含 count/ms/vars）；SOLUTION ≤1/s 且含 incumbent.breakdown；preview 频率符 §2.5；单 payload<5KB；全程无 null 覆盖；convergence 点用 wall_time。
- **验收**：`python3 scripts/capture_v5_events.py` 全断言通过。
- **依赖**：S2-S4、S7。

---

## 3. 共享文件冲突分析

| 共享文件 | 触碰工单 | 收敛策略 |
|---|---|---|
| `backend/src/server.ts` | 仅 **I1** | B*/F* 严禁碰；isSolverMachinePath 2 行 + app.use 2 行均在 I1 |
| `frontend/src/App.tsx` | 仅 **I1** | F2 写页面但不挂路由；挂载在 I1 |
| `frontend/src/components/Navigation/TopNavigation.tsx` | 仅 **I1** | 菜单项（ExperimentOutlined）在 I1 |
| `backend/.env.sample` | 仅 **I1** | SOLVER_V5_URL 增量 |
| `start_all.sh` | 仅 **I1** | V5 solver 启动块 |
| `scripts/verify_*.sh` | V1 新建独立文件 | 不改 verify_v4_archive.sh |
| `frontend/.../wxb-ui/index.ts` | **无人改** | 监视器组件不进 wxb-ui，直接引 |

> 铁律：上述 5 个共享文件**只有 I1 可写**。所有 solver_v4/ 与 V4 链路文件（backend schedulingV4/*、DataAssemblerV4.ts、SolverV4/*）**零改动**（R1）。

---

## 4. 工单依赖图（并行度）

```
S0 → S1 → S2 ─┐
         └─ S3 → S4
         └─ S3 → S6
         └─ S5
         └─ S7
B1 → B2
B1 → B3 → B4
B1 → B5
F1 → F2 → F7 → F8
F1 → F3 → {F4, F5, F6, F8}
(B1+F2) → I1
全部 → V1 ;  S1-S7+I1 → V2 ;  S2-S4+S7 → V3
```

并行波次：W1={S0,B1,F1}；W2={S1,B2,B3,B5,F2,F3}；W3={S2,S3,S5,S7,B4,F4,F7}；W4={S4,S6,F5,F6,F8,I1}；W5={V1,V2,V3}。

---

## 5. 退出门禁（发布前必过）

1. `./scripts/verify_v5_archive.sh` exit 0。
2. `compare_v4_v5.py --mode all-off`（**A 轮 CI 阻断门**）：OPTIMAL 档 100% 逐字节一致；
   超时(TIMEOUT-NOISY)档 L0 不退化、L1-L3 不超过 noise-tolerance（默认 5%）劣化
   （逐字节门禁仅对 OPTIMAL 档成立——超时档墙钟非确定性，方向随机属噪声非系统漂移）。
3. `compare_v4_v5.py --mode default` 无 L0-L3 劣化；Σ 加权和等价自检通过。
4. solver 同构性测试（test_infeasibility 可行输入门禁）通过。
5. breakdown 等价断言（test_breakdown_equivalence 多场景）通过。
6. `cd backend && npm run test:ci` + `cd frontend && npm run test:ci` 通过。
7. R1 守卫：`rg 'import solver_v4' solver_v5/` 无命中；V4 链路文件 git diff 仅 I1 的 5 个共享文件。
