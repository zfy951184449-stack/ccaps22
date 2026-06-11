# solver_v5 求解器设计文档

> 范围：仅 `solver_v5/` Flask 求解器服务（端口 5006、端点前缀 `/api/v5/*`）。后端链路与前端设计各有独立文档。
> 基线：commit a237777（main），OR-Tools 9.15.6755 / Python 3.9 / Flask 3.1。
> 必读前置：`docs/solver_v5/research/00_v4_system_map.md`（L0-L4 判定、A-F 边界、4a/4b/4c 机会点）。
> 设计原则锚定指挥官决策 D1-D6 与用户需求 R1-R6；凡偏离均在文末「异议」章节单列。
> 代码符号一律英文，注释/文案中文。本文档**不修改任何源码**。

---

## 0. 总览与设计立场

### 0.1 一句话定位

solver_v5 = **复制 solver_v4 全部源码作为基线**（不 `import solver_v4`，物理隔离、零耦合），在四个明确的「增量增强点」上做**纯加法**改造：

1. **事件流增强**（R5 核心）——callback 扩展 `phase/event/model_stats/incumbent.breakdown/search_stats` 字段，V4 字段只增不改。
2. **objective_breakdown**（R2 验收基石）——为 O0-O8 每个分量建显式观测 IntVar（`== 原表达式`），不改 `model.Minimize` 数学。
3. **solution hint**（D5 最高优先）——软 hint 注入，绝不 fix。
4. **lexicographic 第二阶段**（D5 次优先，默认**关**）——仅在 L4 层优化，L0-L3 锁定。
5. **无解诊断 pass**（R6 加分）——仅 INFEASIBLE 时触发，按业务约束组挂 assumption literal。

### 0.2 不变量铁律（来自 00_system_map §5 A-F + L0-L4）

solver_v5 必须**逐字节保持**与 V4 等价的部分（任一破坏即违反 R2/R3）：

| 不变量 | 内容 | 本设计如何保障 |
|---|---|---|
| 请求 schema | `contracts/request.py` 全字段、负 ID=standalone、候选预筛、UTC ISO、`_shift_relevant_employee_ids` 铁律 | `contracts/request.py` 整文件**逐字节复制**，零改动 |
| 目标数学 | 权重、量纲、O5/O6 的 L2 平方、`absolute_gap_limit=0.99` 整数最优判据 | `_build_objectives` 的 `model.Minimize(sum(objective_terms))` 表达式**完全照搬**；breakdown 只是旁挂观测变量 |
| 约束语义 | 16 注册约束 + 注册顺序（FrozenRange 必第一） | `constraints/` 16 个文件逐字节复制；registry 顺序不变 |
| 结果 payload | 班次锚定 `schedules[].{employee_id,date,shift,tasks[]}` + metrics 字段名（含误导性 `total_deviation_hours`）| `_extract_solution` 照搬；新增 `objective_breakdown` 作为 metrics 旁挂键，不动既有键 |
| 回调协议 | `{run_id,status,type}` + `progress/metrics/message/log_line`、deferred+monitor 1s flush、`SOLVER_CALLBACK_SECRET` | `_send_now` payload 在 V4 字段后追加，并发模型照搬 |
| CP-SAT 参数 | `num_workers / linearization_level=2 / symmetry_level=2 / absolute_gap_limit=0.99` | `SolverV5.__init__` 照搬（对称性破除本期不做，D5）|

---

## 1. 目录与文件清单

### 1.1 复制规则

`solver_v5/` 由脚本 `scripts/init_solver_v5.sh`（新增，见 §8.2）从 `solver_v4/` **复制**生成，复制后做三类处理：(a) 保留不动；(b) 重命名类/常量 V4→V5；(c) 增强（加方法/字段）。**禁止 import solver_v4**（D1）。

> 注意：复制源码后，类名 `SolverV4`→`SolverV5`、`APICallback`→`APICallbackV5`、`SolverContext` 保留同名（纯数据容器，无版本语义）；version 字符串 `"4.0.0-alpha"`→`"5.0.0-alpha"`。约束/目标类名**保持不变**（如 `ShareGroupConstraint`），因为它们物理隔离在 `solver_v5/constraints/`，与 V4 无符号冲突，改名只会徒增 diff 噪声。

### 1.2 完整文件清单

```
solver_v5/
├── app.py                         # [增强] Flask 4 端点 /api/v5/*；端口 5006；增 abort 跨进程兜底
├── requirements.txt               # [复制+收紧] ortools==9.15.6755 等 pin 版本
├── .env.sample                    # [增强] 增 SOLVER_V5_PORT/BACKEND_API_URL(指向 v5 回调)
├── Procfile                       # [复制+改] gunicorn app:app（worker 数策略见 §7.4）
├── Dockerfile                     # [复制+改端口] EXPOSE 5006
│
├── contracts/
│   └── request.py                 # [逐字节复制] 零改动——保证求解输入与 V4 完全一致
│
├── core/
│   ├── solver.py                  # [增强] SolverV5：+hint 注入 +breakdown 观测变量 +lex 第二阶段 +诊断 pass 入口
│   ├── callback.py                # [增强] APICallbackV5：+phase/event/model_stats/search_stats/breakdown 上报；+下采样
│   ├── context.py                 # [增强] SolverContext +breakdown_vars +assumption_literals +stats 钩子字段
│   ├── index.py                   # [逐字节复制] AssignmentIndex / ShiftIndex 零改动
│   ├── precheck.py                # [逐字节复制] run_precheck 零改动
│   ├── stats_collector.py         # [新增] 模型规模/约束计时计数采集器（registry 处包一层，不改约束类）
│   ├── breakdown.py               # [新增] O0-O8 分量观测变量工厂 + callback 取值 + 与 V4 表达式逐项对齐校验
│   ├── hint_provider.py           # [新增] solution hint 来源（上次 run 解 → 贪心兜底）与注入（软 hint）
│   ├── lexicographic.py           # [新增] L4 第二阶段：锁 L0-L3、超时预算分配、失败回退
│   └── infeasibility.py           # [新增] 七组 assumption literal 挂法 + 诊断 pass + literal→业务文案映射
│
├── constraints/
│   ├── __init__.py                # [复制]
│   ├── base.py                    # [复制] BaseConstraint 接口不变
│   ├── registry.py                # [增强] 同 16 约束同顺序；额外导出 ALL_CONSTRAINTS 供 stats_collector 包计时
│   ├── frozen_range.py            # [复制]（§9 评估是否补 pass 留白；本期默认不改）
│   ├── share_group.py             # [复制]
│   ├── unique_employee.py         # [复制]
│   ├── locked_operations.py       # [复制]
│   ├── one_position.py            # [复制]
│   ├── employee_availability.py   # [复制]
│   ├── locked_shifts.py           # [复制]
│   ├── shift_assignment.py        # [复制]
│   ├── leadership_coverage.py     # [复制]（LEADER_ROLES 常量被 _shift_relevant_employee_ids 引用）
│   ├── flexible_scheduling.py     # [复制]
│   ├── consecutive_days.py        # [复制]
│   ├── standard_hours.py          # [复制]
│   ├── night_shift.py             # [复制]
│   ├── special_shift_joint_coverage.py # [复制]
│   ├── prefer_standard_shift.py   # [复制]
│   └── consecutive_work_rest_pattern.py # [复制]（默认 OFF）
│   # ▼ 不复制的 4 个废弃文件（磁盘存在但 registry 未注册）——V5 删除以杜绝误用：
│   #   night_rest.py / night_shift_interval.py / no_isolated_night_shift.py / consecutive_rest_limit.py
│   #   另：work_days_limit.py 同属废弃（被 consecutive_days.py 取代），亦不复制
│
├── objectives/
│   ├── __init__.py                # [复制+删废弃 export] 去掉 minimize_hours 的 export
│   ├── base.py                    # [复制] ObjectiveBase 不变
│   ├── minimize_special_coverage_shortage.py  # [复制] O0
│   ├── minimize_vacancies.py      # [复制] O1
│   ├── minimize_special_coverage_impact.py    # [复制] O2
│   ├── minimize_deviation.py      # [复制] O3
│   ├── minimize_special_shifts.py # [复制] O4
│   ├── balance_night_shifts.py    # [复制] O5（L2 平方保留）
│   ├── balance_weekend_work.py    # [复制] O6（L2 平方保留）
│   ├── minimize_triple_salary.py  # [复制] O7
│   # ▼ 不复制：minimize_hours.py（MinimizeTotalHours，export 但从不被调用，死代码）
│
├── utils/
│   ├── __init__.py                # [复制]
│   ├── logger.py                  # [复制] SolveRunLogger / setup_logging
│   └── time_utils.py              # [复制] get_date_range / parse_iso_to_unix
│
├── logs/                          # [运行期生成] request_{id}.json（与 V4 同机制，便于 V4/V5 回归对比）
│
└── tests/
    ├── __init__.py                # [复制]
    ├── test_shift_assignment.py   # [复制] 回归基线
    ├── test_share_group.py        # [复制]
    ├── test_locked_constraints.py # [复制]
    ├── test_special_shift_joint_coverage.py # [复制]
    ├── test_config_toggles.py     # [复制]
    ├── test_callback_auth.py      # [复制+改端点] 校验 v5 鉴权头
    ├── test_breakdown_equivalence.py  # [新增] breakdown 之和 == objective_value（数学等价铁证）
    ├── test_hint_no_fix.py        # [新增] hint 不一致时仍能求到与 V4 相等的最优值
    ├── test_lexicographic.py      # [新增] 第二阶段后 L0-L3 不变、L4 不劣化、失败回退正确
    └── test_infeasibility.py      # [新增] 七组 literal 命中正确、可行时零开销、主模型干净
```

**删除的废弃文件汇总（R2 安全：这些文件 registry 从未注册，删除不影响任何结果）**：
`constraints/night_rest.py`、`constraints/night_shift_interval.py`、`constraints/no_isolated_night_shift.py`、`constraints/consecutive_rest_limit.py`、`constraints/work_days_limit.py`、`objectives/minimize_hours.py`。
（同时 `verify_*.py` 顶层零散验证脚本不复制——它们是 V4 开发期手测脚本，被 `tests/` 正式用例取代。）

---

## 2. V5 事件流设计（R5 核心）

### 2.1 设计目标与约束

让用户「看懂求解器正在发生什么」，但**必须**：
- (a) V4 callback 字段只增不改（D4、§5C）；
- (b) 复刻 deferred + monitor 1s flush 并发模型（不在 CP-SAT worker 线程同步发 HTTP）；
- (c) payload 大小可控（中间解快照下采样）；
- (d) 同一 `SOLVER_CALLBACK_SECRET` + header `X-Solver-Callback-Token` 鉴权；
- (e) 走**独立 v5 回调端点**（backend 新增 `/api/v5/scheduling/callback/*`，由后端文档负责），solver 侧 `BACKEND_API_URL` 默认指向它。

### 2.2 callback 类扩展（`core/callback.py` → `APICallbackV5`）

保留 V4 全部方法与 `_send_now` payload 基底，在三处加料。**`_send_now` payload schema（V4 字段 + V5 新增）**：

```jsonc
{
  // ── V4 原字段（语义、类型、默认完全不变）──
  "run_id":   <int|str>,
  "status":   "RUNNING" | "COMPLETED" | "FAILED",
  "type":     "STATUS" | "SOLUTION" | "LOG" | "FINAL" | "INFO",
  "progress": <int 0-100, optional>,
  "metrics":  { ... , optional },              // SOLUTION 时含 solution_count/objective_value/best_bound/gap/wall_time
  "message":  <str, optional>,
  "log_line": <str, optional>,

  // ── V5 新增（旧前端忽略未知字段，天然向后兼容；新前端按 phase/event 渲染可视化）──
  "phase":    "BUILDING" | "PRESOLVE" | "SOLVING" | "EXTRACTING" | "DIAGNOSING",   // optional
  "event":    "PHASE_ENTER" | "MODEL_STATS" | "NEW_INCUMBENT" | "SEARCH_STATS" | "DIAGNOSIS",  // optional
  "model_stats": {                              // 仅 event=MODEL_STATS 携带（一次性，BUILDING 末）
    "num_vars":        <int>,                   // 决策变量总数（assignment+shift+vacancy+special+placement）
    "num_constraints": <int>,                   // registry 累计 apply() 返回之和
    "by_layer": {                               // 变量分层规模（供分量条形图）
      "assignments": <int>, "shift": <int>, "vacancy": <int>,
      "special_cover": <int>, "special_shortage": <int>, "task_placement": <int>
    },
    "by_constraint": {                          // 每约束贡献的约束条数 + 耗时(ms) + 该约束新增变量数
      // 冻结 schema（三文档统一，见 20_IMPLEMENTATION_PLAN §冻结契约）：每条目恒为 {count, ms, vars}
      "FrozenRange":  {"count": <int>, "ms": <float>, "vars": <int>},
      "ShareGroup":   {"count": <int>, "ms": <float>, "vars": <int>},
      "...":          {"count": <int|"OFF">, "ms": <float>, "vars": <int>}   // OFF 时 ms=0, vars=0
    },
    "presolve": {                               // 可选，仅 SOLVER_DEBUG=1 解析到时填；否则省略
      "vars_before": <int>, "vars_after": <int>,
      "ctrs_before": <int>, "ctrs_after": <int>
    }
  },
  "incumbent": {                                // 仅 event=NEW_INCUMBENT 携带（伴随 type=SOLUTION）
    "obj":       <float>,                       // == metrics.objective_value（冗余便于前端单点取）
    "bound":     <float>,
    "gap":       <float>,
    "wall_time": <float>,
    "breakdown": {                              // O0-O8 当前解分量值（下采样：见 §2.4）
      "special_shortage_penalty": <int>,        // O0
      "vacancy_penalty":          <int>,        // O1
      "special_impact":           <int>,        // O2
      "hours_deviation_scaled":   <int>,        // O3
      "special_shift_count":      <int>,        // O4
      "night_shift_variance":     <int>,        // O5（L2 平方和原值）
      "weekend_work_variance":    <int>,        // O6
      "triple_salary_count":      <int>,        // O7
      "leadership_penalty":       <int>         // O8
    },
    "preview": {                                // 中间解缩略快照（下采样，§2.5），可为 null
      // 字段名统一为 preview（三文档对齐，原 snapshot 弃用）。采轻量聚合格式（方案 A）：
      "fill_rate":        <float>,              // 覆盖率（前端区块 e 渲染进度环）
      "vacant_positions": <int>,                // 空缺数（前端渲染徽章）
      "scheduled_shifts": <int>,
      "top_assignments":  [ {"op": <int>, "pos": <int>, "emp": <int>} ]   // 最多 N 条（可选明细）
    }
  },
  "search_stats": {                             // 仅 event=SEARCH_STATS 携带（monitor 每 5s 心跳搭载）
    "branches":  <int>,                         // solver.NumBranches()
    "conflicts": <int>,                         // solver.NumConflicts()
    "booleans":  <int>                          // solver.NumBooleans()
  }
}
```

> 关键：`phase/event` 是**互斥语义标签**。一个 payload 只携带与其 `event` 对应的那一个对象（`model_stats` XOR `incumbent` XOR `search_stats`），避免 payload 膨胀。`type` 仍按 V4 取值（NEW_INCUMBENT 走 `type=SOLUTION`，MODEL_STATS/SEARCH_STATS/PHASE_ENTER 走 `type=INFO`），后端旧解析逻辑零感知。

### 2.3 约束统计采集（不改各约束类）——`core/stats_collector.py`

铁律：**不修改任何约束类**（它们是逐字节复制的）。在 `solver.py:_apply_constraints` 的 registry 调用处**包一层**：

```python
# core/solver.py（SolverV5._apply_constraints 内，仅改胶水，不改约束类）
from core.stats_collector import StatsCollector
collector = StatsCollector()                      # 新增
for cls in CORE_CONSTRAINTS:                       # 原循环
    enabled = config.get(cls.config_key, cls.default_enabled) if cls.config_key else True
    if enabled:
        with collector.measure(cls.name):          # 计时上下文（time.perf_counter 包裹 apply）
            count = cls(logger=logger).apply(ctx, req)
        collector.record(cls.name, count)          # 记录条数
    else:
        collector.record(cls.name, "OFF")
# SHIFT_CONSTRAINTS 同理
...
# BUILDING 末：把变量分层规模灌入 collector，并发 MODEL_STATS 事件
collector.set_layers(num_assignments=len(assignments), num_shift=len(shift_assignments), ...)
if callback:
    callback.emit_model_stats(collector.to_payload())   # 见 §2.2 model_stats
```

`StatsCollector` 设计：

```python
class StatsCollector:
    def __init__(self): self._by_constraint = {}; self._layers = {}
    @contextmanager
    def measure(self, name): t0 = time.perf_counter(); yield; self._last_ms = (time.perf_counter()-t0)*1000
    def record(self, name, count): self._by_constraint[name] = {"count": count, "ms": round(self._last_ms,2) if count!="OFF" else 0.0}
    def set_layers(self, **kw): self._layers = kw
    def to_payload(self) -> dict:  # {num_vars, num_constraints, by_layer, by_constraint, presolve?}
        ...
```

> 注意 Python 3.9：`@contextmanager` 来自 `contextlib`，无 3.10+ 语法。`callback.emit_model_stats` 是 deferred-safe（写内存，由 monitor flush）。

`num_constraints` = Σ `by_constraint[*].count`（"OFF" 计 0）。MODEL_STATS 是**一次性**事件（BUILDING 阶段末发一条），不随解刷新，payload 体量固定且小。

### 2.4 incumbent.breakdown 取值（不改 objectives）——`core/breakdown.py`

为每个 O0-O8 分量建一个**显式观测 IntVar**：`obs_var == 原 objective 表达式`，注册进 callback 缓存。新解回调时 `self.Value(obs_var)` 取值，组装进 `incumbent.breakdown`。详见 §3。

下采样策略（控 payload）：
- **breakdown 永远携带**（9 个整数，~200 字节，可忽略）。
- 频率受 monitor 1s flush 天然节流：worker 可能 0.1s 内连发 5 个解，但 `_latest_solution` 只留最新一条（V4 已有 `_latest_solution` 覆盖逻辑，§4.7），所以最多 1s 一条 SOLUTION，breakdown 随之 1s 一条。

### 2.5 中间解快照下采样（控 payload 大小）

`incumbent.preview`（字段名统一为 `preview`）是「最新方案预览」的数据源。全量 schedules 可能数千条，**绝不**整包随每个解上报。**采轻量聚合格式（方案 A）**：只发 `fill_rate/vacant_positions/scheduled_shifts` 聚合指标 + 可选 `top_assignments`，**不发**员工×日期稀疏矩阵（避免 on_solution_callback 重建映射的高成本）。前端区块 e 据 `fill_rate` 画覆盖率进度环 + `vacant_positions` 徽章，而非完整热力图。下采样策略：

| 维度 | 策略 |
|---|---|
| **频率** | 仅当 (a) 是首解，或 (b) 距上次快照 ≥ `snapshot_min_interval`（默认 8s），或 (c) obj 相对改善 ≥ 5% 时才计算 preview；否则 `preview: null`（前端复用上一帧）。由 callback 内 `_last_snapshot_time/_last_snapshot_obj` 控制 |
| **内容** | 只算**聚合指标** `fill_rate/vacant_positions/scheduled_shifts`（从已缓存的 `cached_solution` 直接数，O(vars)，不重跑 extract）+ `top_assignments`（按 op_id 排序取前 `snapshot_top_n`，默认 50 条 `{op,pos,emp}`）。**不含 ISO 时间串、不含 tasks 嵌套**——那是最终结果的活 |
| **大小上界** | 50 条 × ~30 字节 ≈ 1.5KB + 聚合 ~100 字节 < 2KB，安全 |
| **计算时机** | 在 `on_solution_callback` 内（此时 `self.Value` 可用），直接读 worker 当前解的 assignment/vacancy/shift 值聚合，避免 monitor 线程读变量（线程安全风险）|

> 设计取舍：snapshot 在 worker 线程算（轻量聚合，<1ms），但**发送**仍走 deferred（写进 `_latest_solution` 的扩展槽，monitor flush）。这样既线程安全又不阻塞 worker。

### 2.6 阶段时间轴（PHASE_ENTER）

`solver.py` 在进入每个 phase 时调 `callback.emit_phase(name, t)`：`BUILDING`（_build_variables 入口）→ `SOLVING`（_run_solver 入口）→ `EXTRACTING`（_handle_result 入口）→（INFEASIBLE 分支额外）`DIAGNOSING`。`PRESOLVE` 无法精确插桩（CP-SAT 内部黑盒），仅当 `SOLVER_DEBUG=1` 从 `log_search_progress` 文本解析到 presolve 摘要时补发一条 MODEL_STATS.presolve；否则前端把 PRESOLVE 并入 SOLVING 段的前缀。每个 PHASE_ENTER 带 `wall_time`，前端据相邻时间差画甘特式阶段条。

---

## 3. objective_breakdown 设计（R2 验收基石）

### 3.1 原则：观测不改优化

V4 `_build_objectives` 末尾是 `self.model.Minimize(sum(objective_terms))`。V5 **照搬这一行与所有 term 构造**，仅**额外**为每个 term 建一个观测变量。优化方向、权重、量纲、整数判据**全不变** → 同输入下 OPTIMAL 的 `objective_value` 与 V4 逐字节相等（R2 L3 铁律）。

### 3.2 观测变量建法（`core/breakdown.py`）

每个分量观测变量满足 `obs == 该分量在最终目标里的「未乘外层权重的原始量」`（与 §00 L4 字典对齐）：

| 键 | 观测的原始量（与 V4 表达式逐项一致）| 构造 |
|---|---|---|
| `special_shortage_penalty` (O0) | `Σ PRIORITY_WEIGHTS[p]·shortage_var`（O0 本就含权重，无外层乘子）| `obs = NewIntVar(0, UB); model.Add(obs == expr_O0)` |
| `vacancy_penalty` (O1) | `Σ final_weight·vacancy_var`（含动态峰值/非标时段乘子）| `model.Add(obs == expr_O1)` |
| `special_impact` (O2) | `Σ impact_cost·cover_var`（未乘 `w_impact`）| `model.Add(obs == expr_impact)` |
| `hours_deviation_scaled` (O3) | `Σ deviation_var`（×100 缩放，未乘 `w1`）| `model.Add(obs == expr_dev)` |
| `special_shift_count` (O4) | `Σ special_shift_var`（未乘 `w2`）| `model.Add(obs == expr_special)` |
| `night_shift_variance` (O5) | `Σ NightCountSq_e`（L2 平方和，未乘 `w3`）| `model.Add(obs == expr_night)` |
| `weekend_work_variance` (O6) | `Σ WeekendCountSq_e`（未乘 `w4`）| `model.Add(obs == expr_weekend)` |
| `triple_salary_count` (O7) | `Σ triple_salary_shift_var`（未乘 `w5`）| `model.Add(obs == expr_triple)` |
| `leadership_penalty` (O8) | `Σ var·weight`（penalty_vars，权重内嵌）| `model.Add(obs == expr_leadership)` |

> **关键实现细节**：V4 把表达式直接塞进 `objective_terms` 列表后即丢弃中间引用。V5 在 `_build_objectives` 里把每个 `exprN` **同时**：(1) 乘外层权重塞进 `objective_terms`（与 V4 完全一致）；(2) 传给 `breakdown.register(key, exprN_unweighted)` 建观测变量。两步用同一个 `exprN` 对象，**不可能漂移**。

### 3.3 等价性自检（编译期 + 运行期双保险）

- **运行期断言**（`test_breakdown_equivalence.py`）：求解后校验
  `Σ (外层权重_k × breakdown[k]) == objective_value`（整数严格相等）。
  外层权重映射（**修订：显式标注内嵌权重的分量外层权重=1**）：
  - **O0**（special_shortage）外层权重=**1**：`PRIORITY_WEIGHTS` 已内嵌进表达式，`objective_terms.append(expr0)` 不带外层乘子。
  - **O1**（vacancy）外层权重=**1**：`final_weight`（= base_weight × peak_mult × off_hours_mult，含动态峰值日/非标时段乘子）已内嵌进表达式，不带外层乘子。
  - **O8**（leadership）外层权重=**1**：各 penalty 的 `(var, weight)` 权重已内嵌。
  - O2=`w_impact`，O3=`w1`，O4=`w2`，O5=`w3`，O6=`w4`，O7=`w5`。
  即断言权重集 `{O0:1, O1:1, O2:w_impact, O3:w1, O4:w2, O5:w3, O6:w4, O7:w5, O8:1}`。
  ⚠️ 实现者**不得**误把 O1 写成 `base_weight × breakdown[O1]`（base_weight=10000 等）——O1 的全部权重已在表达式内，外层乘子恒为 1。
  `test_breakdown_equivalence.py` 必须对**含动态权重的场景分别验证**（峰值日有空缺、非标时段有空缺、有专项欠配），不能只测无空缺的平凡场景（否则掩盖 O1 动态乘子的数学错误）。
  此断言是「V5 目标数学未被 breakdown 改坏」的铁证，进 CI。
- **回归脚本**（§8.4）：对同一 `request_{id}.json` 跑 V4(5005) 与 V5(5006)，比对 `objective_value` 整数相等 + breakdown 之和等于它。

### 3.4 result.metrics 扩展

`_extract_solution` 返回的 `metrics` dict **新增**一个键（不动任何既有键）。**冻结路径：`result.metrics.objective_breakdown`**（在 metrics 容器内，与 objective_value/best_bound 并列；backend/frontend 均从 `result.metrics.objective_breakdown` 读取，**不是** result 顶层）。仅当 `config.enable_objective_breakdown=true`（默认）时存在；关掉则整个 `objective_breakdown` 键省略。

```jsonc
"metrics": {
  ...全部 V4 既有键（assigned_count/objective_value/best_bound/gap/total_deviation_hours/...）...,
  "objective_breakdown": {            // V5 新增
    "special_shortage_penalty": ..., "vacancy_penalty": ..., "special_impact": ...,
    "hours_deviation_scaled": ..., "special_shift_count": ..., "night_shift_variance": ...,
    "weekend_work_variance": ..., "triple_salary_count": ..., "leadership_penalty": ...,
    "weights_applied": {              // 透出实际用的外层权重，便于前端/对比脚本重算
      "special_impact": <w_impact>, "hours_deviation": <w1>, "special_shifts": <w2>,
      "night_balance": <w3>, "weekend_balance": <w4>, "triple_salary": <w5>
    }
  }
}
```

取值用与 §3.2 同一套观测变量，经 `get_var_value`（V4 已有的缓存回退取值器）读出，兼容超时/中断的 cached_solution 路径。

---

## 4. solution hint 设计（D5 最高优先）

### 4.1 来源选择：双层兜底（最稳妥）

| 优先级 | 来源 | 取数 | 何时可用 |
|---|---|---|---|
| 1（首选）| **上次同 scope run 的解** | 后端在 `/api/v5/scheduling/solve` 请求体注入 `config.hint.previous_solution`（结构=精简的 `{assignments:[{op,pos,emp}], shifts:[{emp,date,shift}]}`），由后端从 `scheduling_runs.result_summary` 提取上一条 APPLIED/COMPLETED 同窗 run | 区间求解/重排场景（与 V4 锁定/冻结同生态，命中率高）|
| 2（兜底）| **贪心启发式解** | solver 内 `hint_provider.greedy_hint(req, vars)`：按 op 时间排序，对每个 (op,pos) 选「候选里当前负载最低且资质满足」的员工填 assignment hint；shift 层按 op 覆盖班次给最早可覆盖班次 hint | 任何场景（无上次解时）|

> 设计立场：**首选用上次 run 解**，因为它是「真实可行的高质量种子」，对增量/重排加速最明显；贪心兜底保证「冷启动也有 hint」。两者都只产出 hint，不产出约束。

### 4.2 注入方式：软 hint，**绝不 fix**（D5 铁律）

```python
# core/hint_provider.py
def apply_hint(model, vars_bundle, hint: dict):
    # 入口大包围：任何异常（含格式错误/类型错误/KeyError/AttributeError）都静默跳过 hint，
    # 绝不向上抛出 —— hint 失败必须等同于「无 hint」，不能中断整个 solve（非 R2 容忍的 FAILED）
    try:
        # 只对 hint 中明确点名、且在本次模型里存在的变量加 AddHint
        for (op, pos, emp) in hint.get("assignments", []):
            v = vars_bundle.assignments.get((op, pos, emp))
            if v is not None:
                model.AddHint(v, 1)        # 软 hint：CP-SAT 仅当可行时利用，不可行直接忽略
        for (emp, date, shift) in hint.get("shifts", []):
            v = vars_bundle.shift_assignments.get((emp, date, shift))
            if v is not None:
                model.AddHint(v, 1)
    except Exception as e:
        logger.warning(f"hint 注入异常，已静默跳过（退化为无 hint）：{e}")
        return  # 安全降级
    # ⛔ 绝不设置 solver.parameters.fix_variables_to_their_hinted_value = True
    # ⛔ 绝不 model.Add(...) 任何基于 hint 的硬约束
```

> **跨输入失配处理**：`previous_solution` 可能含本次模型不存在的 (op,pos,emp)（上次解的工序/员工本次被删减）——`vars_bundle.*.get(...)→None→跳过` 天然安全。大变动重排场景命中率低、贪心兜底接管，这是预期行为（首选上次解只在增量/小改动场景显效）。**后端注入前亦做结构校验**（见 11_backend §1.4：`assignments` 为列表、每条 `op/pos/emp` 为整数；不符则不注入）。`test_hint_no_fix.py` 补充用例：`previous_solution` 为空 dict、含乱序/多余字段时均正常求解。

**安全保障（对 R2/R3）**：
- `AddHint` 是纯搜索引导。CP-SAT 对**同一模型**的最优值唯一（`absolute_gap_limit=0.99` 整数判据不变）→ hint 一致与否都不改最优 `objective_value`（R2 L3 不破）。
- hint 不可行时 CP-SAT 自动丢弃，不报错、不锁死搜索（前提是**不**开 `fix_variables_to_their_hinted_value`）。
- 开关：`config.enable_solution_hint`（默认 **on**，可关）。关掉时退化为纯 V4 行为，等价对比的兜底。
- 测试 `test_hint_no_fix.py`：故意喂一个**部分不可行**的 hint，断言仍求到与 V4 相等的 OPTIMAL `objective_value`。

### 4.3 与 callback 的关系

hint 注入在 `_build_objectives` 之后、`_run_solver` 之前（hint 需要变量已全建好）。注入条数发一条 `type=INFO, message="注入解提示 N 项"` 日志（CONSTRAINT 类目），供可视化展示「热启动了多少变量」。

---

## 5. lexicographic 第二阶段（D5 次优先，默认**关**）

### 5.1 默认状态与开关

- 开关 `config.enable_lexicographic_l4`，**默认 `False`**（R2/R3 保守优先：默认行为与 V4 单层加权逐字节一致）。
- 仅当用户在配置弹窗显式开启时生效。开启即「在不动 L0-L3 的前提下，再优化 L4 分量」。

### 5.2 两阶段算法（`core/lexicographic.py`）

```
阶段一（与 V4 完全相同的单层加权求解）：
  status1 = solve(model, callback)           # 得到 V4 等价的 objective_value v* 和最优解 S1
  若 status1 ∉ {OPTIMAL, FEASIBLE}: 直接返回 S1（无解/失败，不进第二阶段）

阶段二（仅当 enable_lexicographic_l4 且 status1==OPTIMAL 且仍有时间预算）：
  # 锁死 L0-L3：把「高优先分量」钉在阶段一的取值上
  model.Add(special_shortage_obs == value(special_shortage_obs))   # O0 锁定
  model.Add(vacancy_obs          == value(vacancy_obs))            # O1 锁定
  # L0-L3 对应 status/special_shortage/vacancy/objective_value；
  # 为保证 L3 总目标不劣，再加：model.Add(total_objective_obs <= v*)
  #   （total_objective_obs 是对 sum(objective_terms) 的观测变量；<= 而非 == 给 L4 腾挪空间但不破 L3 上界）
  # 重定目标：仅最小化 L4 次级分量的一个「字典序代理」线性组合
  model.Minimize( BIG·night_var + MID·weekend_var + ... )   # 见 §5.3 代理目标
  status2 = solve(model2, callback)          # 复用同 callback，phase 标记仍 SOLVING（事件加 sub_phase=L4）
  若 status2 ∈ {OPTIMAL, FEASIBLE} 且 解满足所有锁定约束: 采用 S2
  否则: 安全回退到 S1（见 §5.5）
```

> 实现注意（**修订后，统一用 Clone**）：OR-Tools 9.15 的 `CpModel.Clone()` 已验证可用且可在 clone 上追加约束。**第二阶段统一用** `phase2_model = phase1_model.Clone()`，然后在 clone 上 `Add` 锁定约束与新代理目标，`phase2_solver = cp_model.CpSolver()` 重用相同参数。
>
> **不采用「在新 CpModel 上重建变量」路线**——该路线存在致命缺陷：新 CpModel 必须重新建变量（变量属于特定 CpModel 实例），旧变量字典引用的是 phase-1 model 的变量对象，在 phase-2 model 里是无效索引。Clone 保留变量索引，锁定/上界约束可直接用从 clone 对应的观测变量。
>
> **观测变量前置建好**：`obs_total`（对 `sum(objective_terms)` 的总目标观测变量）与各 L0-L3 分量观测变量（O0/O1/total）必须在 phase-1 model 构建期就建好（lex 路径下**必须**建，非 lex 路径可省略，见 §3.2 breakdown 工厂）。phase-2 的 `Add(obs_total_clone <= v*)` 直接用 clone 里对应的变量。
>
> **solver 取值来源明确**：`_extract_solution` 新增可选参数 `solver_override`。lex 阶段二提取传 `phase2_solver`；非 lex 路径与回退路径传 `self.solver`（即 phase1_solver）。`ObjectiveValue()` 等调用一律走传入的 solver，杜绝「phase-2 提取却读到 phase-1 objective」的数值错误。`test_lexicographic.py` 断言「phase-2 result 的 objective_value == phase2_solver.ObjectiveValue()」，回退分支断言「== phase1_solver.ObjectiveValue()」。

### 5.3 L4 代理目标（字典序的线性近似）

严格字典序需多轮求解，开销大。本期用**量级隔离的线性组合**逼近字典序（与 V4「靠权重差形成优先级」同哲学）：
`Minimize(C3·hours_dev_obs + C4·special_shift_obs + C5·night_obs + C6·weekend_obs + C7·triple_obs + C8·leadership_obs)`，
其中 `C3>>C4>>...`（确保高位分量先被压到最小）。这些 C 是**第二阶段内部常量**，不暴露给用户、不影响 L0-L3（已被等式/上界锁死）。

> **C 常量动态计算（修订：防整数溢出/LP 精度退化）**：不写死「各差 ≥ 1000 倍」的固定量级——O3（hours_deviation_scaled）在 30 人规模可达 ~528000 单位，固定 1e6 量级会让中间乘积冲到 ~5e11，逼近 LP 精度风险区。改为**按输入规模动态计算每个分量上界 `UB_k`（员工数 E、排班天数 D 推导），然后从末位往前累乘 `C_k = prod(UB_{k+1}..UB_n) + 1`**，在保证量级隔离的同时把数值压在安全范围。若 `C·UB` 估算超过 `1e15`，**降级为只最小化 `O5+O6`（两项等权）的近似**，并发 INFO 日志说明降级原因。`test_lexicographic.py` 含员工数 > 50 用例验证数值稳定性（§5.5 用例 d）。

> 取舍：真·lexicographic（逐分量多轮 `==` 锁定）正确但慢且复杂；量级隔离线性组合一轮搞定、足够好，且与 V4 目标哲学同源。本期选后者，文档登记为可演进点。

### 5.4 超时预算分配

- 总预算 = `config.max_time_seconds`（默 300s）。
- 阶段一分 `lex_phase1_budget_ratio`（默 0.7）→ 210s；阶段二分剩余（≥ `lex_phase2_min_seconds`，默 30s）。
- 阶段一**若提前 OPTIMAL**（gap<1），把节省的时间全部让给阶段二。
- 阶段二硬上限 = `总预算 - 阶段一实耗`，且不少于 `lex_phase2_min_seconds`；不足则跳过阶段二，直接采 S1。
- monitor 线程的超时判据在阶段切换时重置基准。**修订（防 stagnation 误判）**：不直接重置 `cb.start_time`（它同时被 `last_solution_time - start_time` 的停滞计算依赖，重置会让 phase-1 记录的 `last_solution_time` 相对新基准变成「未来时间」→ 停滞值为负或极大 → 错误早退）。改为**phase-2 新建一个 `APICallbackV5` 实例**（或在现有实例上提供 `reset_phase2(budget)` 方法：同时重置 `phase_start_time=now`、`last_solution_time=now`、`best_objective=inf`，但保留 `solution_count` 不清零）。monitor 超时逻辑引用 `cb.phase_start_time`（阶段二预算基准），`cb.start_time` 保留为全局墙钟用于 `wall_time` 上报。

### 5.5 失败安全回退（R2 不降低硬保障）

阶段二任何异常都**必须**回到 S1，绝不返回比 V4 差的解：

| 失败情形 | 处理 |
|---|---|
| 阶段二 INFEASIBLE（锁定约束写错/数值边界）| 回退 S1，发 `type=INFO` 日志「L4 优化未找到更优解，采用阶段一最优」 |
| 阶段二超时无解 | 回退 S1 |
| 阶段二解的 L0-L3 读数 ≠ 阶段一（理论不该发生，防御性校验）| 回退 S1 + `level=error` 日志 |
| 阶段二 `total_objective_obs > v*`（破了 L3 上界）| 回退 S1 |

回退即「采用阶段一解做 `_extract_solution(solver_override=phase1_solver)`」——**回退时 phase2_solver 完全废弃，明确切回 phase1_solver 读值**，结果与 enable_lexicographic_l4=False（即 V4）**逐字节一致**。

边界澄清：
- **phase-1 仅 FEASIBLE（超时解）不进 phase-2**（§5.2 已规定「仅 status1==OPTIMAL 才进第二阶段」），故不存在「FEASIBLE 解被 phase-2 上界约束误锁」的问题。
- `obs_total` 必须在 phase-1 建好（§5.2），否则 phase-2 的 `Add(obs_total_clone <= v*)` 无变量可引用 → 诊断误判。

`test_lexicographic.py` 覆盖：(a) 第二阶段成功时 L0-L3 不变、L4 ≤ 阶段一，且 `objective_value == phase2_solver.ObjectiveValue()`；(b) 强制第二阶段失败时回退结果 == 阶段一结果，且 `objective_value == phase1_solver.ObjectiveValue()`；(c) phase-1 FEASIBLE 时不进 phase-2；(d) 员工数 > 50 中等规模数值稳定性（见 §5.3 C 常量动态上界）。

---

## 6. 无解诊断 pass（R6 加分项，D6）

### 6.1 触发条件：零正常开销

**仅当主求解 status == INFEASIBLE 时**触发二次诊断 pass（`_handle_result` 的 INFEASIBLE 分支调 `infeasibility.diagnose(...)`）。可行/超时/任何有解路径**零额外开销**——主模型保持干净，不挂任何 assumption（见 §6.3 方案抉择）。开关 `config.enable_infeasibility_diagnosis`（默认 **on**，可关）。

### 6.2 七个业务约束组与 assumption literal

按 00_system_map §4c 的七组（业务粒度，不是每条约束一个 literal，否则子集太碎不可读）：

> **冻结的 `group` 标识符（三文档统一）**：每个 lit 映射到一个稳定的业务 `group` 字符串，前端据此渲染卡片、后端据此落库。

| 组 lit | `group`（冻结）| 业务约束组 | 对应约束类 / 改造点（OnlyEnforceIf） | INFEASIBLE 命中文案 |
|---|---|---|---|---|
| `lit_hours` | `STANDARD_HOURS` | 月度工时 H8/H9 | `StandardHoursConstraint` 的 H9 下限 `Add(total >= lo)` 与 H8 上限 → `.OnlyEnforceIf(lit_hours)` | 「工时下限太紧（假期多的月份易撞墙），建议放宽月度容差 monthly_hours_lower_offset」|
| `lit_locked_op` | `LOCKED_OPERATIONS` | 锁定工序 | `LockedOperationsConstraint` 的 `Add(sum==1)`（含非候选的 `Add(0==1)`）→ `.OnlyEnforceIf(lit_locked_op)` | 「锁定的员工 X 不是工序 Y 的候选人」|
| `lit_consec` | `CONSECUTIVE_DAYS` | 连续工作/休息天数 | `ConsecutiveDaysConstraint` 各滑窗 `Add(sum<=limit)/Add(sum>=1)` + 边界 → `.OnlyEnforceIf(lit_consec)` | 「员工 X 连续工作超限且无人可替」|
| `lit_special` | `SPECIAL_SHIFT_COVERAGE` | 专项班次硬覆盖 | `SpecialShiftJointCoverageConstraint` 的 `Add(shortage==0)`（HARD）→ `.OnlyEnforceIf(lit_special)` | 「专项班次 Z 候选人不足 N 人」|
| `lit_leader` | `LEADERSHIP_COVERAGE` | 领导生产日覆盖 | `LeadershipCoverageConstraint` Rule1 `Add(sum>=1)` → `.OnlyEnforceIf(lit_leader)` | 「生产日 D 没有可用领导在岗」|
| `lit_locked_shift` | `LOCKED_SHIFTS` | 锁定班次（strict）| `LockedShiftsConstraint` strict 的 `Add(target==1)`/`Add(0==1)` → `.OnlyEnforceIf(lit_locked_shift)` | 「锁定班次数据缺失（strict 模式）」|
| `lit_fill` | `POSITION_MUST_FILL` | 岗位「必须有人」| `_build_variables` 不许空岗的 `Add(sum==1)` → `.OnlyEnforceIf(lit_fill)` | 「岗位 P 无合格候选人 / 需求超过可用人数」|

### 6.3 方案抉择：诊断模型重建 vs 主模型常驻 literal

**两方案对比**：

| 维度 | A. 主模型常驻 enforcement literal（求解后调 `SufficientAssumptionsForInfeasibility`）| B. 仅 INFEASIBLE 时重建带 assumption 的诊断模型 |
|---|---|---|
| 正常求解性能 | **劣**：所有硬约束变 `OnlyEnforceIf(lit)`，presolve 难化简 enforcement，可行场景也被拖慢（assumption 求解本就比普通慢）| **优**：主模型干净、零 assumption，可行场景与 V4 性能一致 |
| 正确性 | 直接返回最小不可行子集，无重建偏差 | 重建模型需与主模型**完全同构**才保证「同样 INFEASIBLE」；有重建漂移风险 |
| 实现复杂度 | 低（一次建模）| 高（诊断模型与主模型共用 builder，确保同构）|
| 对 R2/R3 | **违反 R3**（体验：可行求解变慢）| 保住 R3（可行零开销）|

**抉择：采用方案 B（诊断时重建）**，理由：R2「结果不降低」与 R3「体验不大幅改变」要求**可行求解路径绝不因诊断功能变慢**；INFEASIBLE 本就是少数失败路径，多一次重建求解的代价可接受。正确性靠「诊断模型与主模型共用同一 builder 函数」保证同构——把 `_build_variables`+`_apply_constraints`+`_build_objectives` 抽成可复用的 `build(model, assumption_literals=None)`，主求解传 `None`（不挂 literal），诊断求解传七组 literal 并对每组 `model.AddAssumption(lit)`（实际是把约束 `OnlyEnforceIf(lit)` 后 `AddAssumptions([lits])`）。

> 实现落点（**同构性铁律，修订后**）：诊断 builder 不是改 17 个约束类（它们逐字节复制），而是在 `infeasibility.diagnose` 里**重新走一遍同样的 registry**。关键修正：约束类的 `apply(ctx, req)` 内部对 **`ctx.model`** 直接 `model.Add(...)`，所以诊断必须**新建一个 `diag_ctx` 并令 `diag_ctx.model = diag_model`**（新建的 `cp_model.CpModel()`），再用这个 `diag_ctx` 调用**全部**约束类的 `apply`——这样其余非关键约束（share_group/unique_employee/...）的约束真正落进 `diag_model`，诊断模型与主模型**同构**。否则若 `ctx.model` 仍指向主 model，诊断模型只剩七组 literal 约束、必然比主模型宽松，`SufficientAssumptionsForInfeasibility` 结论不可信（漏报/误报）。
>
> 七个关键组采用「等价重写」：在 `infeasibility.py` 内为这七组写**专用的带 literal 版本**（数学与原约束一致，仅多挂 `OnlyEnforceIf(lit)` 后 `diag_model.AddAssumptions([lits])`），直接作用在 `diag_model` 上，**替代**这七组的原 `apply`（即诊断时这七组走带-literal 版本，其余 16-7 组走原 `apply` 但 ctx 指向 diag_model）。
>
> **同构性回归门禁（不可绕过）**：`test_infeasibility.py` 必须含一个用例——把同一份**可行**输入喂给 `diag_model`，断言 `diag_solver.Solve(diag_model)` 也判为可行（FEASIBLE/OPTIMAL）。若诊断模型对同一可行输入判 INFEASIBLE，说明同构被破坏，CI 阻断。

### 6.4 诊断流程与上报

```
1. INFEASIBLE → callback.emit_phase("DIAGNOSING")
2. diag_model = 重建（七组挂 literal，其余照常）
3. diag_solver.Solve(diag_model)  # 短超时 config.diag_time_seconds（默 30s）
4. 若 diag status==INFEASIBLE:
     lits = diag_solver.SufficientAssumptionsForInfeasibility()   # 最小不可行 literal 子集
     conflicts = [LITERAL_TO_BUSINESS_TEXT[lit] for lit in lits]  # §6.2 文案映射
     callback.log_diagnosis("无解原因分析", conflicts)             # V4 已有 log_diagnosis（category=CONFLICT）
     发 event=DIAGNOSIS payload，键名统一为 "infeasibility"（见下方冻结 schema）
5. 若 diag 反而可行（说明无解由「七组之外」的约束/数据导致）:
     回退到 V4 既有的通用建议文案（"资源不足/规则冲突"）+ 标注「具体冲突组未能定位」
6. 主求解结果仍返回 {status:"INFEASIBLE", schedules:[], ...}（payload 形状与 V4 一致，§5D）
```

新增 `event=DIAGNOSIS` payload（前端「原因分析」面板实时数据源）。**冻结 schema：键名统一为 `infeasibility`，组数组为 `groups`，组内字段三文档对齐**（见 20_IMPLEMENTATION_PLAN §冻结契约）：

```jsonc
{ "run_id", "status":"FAILED", "type":"LOG", "phase":"DIAGNOSING", "event":"DIAGNOSIS",
  "infeasibility": {
    "located": true,                  // false=七组外原因，给通用建议
    "groups": [
      {
        "group":        "STANDARD_HOURS",          // 七组业务标识符之一（§6.2 / 见下表）
        "lit_key":      "lit_hours",               // CP-SAT assumption literal 键（调试用）
        "message_zh":   "工时下限太紧…",
        "suggestion_zh":"放宽月度工时容差（H9 下限）",
        "config_keys":  ["enable_standard_hours"]  // 数组：一键跳配置目标开关
      }
    ]
  }
}
```

> 七组 `group` 标识符（与 backend §7.5 / frontend §7.1 **逐字符一致**）：
> `STANDARD_HOURS` / `LOCKED_OPERATIONS` / `CONSECUTIVE_DAYS` / `SPECIAL_SHIFT_COVERAGE` / `LEADERSHIP_COVERAGE` / `LOCKED_SHIFTS` / `POSITION_MUST_FILL`。
> `LITERAL_TO_BUSINESS_TEXT` 映射的输出 `group` 字段必须用这套字符串。

`category="CONFLICT"` 日志通道（V4 已预留，§00 2.4）同时承载文案行，前端按 category 高亮。**落库/结果路径**另用 `result.infeasibility_analysis`（§6.5），实时路径用上述 `infeasibility`。

### 6.5 result 落库路径（`result.infeasibility_analysis`，冻结 schema）

INFEASIBLE 主求解返回的 `result` JSON 里**新增** `infeasibility_analysis` 顶层键（与实时回调的 `infeasibility` 同源、组项字段一致，仅数组名不同以区分两条路径）：

```jsonc
"infeasibility_analysis": {
  "is_infeasible": true,
  "located": <bool>,                    // 是否定位到七组之内
  "diagnosed_at": "2026-06-11T...",
  "minimal_conflict_groups": [          // 与实时 infeasibility.groups 同字段集
    {
      "group":         "STANDARD_HOURS",
      "lit_key":       "lit_hours",
      "message_zh":    "工时下限太紧：6月假期多，月度下限差 12 小时无人可补",
      "suggestion_zh": "建议在高级设置放宽月度工时容差（H9 下限）",
      "config_keys":   ["enable_standard_hours"],
      "related_employees": [101, 205],  // 可选
      "related_dates":     ["2026-06-15"] // 可选
    }
  ]
}
```

> 字段对齐：实时路径 `infeasibility.groups[]` 与结果路径 `infeasibility_analysis.minimal_conflict_groups[]` **组项字段完全相同**（`group/lit_key/message_zh/suggestion_zh/config_keys` + 可选 `related_*`）；区别仅在外层键名与数组名（实时=`infeasibility.groups`，结果=`infeasibility_analysis.minimal_conflict_groups`）。后端 §7.5 / 前端 §7.1 据此对齐。

---

## 7. API 端点设计

### 7.1 四端点（`app.py`，端口 5006，前缀 `/api/v5/*`）

| 端点 | 方法 | 作用 | 与 V4 差异 |
|---|---|---|---|
| `/api/v5/health` | GET | `{status, version:"5.0.0-alpha", service:"Solver V5"}` | 仅版本字符串 |
| `/api/v5/precheck` | POST | 只跑 `run_precheck` 不求解，返回 `{status, checks[], total_checks}` | 零逻辑差异（precheck.py 复制）|
| `/api/v5/solve` | POST | 主求解（同步阻塞）；payload = `SolverRequest`（与 V4 同 schema）| 内部多 hint/breakdown/lex/诊断；端点契约形状不变 |
| `/api/v5/abort/<request_id>` | POST | 查 `ACTIVE_CALLBACKS` → `request_stop` | 见 §7.4 多 worker 兜底 |

`request_id` 落盘 `solver_v5/logs/request_{id}.json`（与 V4 同，便于回归对比）。preview_only 旁路照搬（pop registry/run_id，不建 callback、不回写）。

### 7.2 回调目标 URL（指向 v5 后端端点）

`BACKEND_API_URL` 默认 = `http://localhost:3001/api/v5/scheduling/callback/progress`（后端新增 v5 路由，由后端文档负责）。callback 派生：
- 进度 POST → `…/callback/progress`
- 结果 POST → `…/callback/result`
- 状态轮询 GET → `…/runs/{run_id}/status`
鉴权同 V4：header `X-Solver-Callback-Token: $SOLVER_CALLBACK_SECRET`，timingSafeEqual（D4：同一密钥）。

> **回调端点选择机制澄清（MINOR 修订）**：solver_v5 是独立进程，`BACKEND_API_URL` 是**部署时静态固定**（指向 `/api/v5/scheduling/callback/progress`），**不**根据请求体 `metadata.solver_generation` 动态切换。backend 注入的 `metadata.solver_generation='V5'` 仅作**诊断标记**（便于 solver 日志区分代次），不参与回调 URL 选择。11_backend §1.4 的相关注释须改为此口径，消除「solver 据此选 V5 回调端点」的误导表述。

### 7.3 abort 双路径（沿用 V4）

1. **进程内**：`/api/v5/abort/<id>` 查 `ACTIVE_CALLBACKS[id]` → `callback.request_stop()` → `solver.StopSearch()`。
2. **跨进程**：monitor 线程每 5s `poll_server_stop()` GET backend `/runs/{id}/status`，命中 STOPPING/STOPPED 即 `request_stop`。

### 7.4 gunicorn 多 worker 陷阱与对策（关键风险）

**事实**：`start_all.sh` 用 `gunicorn --workers 2`（§7 实测）。`ACTIVE_CALLBACKS` 是**单进程内存字典**——`/abort` 命中的 worker 不一定是跑 `/solve` 的那个 → 进程内 abort 可能 404 失效（00_system_map §11 已警告）。

**V5 对策（按可靠性递增，本期采 A+B）**：

| 方案 | 做法 | 本期取舍 |
|---|---|---|
| **A. 跨进程路径为主**（必做）| abort 的**可靠路径是「backend 改 status=STOPPING → solver monitor 轮询感知」**，与跑 solve 的 worker 是否同一无关。前端「停止」按钮走后端改状态，不依赖 `/api/v5/abort` 命中正确 worker | **采用**：这是 V4 已验证的可靠路径，V5 复刻 |
| **B. solver 单 worker + 多线程**（推荐）| `solver_v5` 的 gunicorn 用 `--workers 1 --threads 4 --timeout 600`。求解本就是 CPU 密集（CP-SAT 内部已多线程 `num_workers`），单 gunicorn worker 足够，且 `ACTIVE_CALLBACKS` 回到单进程可靠。并发多 solve 在同进程排队（与 V4 现状一致，无并发保护是后端的事）| **采用**：`Procfile`/`start_all.sh` 的 v5 段写 `--workers 1 --threads 4`。彻底消除多 worker abort 陷阱 |
| C. 共享存储（Redis）| `ACTIVE_CALLBACKS` 外置 Redis | **不做**（引入新依赖，违背「最小增量」；A+B 已够）|

> 结论：solver_v5 用 **gunicorn 1 worker + 4 threads**（方案 B），并保留跨进程 abort（方案 A）。`/api/v5/solve` 是长阻塞，`--timeout 600` 防 worker 被杀。单 worker 下进程内 abort 100% 命中。

> **⚠️ 线程安全铁律（BLOCKER 修订）**：方案 B 单进程多线程下，`ACTIVE_CALLBACKS`（V4 是模块级**无锁 dict**）会被 4 个线程并发读写——`/solve` 的 `finally: del ACTIVE_CALLBACKS[request_id]` 可能与 `/abort` 的 `ACTIVE_CALLBACKS.get(request_id)` 并发，触发 `KeyError` 或 callback 被提前删后 abort 失效。V4 用 `--workers 2`（多进程无共享内存）恰好绕开了这个竞态，V5 切单进程多线程后该漏洞**被激活**，必须修。
> **改法**：在 `app.py` 新增 `_callback_lock = threading.Lock()`，把 `ACTIVE_CALLBACKS` 的**四个访问点**（注册赋值、abort 查找 `.get`、`finally` 删除、precheck/preview 旁路若有访问）全部用 `with _callback_lock:` 包住。删除用 `ACTIVE_CALLBACKS.pop(request_id, None)`（幂等，不抛 KeyError）。这是对 V5 app.py 的**新增防护**（V4 文件零改动，符合 R1）。

---

## 8. 实现步骤拆解（每步可独立验证）

> 每步可独立 `git commit` + 验证，互不阻塞。S1-S3 是「基线对齐」，S4-S8 是「增量增强」。

| 步 | 内容 | 独立验证手段 |
|---|---|---|
| **S0** | 写 `scripts/init_solver_v5.sh`：从 solver_v4 复制 → 删 6 废弃文件 → 改类名/版本/端口 | 脚本跑完后 `python3 -m compileall solver_v5/{contracts,core,constraints,objectives}` 通过 |
| **S1** | venv + requirements pin；起 `python app.py` 在 5006 | `curl localhost:5006/api/v5/health` 返回 `version:5.0.0-alpha` |
| **S2** | 端点 `/precheck` `/solve` `/abort` 通；preview_only 旁路；callback 指向 v5 后端（后端 mock 或真路由）| 喂一份 `solver_v4/logs/request_*.json` 到 5006，`status/schedules/metrics` 与 5005 **逐字节一致**（回归脚本 §8.4，此时无任何增强）→ 证明基线零漂移 |
| **S3** | `stats_collector` + callback `emit_model_stats/emit_phase`；MODEL_STATS/PHASE_ENTER 事件 | 抓 v5 回调 payload，断言含 `phase/event/model_stats.by_constraint`，且 `num_constraints==Σcount`；**S2 的 obj 不变** |
| **S4** | `breakdown.py`：9 观测变量 + `metrics.objective_breakdown` + 等价断言 | `test_breakdown_equivalence`：`Σ(权重·breakdown)==objective_value`；回归脚本断言 v4.obj==v5.obj |
| **S5** | incumbent.breakdown + snapshot 下采样进 SOLUTION 事件；search_stats 进心跳 | 长求解抓回调流：每秒 ≤1 条 SOLUTION，含 incumbent.breakdown，snapshot 频率符合 §2.5；payload < 5KB |
| **S6** | `hint_provider.py`：上次解 + 贪心兜底；软 hint 注入；`enable_solution_hint`(on) | `test_hint_no_fix`：喂部分不可行 hint，obj 仍 == V4；关 hint 时与 S2 一致 |
| **S7** | `lexicographic.py`：第二阶段（默认关）；预算分配；失败回退 | `test_lexicographic`：开启时 L0-L3 不变 & L4≤阶段一；强制失败时回退==阶段一；**默认关时 == S2** |
| **S8** | `infeasibility.py`：诊断 builder + 七组 literal + 文案映射；`enable_infeasibility_diagnosis`(on) | `test_infeasibility`：构造每组单独无解的 7 个用例，断言命中对应 lit_key；可行用例零诊断开销；主模型无 assumption |
| **S9** | `start_all.sh` 增量 + `verify_v5_archive.sh` + 文档 | `./scripts/verify_v5_archive.sh` 全绿 |

**关键顺序保证**：S2 是「零漂移基线」闸门——只有 S2 证明 V5 与 V4 逐字节一致，后续 S3-S8 的「增量」才有可信对照。任何一步导致 S2 回归用例 obj 漂移，立即回滚该步。

---

## 9. 风险对照（research risks 逐条处置）

| 风险（来源）| 本期改不改 | 处置与等价保障 |
|---|---|---|
| **frozen_range.py:83 的 `pass` 留白**（区间外无 frozen 数据时不固定变量，可能误排）| **本期不改** | 逐字节复制 V4 行为。理由：R2 要求「同输入下与 V4 一致」——若 V5 把 `pass` 改成 `Add(var==0)`，会在「区间外无 frozen 数据」场景下产出与 V4 不同的解 → 违反 L0-L3 等价对比。登记为 PD 待后续与产品确认语义后专项处理（届时 V4/V5 同步改）|
| **O5/O6 非线性 L2 平方**（`AddMultiplicationEquality`，员工多时拖慢）| **本期不改（保留 L2）** | D5 明确「目标函数数学保持与 V4 等价」。线性化会把 L2→L∞ 改变均衡语义 → 违反 L4 不降低。breakdown 直接观测 `Σ NightCountSq_e` 原值。若未来要做，作为**默认 off 的 fast 模式开关**，且需 A/B 验证均衡度不劣（本期不引入）|
| **`_shift_relevant_employee_ids` 铁律**（漏并入按 employee_id 点名的字段→硬约束静默失效）| **本期不改逻辑** | 逐字节复制该方法。V5 **不新增**任何「按 employee_id 点名班次/分配」的契约字段（contracts/request.py 零改动），故铁律自然守住。新增的 hint/breakdown/lex/诊断**全不引入新的点名字段**——hint 只 `AddHint` 已有变量，诊断只挂 literal 不建新员工变量。`test_*` 复制 V4 用例覆盖领导/专项/锁定/冻结员工的 shift 变量存在性 |
| **gunicorn 多 worker abort 失效**（§7.4）| **改启动配置** | solver_v5 用 `--workers 1 --threads 4`（方案 B）+ 跨进程轮询（方案 A）。不改求解逻辑 |
| **SOLVER_CALLBACK_SECRET 未配置→backend 401/503**（callback.py:33）| 不改 | 复刻 V4 鉴权头逻辑；`.env.sample`/`start_all.sh` 同步 secret（与 backend 同值）|
| **`total_deviation_hours` 命名误导**（=obj/100 非工时偏差）| 不改（保留误导名）| 前端依赖此键（§5D）。V5 通过新增 `objective_breakdown.hours_deviation_scaled` 提供**真**工时偏差量，不动旧键 |
| **`solver_progress` JSON_MERGE_PATCH 删 null 字段**（backend risk 4）| solver 端规避 | V5 callback **绝不**发送 `"logs": null` 或任何 null 覆盖；新增字段缺省时**省略键**而非置 null |
| **objectives 签名不统一**（`_build_objectives` 手写胶水）| 不改（照搬）| breakdown 复用 V4 的 `exprN` 对象，不重构签名（重构=漂移风险）|
| **`absolute_gap_limit=0.99` 整数判据**（动权重破坏整数最优）| 不动权重 | hint/breakdown/lex 均不改权重与量纲；lex 第二阶段的 C 常量是隔离的内部代理，不进 L3 判据 |

---

## 10. 测试方案

### 10.1 单元测试（`solver_v5/tests/`，用 unittest，非 pytest——与 V4 一致）

| 文件 | 覆盖 | 通过判据 |
|---|---|---|
| 复制的 5 个 V4 用例 | 约束正确性回归基线 | 与 V4 同结果 |
| `test_breakdown_equivalence.py` | breakdown 数学等价 | `Σ(外层权重·breakdown[k]) == solver.ObjectiveValue()` 整数严格相等；多场景（有/无专项、有/无空缺）|
| `test_hint_no_fix.py` | 软 hint 不锁死 | 喂部分不可行 hint → obj == 无 hint；断言 `fix_variables_to_their_hinted_value` 从未被设 True（反射检查 parameters）|
| `test_lexicographic.py` | 第二阶段安全 | 开启：L0-L3 读数不变 & L4 各分量 ≤ 阶段一；注入失败：回退结果 == 阶段一；默认关：== 单层 |
| `test_infeasibility.py` | 七组诊断 | 7 个「单组无解」构造用例各命中对应 lit_key；可行用例 `diagnose` 不被调用（mock 计数=0）；诊断后主结果 payload 形状 == V4 INFEASIBLE |
| `test_callback_auth.py`（改端点）| v5 鉴权 | 缺/错 token → 不回写；对 token → 回写 |

### 10.2 集成 / 回归测试（核心 R2 验收）

**离线对比脚本 `scripts/compare_v4_v5.py`（新增，§8.4）**：

```
for req_json in solver_v4/logs/request_*.json:      # V4 已落盘的真实请求
    r4 = POST localhost:5005/api/v4/solve  req_json
    r5 = POST localhost:5006/api/v5/solve  req_json   # V5（增强全开 或 全关两轮）
    按 00_system_map §3 L0-L4 分层字典序比对:
      L0 status:    V4 有解 → V5 不得无解
      L1 special_shift_shortage_total:  V5 ≤ V4
      L2 vacant_positions:              V5 ≤ V4
      L3 objective_value:  同 OPTIMAL → 整数严格相等；V4 FEASIBLE → V5.obj ≤ V4.obj
      L4 breakdown:        L0-L3 相等时逐分量不显著劣化（lex 开启时 V5 应 ≤）
    额外: Σ(权重·v5.breakdown) == v5.objective_value
输出: 回归报告（每个请求一行 PASS/FAIL + 劣化分量）
```

两轮跑法：
- **A 轮（增强全关）**：`enable_solution_hint=false, enable_lexicographic_l4=false` → 期望 V5 与 V4 **逐字节一致**（证明零漂移）。
- **B 轮（增强默认）**：hint on / lex off（默认配置）→ 期望 V5 在超时场景 `obj ≤ V4`，OPTIMAL 场景 `obj == V4`。

进 CI 门禁：A 轮必须 100% 逐字节一致，否则阻断发布。

### 10.3 事件流测试

`scripts/capture_v5_events.py`：起一个 mock backend 收 v5 回调，跑一次中等规模 solve，断言：
- 收到 `phase` 序列 BUILDING→SOLVING→EXTRACTING（无解时含 DIAGNOSING）；
- 恰一条 MODEL_STATS（`num_constraints==Σcount`）；
- SOLUTION 事件频率 ≤ 1/s，每条含 `incumbent.breakdown`；
- snapshot 频率符合 §2.5；单 payload < 5KB；
- 全程无 null 字段覆盖。

### 10.4 verify 脚本扩展（`scripts/verify_v5_archive.sh`，新增）

仿 `verify_v4_archive.sh`，新增步骤：
```
[1] solver_v5 compileall（contracts core constraints objectives）
[2] solver_v5 unittest（含新增 4 个 V5 用例）
[3] Guardrail: 断言 solver_v5 不 import solver_v4（rg 'import solver_v4|from solver_v4' solver_v5/ 必须无命中）
[4] Guardrail: contracts/request.py 与 solver_v4 版逐字节一致（diff 必须空）
[5] Guardrail: 废弃 6 文件确实不存在于 solver_v5/
[6] 回归对比 A 轮（增强全关）逐字节一致（抽样 N 个 request json）
```

---

## 11. 给后端/前端实现者的接口契约速查（本文档对外暴露）

> 本节是 solver_v5 对「后端链路」「前端」两个并行设计的契约边界，供它们对齐。

**solver_v5 → backend 回调 payload**：见 §2.2（V4 字段 + `phase/event/model_stats/incumbent/search_stats/diagnosis`，只增不改）。

**solver_v5 result（同步 HTTP 返回 + callback/result 回写）**：V4 形状不变，`metrics` 新增 `objective_breakdown`（§3.4）。

**solver_v5 接收的 config 新键**（前端配置弹窗可加，缺省=默认）：

| config key | 默认 | 作用 |
|---|---|---|
| `enable_solution_hint` | `true` | 软 hint 注入开关 |
| `enable_objective_breakdown` | `true` | breakdown 观测变量开关：true=建 O0-O8 观测 IntVar 并在 callback/result 上报 breakdown；false=跳过建变量，callback 与 result 均**省略** breakdown 字段（前端区块 d 退化空态）。在 `solver.py _build_objectives` 消费此开关 |
| `enable_lexicographic_l4` | `false` | L4 第二阶段开关 |
| `lex_phase1_budget_ratio` | `0.7` | 阶段一时间占比 |
| `lex_phase2_min_seconds` | `30` | 阶段二最小预算 |
| `enable_infeasibility_diagnosis` | `true` | 无解诊断开关 |
| `diag_time_seconds` | `30` | 诊断 pass 超时 |
| `snapshot_min_interval` | `8` | 中间解快照最小间隔(s) |
| `snapshot_top_n` | `50` | 快照 top assignment 条数 |
| `config.hint.previous_solution` | 无 | 后端注入的上次解种子（结构见 §4.1）|

> 这些键**全是加法**（§5B：V5 只能加新键），不改任何 V4 既有键名/默认。前端不开这些键时，V5 行为=V4。

---

## 12. 异议（对指挥官决策的保留意见）

无原则性异议。三点轻量保留，已在正文采保守方案，登记备查：

1. **lexicographic 用「量级隔离线性组合」而非严格逐轮字典序**（§5.3）——严格字典序更正确但更慢更复杂，本期取线性近似（与 V4「权重差形成优先级」同哲学）。若后续发现 L4 隔离不彻底（C 常量量级被某分量突破），需升级为真·逐轮。已登记为可演进点，**不影响 L0-L3 与 R2**。

2. **无解诊断采「诊断时重建模型」（方案 B）而非「主模型常驻 literal」（方案 A）**（§6.3）——D6 只说「按七组挂 assumption literal」，未指定常驻或重建。本设计选重建以保住 R3（可行求解零开销）。代价是诊断 builder 需与主 builder 同构（实现复杂度↑）。若团队更看重诊断绝对精确而愿牺牲可行性能，可切 A——但**强烈建议保 B**。

3. **frozen_range.py:83 `pass` 留白本期不改**（§9）——这是 V4 已知潜在 bug，但「改它」会破坏「与 V4 同输入同结果」的 R2 等价对比。建议 V4/V5 同步专项修（届时两边一起改、一起回归），不在本期 V5 单独改。

---

## 13. 评审修订记录（总架构师裁决后回改）

> 由 V5 总架构师对三方评审 findings 裁决后统一回改，确保三文档契约自洽。冻结契约以 `20_IMPLEMENTATION_PLAN.md §冻结契约` 为唯一权威。

| # | 评审项（裁决）| 本文档改动 |
|---|---|---|
| BLOCKER | model_stats.by_constraint 三方 schema 不一致（**采纳**）| §2.2 统一为 `{count, ms, vars}`（OFF 时 ms=0/vars=0），vars 来自 by_layer |
| BLOCKER | 无解诊断字段名三方不一致（**采纳**）| §6.4 实时路径键统一 `infeasibility.groups[]`，组项 `{group, lit_key, message_zh, suggestion_zh, config_keys[]}`；§6.5 新增结果路径 `infeasibility_analysis.minimal_conflict_groups[]`（同组项） |
| BLOCKER | objective_breakdown 嵌套位置（**采纳 result.metrics**）| §3.4 明确冻结路径 `result.metrics.objective_breakdown` |
| BLOCKER | phase 枚举不一致（**采纳**）| solver 仅发 `BUILDING/PRESOLVE/SOLVING/EXTRACTING/DIAGNOSING`；ASSEMBLING 属 backend `stage` 非 solver phase（§2.6 不变，文档已正确） |
| BLOCKER | incumbent snapshot/preview（**采纳方案 A**）| §2.2/§2.5 字段名统一 `preview`，采轻量聚合格式（fill_rate/vacant_positions），前端区块 e 渲染覆盖率环 |
| BLOCKER | enable_objective_breakdown 缺失（**采纳**）| §11 config 表补 `enable_objective_breakdown`（默 true），§3.4 标注 false 时省略 breakdown |
| BLOCKER | 诊断模型同构性漏洞（**采纳**）| §6.3 改为新建 `diag_ctx.model=diag_model` 跑全约束；§6.3/§10.1 加同构性回归门禁 |
| BLOCKER | lexicographic 第二阶段重建矛盾（**采纳 Clone**）| §5.2 统一 `phase1_model.Clone()`；`_extract_solution` 加 `solver_override` 参数；obs_total 前置建好 |
| BLOCKER | gunicorn 多线程 ACTIVE_CALLBACKS 竞态（**采纳**）| §7.4 新增 `_callback_lock` 包四个访问点，删除用 `pop(...,None)` |
| MAJOR | breakdown 等价断言 O0/O1/O8 外层权重歧义（**采纳**）| §3.3 显式标注 O0/O1/O8 外层权重=1，断言权重集冻结，要求动态权重场景分别验证 |
| MAJOR | lex 失败回退与 L3 上界（**采纳**）| §5.5 明确回退切回 phase1_solver；obs_total 前置；补 4 个测试分支 |
| MAJOR | hint previous_solution 跨输入失配（**采纳**）| §4.2 apply_hint 加 try/except 大包围静默降级；补空/乱序用例 |
| MINOR | L4 代理目标量级溢出（**采纳**）| §5.3 改 C 常量按 E/D 动态累乘上界，超 1e15 降级 O5+O6 等权 |
| MINOR | monitor max_time 重置 start_time（**采纳**）| §5.4 改 phase-2 新建 callback/reset_phase2，引用 phase_start_time |
| MINOR | metadata.solver_generation 选回调端点表述（**采纳**）| §7.2 澄清为纯诊断标记，回调 URL 由 BACKEND_API_URL 静态固定 |
