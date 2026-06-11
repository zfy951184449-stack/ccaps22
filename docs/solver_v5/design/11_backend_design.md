# 后端 `/api/v5/scheduling` 链路设计

> 作者：V5 架构设计师（后端链路）
> 基线 commit：a237777（main）
> 适用顶层决策：D1–D6（见任务书）。本文档遵守 R1–R6，与 `docs/solver_v5/research/00_v4_system_map.md` 的 §3（L0–L4 判定）、§4b（扩展 payload）、§4c（七组无解约束）、§5（A–F 边界）逐条对齐。
> 代码符号保持英文；说明文字中文。**本文档只描述设计，不修改任何源码。**

---

## 0. 设计总纲（一句话）

后端 V5 = **复制 V4 的 10 个 controller 文件 + 1 个 route 文件到 `schedulingV5/` 命名空间**，把所有 `V4` 字面量改成 `V5`、`SOLVER_V4_URL` 改成 `SOLVER_V5_URL`、`run_code` 前缀改成 `V5-`、回调路径前缀改成 `/api/v5/scheduling/callback/*`；**直接 `import` 复用 `DataAssemblerV4`（零改动）**保证求解输入与 V4 完全一致；在回调接收端、SSE 透传端**只增字段不改字段**承载 §4b 的可视化扩展（phase/event/model_stats/incumbent/search_stats）与 §4c 的 `infeasibility_analysis`。`server.ts` 纯增量挂一行，`App.tsx`/菜单/`.env.sample` 纯增量。

**对 R1 的保障**：不触碰 `backend/src/routes/schedulingV4.ts`、`backend/src/controllers/schedulingV4/*`、`backend/src/services/schedulingV4/DataAssemblerV4.ts`、`solver_v4/*` 中任何一个字节。`server.ts` 有**两处纯增量改动**（均属 R1 明确允许的「挂新路由」配套，不改任何现有行为）：①新增 `import schedulingV5Routes` + `app.use('/api/v5/scheduling', ...)`；②`isSolverMachinePath` 内追加 2 行 v5 路径匹配（否则 AUTH_ENFORCE=true 时 v5 机器回调被 JWT 拦死，回调链路瘫痪）。两处详见 §6.1。

**对 R2/R3 的保障**：DataAssemblerV4 直接复用 → solver 输入逐字节等价 → 在相同 solver 输入下，L0–L3 不降低的责任落在 solver 侧（见 `12_solver_design.md`）；后端层不引入任何可能改变结果的逻辑（apply/result/scope/special-shift 全部 1:1 复刻）。

---

## 1. 目录与文件清单

### 1.1 路由层（1 个新文件）

| 文件 | 来源 | 职责 / 与 V4 差异 |
|---|---|---|
| `backend/src/routes/schedulingV5.ts` | 复制 `routes/schedulingV4.ts` | 端点路径、handler 名、鉴权与 V4 **逐行同构**。差异仅：① `import * as schedulingV5Controller from '../controllers/schedulingV5'`；② `applyRunScope` 仍调 `ScopeService.resolveRunUnit`（不变，见 §5.3）；③ 注释里的 `/api/v4/...` 改 `/api/v5/...`。**权限码字符串沿用 V4 原值**（`SOLVER_RUN_READ`/`SOLVER_RUN_EXECUTE`/`SOLVER_RUN_ABORT`/`SOLVER_RESULT_APPLY`），不新增（理由见 §4）。 |

### 1.2 控制器层（`backend/src/controllers/schedulingV5/`，11 个新文件）

| 文件 | 来源 | 改什么（精确到符号） |
|---|---|---|
| `index.ts` | 复制 `schedulingV4/index.ts` | barrel export，路径不变（同目录相对 import）。函数名统一加 `V5` 后缀：`createSolveTaskV5` / `getSolveProgressSSEV5` / `updateSolveProgressV5` / `getSolveResultV5` / `receiveSolveResultV5` / `applySolveResultV5` / `stopSolveV5` / `getSolveStatusV5` / `listRunsV5` / `runPrecheckV5` / `createPreviewProposalV5`。 |
| `types.ts` | 复制 `schedulingV4/types.ts` | ① **新建独立** `progressEmitter`（V5 不能共用 V4 的 EventEmitter 单例，否则 run:{id} 事件串台）。② `SOLVER_V5_URL = process.env.SOLVER_V5_URL || 'http://localhost:5006'`。③ 新增 `V5VizProgress` / `V5ConvergencePoint` / `V5SolverEvent` / `V5ModelStats` / `V5SearchStats` / `V5InfeasibilityAnalysis` 接口（见 §7 契约表）。其余 interface（`EnrichedAssignment`/`ResultSummaryV4`→改名 `ResultSummaryV5` 但字段集等价/`SpecialShift*`）原样保留。 |
| `helpers.ts` | 复制 `schedulingV4/helpers.ts` | ① `createRunRecord` 的 `runCode = 'V5-${Date.now()}'`。② **新增** `solver_progress` 初始结构（见 §2.1）。③ 新增 `appendVizEvents` / `pushConvergencePoint` / `clampVizArrays` 三个纯函数（裁剪逻辑，见 §2.2）。④ 新增 `extractInfeasibilityAnalysis(result)` 从 result JSON 抽 `infeasibility_analysis`（见 §6）。其余（`buildStoredResult`/`saveResults`/`normalizeSpecialShift*`/`updateRunSummary`/`getRunSummary`/`markSpecialShiftOccurrencesScheduled`/`derivePlanCategory`）逐字节复刻。 |
| `solveOrchestrator.ts` | 复制 `schedulingV4/solveOrchestrator.ts` | ① `import { DataAssemblerV4 } from '../../services/schedulingV4/DataAssemblerV4'`（**直接复用 V4 的，不复制**）。② `fetch(\`${SOLVER_V5_URL}/api/v5/solve\`...)`。③ `request_id` 包装（见 §1.4）。④ 透传 `config.metadata.run_id` 不变 + 新增 `config.metadata.solver_generation='V5'`（**纯诊断标记**，便于 solver 日志区分代次；回调端点由 solver_v5 的 `BACKEND_API_URL` 静态固定，**不**据此动态切换，见 solver §7.2）。⑤ **新增 `config.hint.previous_solution` 注入**（见 §1.4 末）。其余状态机/scope 快照/超时（10min）/竞态保护逐行同构。 |
| `solveProgressSSE.ts` | 复制 `schedulingV4/solveProgressSSE.ts` | ① `getSolveProgressSSEV5`：SSE 透传逻辑与 V4 同构，payload 形状不变（`{status,stage,error,solver_progress}`），V5 新字段天然包含在 `solver_progress` JSON 里（只增不改）。② `updateSolveProgressV5`：核心改造点——按 `event/phase` 把 viz 数据写入裁剪后的累积结构 + 节流（见 §2、§3）。 |
| `solveResultHandler.ts` | 复制 `schedulingV4/solveResultHandler.ts` | ① `getSolveResultV5`：富化逻辑逐行复刻（含 standalone 负 ID、资质 eligible 计算、班次锚定双轨）。**新增**：在返回的 `data` 里附 `infeasibility_analysis`（若 result 含）+ `viz`（收敛曲线/事件，从 `solver_progress` 读，供「回看求解过程」）。② `receiveSolveResultV5`：复刻；`saveResults` 落库时一并存 `infeasibility_analysis`（见 §6）。 |
| `applyResultController.ts` | 复制 `schedulingV4/applyResultController.ts` | **零逻辑差异**（落库格式/双轨/scope-aware delete/special shift 生命周期/I1-I3 不变量全保留）。仅日志前缀 `[SchedulingV4]`→`[SchedulingV5]`。 |
| `solveLifecycle.ts` | 复制 `schedulingV4/solveLifecycle.ts` | ① `stopSolveV5`：`fetch(\`${SOLVER_V5_URL}/api/v5/abort/${runId}\`...)`。② `getSolveStatusV5`：零差异。③ `listRunsV5`：`WHERE run_code LIKE 'V5-%'`（两代分库展示，见 §5.1）。 |
| `precheckHandler.ts` | 复制 `schedulingV4/precheckHandler.ts` | `DataAssemblerV4.assemble`（复用）+ `fetch(\`${SOLVER_V5_URL}/api/v5/precheck\`...)`，30s 超时不变。 |
| `previewProposalController.ts` | 复制 `schedulingV4/previewProposalController.ts` | `DataAssemblerV4.assemble`（复用）+ `applyTimeOverrides` + `fetch(\`${SOLVER_V5_URL}/api/v5/solve\`...)`，60s 超时不变；`request_id='preview-${Date.now()}'`、`config.metadata.preview_only=true` 不变；`capability_gap.code` 改 `SOLVER_V5_PREVIEW_UNAVAILABLE`。 |

> **不复制** `DataAssemblerV4.ts`（D2 要求直接 import 复用，保证输入等价）。**不复制** `requireServiceAuth` / `requirePermission` / `requireScope` / `ScopeService`（直接复用，见 §4/§5.3）。

### 1.3 服务层（0 个新文件）

DataAssemblerV4、SpecialShiftWindowService、ShiftPlanLinkService、ScopeService 全部**直接 import 复用**，不复制。理由见 §1.4 的可复用性确认。

### 1.4 DataAssemblerV4 可复用性确认（D2 关键）

抽查 `backend/src/services/schedulingV4/DataAssemblerV4.ts`：

- **导出形态**：`export class DataAssemblerV4 { static async assemble(startDate, endDate, batchIds, teamIds=[], solveRange?, config?): Promise<V4SolverRequest> }`（line 292-301）。是静态方法，无构造依赖，V5 controller 直接 `import { DataAssemblerV4 }` 调用即可，**无需实例化、无状态**。
- **唯一 V4 硬编码**：`assemble` 内部 `const requestId = \`V4-${Date.now()}\``（line 302），写入返回值 `request_id`（line 391）。此值会被注入 solver 请求的 `request_id` 字段。
  - **影响面**：solver `app.py:129` 用 `request_id = str(metadata.get('run_id') or payload.get('request_id', 'N/A'))` —— 实际**优先用 `metadata.run_id`**（后端在 orchestrator 注入的 runId），`request_id` 仅作 fallback 与落盘文件名 `logs/request_{id}.json`。故 `V4-` 前缀对求解正确性**无影响**，仅影响 solver 端调试日志文件名前缀。
  - **不改 V4 的处理方式（包装，非改文件）**：V5 orchestrator 在拿到 `solverRequest` 后，**在发给 solver 前覆盖** `request_id`：
    ```ts
    const solverRequest = await DataAssemblerV4.assemble(...);   // 复用，不改
    solverRequest.request_id = `V5-${runId}-${Date.now()}`;       // V5 包装层覆盖
    ```
    这是对返回对象的纯外部改写，不触碰 DataAssemblerV4 源码，满足「用包装而非改 V4 文件」。
  - 同理 precheck/preview 也在外层覆盖 `request_id` 前缀（preview 仍用 `preview-` 前缀不变，避免 solver 误判 preview）。
- **其它字段**：`window`/`operation_demands`/`employee_profiles`/`config` 透传等无 V4 字面量，逐字段与 V4 等价。**结论：DataAssemblerV4 可零改动复用，仅需外层覆盖 `request_id` 一处。**

### 1.4.1 `config.hint.previous_solution` 注入（solution hint 首选来源，solver §4.1）

solver 的 solution hint 首选来源是「上次同 scope run 的解」，由**后端在 orchestrator 注入**。在 `DataAssemblerV4.assemble(...)` 之后、POST 给 solver 之前：

```ts
const solverRequest = await DataAssemblerV4.assemble(...);   // 复用，不改
solverRequest.request_id = `V5-${runId}-${Date.now()}`;
// ── 注入上次解种子（安全降级：任何失败均跳过，绝不阻断 solve）──
try {
  const prev = await findLatestAppliedV5Run(batchIds, window);   // WHERE run_code LIKE 'V5-%' AND status IN ('APPLIED','COMPLETED') 同 batchIds+window，取最近一条
  if (prev?.result_summary) {
    const hint = compactSolution(prev.result_summary);  // → {assignments:[{op,pos,emp}], shifts:[{emp,date,shift}]}
    if (validateHintShape(hint)) {                       // assignments 为列表、每条 op/pos/emp 为整数；不符则不注入
      solverRequest.config = { ...solverRequest.config, hint: { previous_solution: hint } };
    }
  }
} catch (e) { /* 查不到/解析失败 → 不注入（安全降级），solver 退化为贪心兜底 */ }
```

要点：① 无上次解 / 查询超时 / 格式不符 → **不注入**（solver 端贪心兜底接管）；② `validateHintShape` 是后端侧第一道结构校验（solver 端 `apply_hint` 还有 try/except 第二道，solver §4.2）；③ 此注入对 R2 零风险（软 hint 不改最优值）；④ `enable_solution_hint=false` 时即使注入 solver 也不消费（开关在 solver 侧）。`schedulingV5.request-id.test.ts` 扩展：断言注入后 `config.hint.previous_solution` 结构合法，且其余字段不被破坏。

---

## 2. V5 progress 回调的存储设计（核心改造）

### 2.1 `solver_progress` JSON 结构（V5 扩展，向后兼容）

V4 的 `solver_progress` 形如 `{ progress, metrics, message, logs: string[] }`。V5 **保留全部 V4 键**，新增 viz 专用累积结构。`createRunRecord` 初始化为：

```jsonc
// scheduling_runs.solver_progress (V5 初始值)
{
  "logs": [],            // V4 原字段：string[]，沿用 JSON_ARRAY_APPEND
  // ↓ V5 新增累积结构
  "phase": null,                  // 当前阶段 BUILDING|PRESOLVE|SOLVING|EXTRACTING|DIAGNOSING
  "model_stats": null,            // 最近一次 MODEL_STATS（覆盖式，单对象）
  "search_stats": null,          // 最近一次 SEARCH_STATS（覆盖式，单对象）
  "convergence": [],             // incumbent 点列：[{wall_time, obj, bound, gap, breakdown}]（裁剪）
  "events": [],                  // 关键事件流：[{wall_time, type, phase, payload}]（裁剪）
  "infeasibility": null,         // DIAGNOSIS 事件写入（实时无解诊断，与 solver §6.4 同字段，覆盖式）
  "viz_meta": { "convergence_count": 0, "events_count": 0 }  // 计数器（防丢溢出统计）
}
```

> `progress`/`metrics`/`message` 不在初始值里——沿用 V4 由 `JSON_MERGE_PATCH` 动态合入的语义（与 V4 完全一致）。

### 2.2 累积结构的写入与裁剪（解决 JSON_ARRAY_APPEND 无限增长）

**问题**：V4 用 `JSON_ARRAY_APPEND(solver_progress, '$.logs', ?)` 无上限追加，长求解日志会让 JSON 膨胀。V5 的 `convergence`/`events` 若同样无脑 append，在多 incumbent + 高频事件场景会爆。

**设计：读-改-写 + 上限裁剪（不用 JSON_ARRAY_APPEND）**。在 `updateSolveProgressV5` 内：

1. 用单条 `SELECT solver_progress` 读出当前 JSON（解析成对象）。
2. 按 `event` 类型分派：
   - `MODEL_STATS` → 覆盖 `model_stats`（单对象，无增长）。
   - `SEARCH_STATS` → 覆盖 `search_stats`（单对象，无增长）。
   - `PHASE_ENTER` → 覆盖 `phase`（含 `DIAGNOSING`）+ 向 `events` push 一条阶段事件。
   - `NEW_INCUMBENT` → 向 `convergence` push `{wall_time, obj, bound, gap, breakdown}`，其中 **`wall_time = payload.incumbent.wall_time`**（直接取 solver 回调字段，**不另造 `t` 字段**——三文档统一用 `wall_time`，前端 X 轴读 `convergence[i].wall_time`）；同时 `viz_meta.convergence_count++`。
   - `DIAGNOSIS` → 覆盖 `infeasibility`（写入 `payload.infeasibility`，即 `{located, groups:[...]}`；solver §6.4 同字段），phase 同时置 `DIAGNOSING`。这是实时无解诊断的结构化通道（前端 `solver_progress.infeasibility` 即时消费）。
3. **裁剪规则**（`clampVizArrays`）：
   - `convergence`：上限 `VIZ_CONVERGENCE_CAP = 300` 点。超限时**保头 + 下采样中段 + 保尾**（首解、最近 N 解必留；中间按等距抽样压缩），保证收敛曲线形状不失真。计数器 `viz_meta.convergence_count` 记真实总数（前端可显示「已展示 300 / 共 N 个解」）。
   - `events`：上限 `VIZ_EVENTS_CAP = 200`，FIFO 丢弃最旧的 PHASE/INFO 类（保留 NEW_INCUMBENT 与 CONFLICT 类）。
   - `logs`（沿用 V4）：V5 额外加 `VIZ_LOG_CAP = 1000` 软上限，超限时保尾（最近 1000 行）。**注意**：这是 V4 没有的保护，但因 V5 是独立 run，不影响 V4 行为。
4. 用 `UPDATE scheduling_runs SET solver_progress = ?` 整体写回（裁剪后的对象）。

> **并发安全**：V4 用 `JSON_MERGE_PATCH` 是为了避免读-改-写竞态。V5 的累积结构改用读-改-写，但因 solver 回调是 **monitor 线程每 1s flush 串行发送**（D4 复刻的并发模型），同一 run 不会并发回调，故读-改-写无竞态。`progress`/`metrics`/`status`/`message` 仍走 `JSON_MERGE_PATCH`（与 V4 一致，向后兼容旧前端）。

**SQL 形态（V5 updateSolveProgressV5 的两步）**：

```sql
-- 步骤A：V4 同构的 merge（progress/metrics/message/status）
UPDATE scheduling_runs
SET status = COALESCE(?, status),
    solver_progress = JSON_MERGE_PATCH(COALESCE(solver_progress,'{}'), ?)
WHERE id = ?;

-- 步骤B（仅当 payload 含 viz 字段时）：读-改-写裁剪后的累积结构
--   先 SELECT solver_progress → JS 侧裁剪 → 单条 UPDATE 整体写 viz 子树
UPDATE scheduling_runs
SET solver_progress = JSON_SET(
      COALESCE(solver_progress,'{}'),
      '$.phase', ?, '$.model_stats', CAST(? AS JSON),
      '$.search_stats', CAST(? AS JSON), '$.convergence', CAST(? AS JSON),
      '$.events', CAST(? AS JSON), '$.viz_meta', CAST(? AS JSON))
WHERE id = ?;
```

> 步骤B 用 `JSON_SET`（不是整对象覆盖）只改 viz 子树，避免覆盖步骤A 刚写入的 `progress/metrics`。`log_line` 仍按 V4 走 `JSON_ARRAY_APPEND($.logs)` + V5 软上限裁剪（裁剪在读-改-写步骤B 里顺带做）。

### 2.3 写入路径汇总

| payload 字段 | 写入方式 | 增长控制 |
|---|---|---|
| `status` | `COALESCE(?, status)`（V4 同构） | — |
| `progress`/`metrics`/`message` | `JSON_MERGE_PATCH`（V4 同构） | 覆盖式，无增长 |
| `log_line` | `JSON_ARRAY_APPEND($.logs)` + 软上限 1000 裁剪 | V5 新增上限 |
| `phase` | `JSON_SET($.phase)` 覆盖 | 无增长 |
| `model_stats`/`search_stats` | `JSON_SET` 覆盖 | 无增长 |
| `incumbent`（→convergence 点） | 读-改-写 push + 300 上限下采样 | **有界** |
| `event`（→events 流） | 读-改-写 push + 200 上限 FIFO | **有界** |

---

## 3. SSE 透传设计（只增不改 + 节流）

### 3.1 透传（payload 形状不变）

`getSolveProgressSSEV5` 与 V4 **逐行同构**：仍发命名事件 `progress`，payload 仍是 `{status, stage, error, solver_progress}`。V5 新增的 `phase/model_stats/search_stats/convergence/events/viz_meta` **天然包含在 `solver_progress` JSON 里**（因为它们就存在那一列），前端从 `data.solver_progress.convergence` 等读即可。**对 V4 协议零破坏**——旧字段位置语义不变，新字段是 `solver_progress` 的新子键，前端对未知子键优雅降级（§5 边界 C 要求）。

双路（`progressEmitter` 实时 + 5s 兜底轮询 DB）与终止条件（COMPLETED/FAILED → cleanup）逐行复刻。**V5 用独立的 `progressEmitter`**（§1.2 types.ts），事件名仍 `run:{runId}`，但因是独立 EventEmitter 实例，与 V4 run 完全隔离。

### 3.2 事件量大时的节流（两级）

V5 的可视化事件可能比 V4 频繁（每个 incumbent + 阶段 + 搜索统计）。节流分两级：

**第一级（solver 侧，D4 已复刻）**：`begin_deferred()` + monitor 线程**每 1s flush**。这意味着即使 CP-SAT 在 1s 内发现 10 个 incumbent，也只在 flush 时合并成「最新解 + 按序 incumbent 摘要」发一次回调。**这是天然节流**，V5 前端动画按 1s 节拍设计（§4b 铁律）。详见 `12_solver_design.md`。

**第二级（backend SSE 侧）**：`updateSolveProgressV5` 每次回调都 `progressEmitter.emit` 一次（与 V4 同构，因 solver 已 1s 节流，emit 频率本就 ≤1Hz）。**额外保护**：若同一 run 在 < 200ms 内收到多次回调（异常情况，如 solver 重发），SSE 端用一个 per-run 的 `lastEmitTs` Map 做合并——只 emit 最新一条，丢弃中间态（仅对 RUNNING 状态合并；STATUS 变更/FINAL 必发）。该 Map 在 cleanup 时清理。

> **不改 DB 写入频率**：每次回调仍落 DB（保证断线重连后兜底轮询能拿到最新 viz 状态）；只在「emit 给前端」这一跳做合并节流。这样既不丢数据，又不让前端被高频事件冲垮。

---

## 4. 鉴权设计（沿用，零 RBAC 配置成本）

### 4.1 机器回调端点（callback/progress、callback/result、runs/:id/status）

**直接复用 `requireServiceAuth`**（同一中间件，同一 `SOLVER_CALLBACK_SECRET`，同一 header `X-Solver-Callback-Token`，timingSafeEqual）。满足 D4「同一 SOLVER_CALLBACK_SECRET 鉴权」。V5 solver 用同一密钥即可，无需新密钥。

**server.ts 的 auth-bypass 需扩展**（纯增量）：现有 `isSolverMachinePath` 只匹配 `/api/v4/scheduling/callback/` 与 `/api/v4/scheduling/runs/:id/status`。V5 路径 `/api/v5/scheduling/callback/*` 与 `/api/v5/scheduling/runs/:id/status` 也必须被全局 `requireAuth` 排除（否则 JWT 影子中间件不拦但语义不对，且 AUTH_ENFORCE=true 时会拦死机器回调）。改法见 §6.1（在 `isSolverMachinePath` 内加两条 `/api/v5/...` 匹配——这是对 server.ts 的纯增量逻辑扩展，属 R1 允许的「挂新路由」配套）。

### 4.2 人类用户端点（solve/runs/result/stop/apply/precheck/preview）

**沿用 V4 权限码字符串**，不新增：

| 端点 | 权限码（沿用） |
|---|---|
| GET `/runs`、`/runs/:id/progress`、`/runs/:id/result`、POST `/precheck`、`/preview-proposal` | `SOLVER_RUN_READ` |
| POST `/solve` | `SOLVER_RUN_EXECUTE` |
| POST `/runs/:id/stop` | `SOLVER_RUN_ABORT` |
| POST `/runs/:id/apply` | `SOLVER_RESULT_APPLY` + `requireScope` |

**为何沿用（查证结论）**：

- 抽查 `backend/src/middleware/requirePermission.ts`：权限码是**字符串参数**，判定走 `PermissionCacheService.has(userId, code)` 回源 `RbacDirectoryService.getUserPermissions`——**数据驱动**，无 TS 枚举需要扩展。权限定义在 DB（`database/backups/*.sql` 中已 seed `SOLVER_RUN_*`/`SOLVER_RESULT_APPLY`，与 MEMORY「63 权限已落库」一致）。
- V5 与 V4 是**同一类操作**（触发求解 / 读 run / 停止 / 应用结果），语义复用合理。新增 `SOLVER_V5_*` 权限码会要求重新 seed DB + 配置 RBAC 角色绑定（配置成本），且当前 `AUTH_ENFORCE=false` 影子模式下新码无人持有反而更易踩坑。
- **结论**：V5 沿用 V4 权限码。**异议预留**：若未来产品要求「能跑 V4 的人不一定能跑 V5」（灰度管控），再新增 `SOLVER_RUN_EXECUTE_V5`；本期不做（D-级未要求，倾向沿用）。

---

## 5. run_code、/runs 列表、各端点与 V4 的差异

### 5.1 run_code = `V5-{ts}` 与 /runs 两代共存

- `createRunRecord` 写 `run_code = 'V5-${Date.now()}'`、`run_key` 同值（与 V4 同构）。
- `listRunsV5`：`WHERE run_code LIKE 'V5-%' ORDER BY created_at DESC LIMIT 50`——**只列 V5 run**，与 V4 的 `LIKE 'V4-%'` 天然分库，互不串台。
- **两代共存展示**：V4 的 `/api/v4/scheduling/runs` 和 V5 的 `/api/v5/scheduling/runs` 各查各的前缀，**前端分别在各自页面展示**（V4 在 `/solver`，V5 在 `/solver-v5`）。同一张 `scheduling_runs` 表，靠 `run_code` 前缀区分代次。无需新表、无需迁移。
- run 详情/result/apply 用 `runId`（主键）寻址，与 run_code 前缀无关——V5 端点拿到任意 runId 都能读，但**前端只会传 V5 自己创建的 runId**（列表已按前缀过滤），故不会跨代误操作。

### 5.2 apply/precheck/preview/stop/status 与 V4 的差异（应为零差异，仅指向 SOLVER_V5_URL）

| 端点 | 与 V4 差异 |
|---|---|
| POST `/runs/:id/apply` | **零逻辑差异**。落库格式、scope-aware delete、双轨兼容、special shift 生命周期、I1-I3 不变量全保留（§5 边界 E）。仅日志前缀。 |
| POST `/precheck` | 仅 `fetch` 目标 `SOLVER_V5_URL/api/v5/precheck`，30s 超时不变。 |
| POST `/preview-proposal` | 仅 `fetch` 目标 `SOLVER_V5_URL/api/v5/solve`，60s 超时、`preview_only=true`、不建 run、不落库全保留；`capability_gap.code='SOLVER_V5_PREVIEW_UNAVAILABLE'`。 |
| POST `/runs/:id/stop` | 仅 `fetch` 目标 `SOLVER_V5_URL/api/v5/abort/:id`。 |
| GET `/runs/:id/status` | **零差异**（solver 轮询，返回 `{status,stage,error}`）。 |
| GET `/runs/:id/result` | 富化逻辑零差异；**额外**在 `data` 附 `infeasibility_analysis`（§6）+ `viz`（收敛回看）。这是「只增字段」，不破坏 V4 result 形状（§5 边界 D）。 |

### 5.3 apply scope 解析（复用 ScopeService，行为等价）

抽查 `ScopeService.resolveRunUnit(runId)`：查 `scheduling_run_batches` JOIN 取 team_id。但 **V4 controller 不写 `scheduling_run_batches`**（该表由 V2/V3 的 `schedulingPersistenceService` 写）——故 V4 run 查不到行 → `rows.length !== 1` → 返回 `REQUIRE_GLOBAL_SENTINEL`（保守要求全局 scope）。**V5 复用同一 ScopeService，同样不写 `scheduling_run_batches`，行为与 V4 完全一致**（apply 写端点要求全局权限，scope 收窄靠 `summary_json.scope`，与 ScopeService 的 RBAC scope 是两条独立机制）。V5 的 `summary_json.scope` 三段式快照（createRunRecord → orchestrator 补 employee_ids/standalone_task_ids → apply 读取收窄 delete）逐行复刻 V4。**结论：apply scope 零差异。**

---

## 6. server.ts 挂载、.env 样例、infeasibility_analysis 存储下发

### 6.1 server.ts 纯增量挂载（精确改动）

仅两处增量，**不改任何现有行为**：

**改动1（新增 import + 挂载，2 行）**：
```ts
// import 区（紧邻现有 schedulingV4Routes import）
import schedulingV5Routes from './routes/schedulingV5';
// 挂载区（紧邻 app.use('/api/v4/scheduling', schedulingV4Routes) 之后）
app.use('/api/v5/scheduling', schedulingV5Routes);
```

**改动2（扩展 auth-bypass 的 `isSolverMachinePath`，2 行匹配）**：
```ts
const isSolverMachinePath = (urlPath: string): boolean => {
  if (urlPath.startsWith('/api/v4/scheduling/callback/')) return true;
  if (/^\/api\/v4\/scheduling\/runs\/[^/]+\/status$/.test(urlPath)) return true;
  // ↓ V5 新增（纯增量，与 V4 同构）
  if (urlPath.startsWith('/api/v5/scheduling/callback/')) return true;
  if (/^\/api\/v5\/scheduling\/runs\/[^/]+\/status$/.test(urlPath)) return true;
  return false;
};
```

> 改动2 是「挂新路由的配套」——V5 机器回调路径必须与 V4 一样被排除在人类 JWT 之外，否则 AUTH_ENFORCE=true 时 solver 回调会被 401。属 R1 允许的增量。

### 6.2 .env.sample 新增（backend/.env.sample，纯增量）

在 `# --- Solver ---` 段追加：
```bash
# V5 求解器（与 V4 并存，独立端口）。
SOLVER_V5_URL=http://localhost:5006
```
`SOLVER_CALLBACK_SECRET` **沿用同一条**（V4/V5 共用，D4 要求）。`start_all.sh` 需新增 V5 solver 启动块（端口 5006，`BACKEND_API_URL=http://localhost:3001/api/v5/scheduling/callback/progress`，沿用同一 `SOLVER_CALLBACK_SECRET`）——这是部署脚本增量，归 solver 设计师 + 部署文档协调，本文档登记为依赖项（§9 open question）。

### 6.3 infeasibility_analysis 存储与下发（§4c 加分项）

**产生**：仅当 solver 主求解 INFEASIBLE 时，V5 solver 触发二次诊断 pass（`SufficientAssumptionsForInfeasibility` → 七组业务约束的 assumption literal → 业务可读文案），把结果塞进 result JSON 的 `infeasibility_analysis` 字段（见 §7 契约 + `12_solver_design.md`）。

**存储（零协议改动）**：result callback 的 payload 是 `{run_id, result}`，`result` 是**完全不透明的 JSON**（V4 `receiveSolveResultV4` 原样 `saveResults`）。`infeasibility_analysis` 作为 `result` 的一个新子键，**自动随 `result_summary` 落库**——`buildStoredResult(result)` 用 `{...result, summary:{...}}` 展开保留所有原字段，故 `infeasibility_analysis` 天然保留在 `result_summary` JSON 里，**无需改 saveResults**。V5 `helpers.ts` 仅新增一个读取函数 `extractInfeasibilityAnalysis(result) => result?.infeasibility_analysis ?? null` 供 result 端点取用。

**下发**：`getSolveResultV5` 在 `data` 里附 `infeasibility_analysis`（前端「无解原因」面板消费）。实时通道：solver 也可在 INFEASIBLE 时通过 `log_diagnosis`（V4 已有，`category="CONFLICT"` 日志通道）把诊断推进 `logs_full`，前端进度弹窗即时显示——这条路 V4 已预留，V5 复用。

---

## 7. 接口契约表（字段级，与 solver / 前端两侧对齐）

### 7.1 后端 → solver（POST `SOLVER_V5_URL/api/v5/solve`）

请求 body = `V4SolverRequest`（DataAssemblerV4 产出，**逐字段等价 V4**）+ V5 包装覆盖：

| 字段 | 值 | 与 V4 差异 |
|---|---|---|
| `request_id` | `V5-{runId}-{ts}`（外层覆盖） | 前缀 V4→V5（仅日志文件名，不影响求解） |
| `window` / `operation_demands` / `employee_profiles` / `calendar` / `shift_definitions` / `locked_*` / `frozen_*` / `solve_range` / ... | DataAssemblerV4 原样 | **零差异** |
| `config` | `{...config, ...solverRequest.config, metadata:{ run_id: runId, solver_generation:'V5' }}` | 新增 `metadata.solver_generation`（纯增量，solver 据此选 V5 回调端点） |

### 7.2 solver → 后端（POST `/api/v5/scheduling/callback/progress`）

V4 字段全保留，新增 viz 字段（§4b 扩展 payload）：

| 字段 | 类型 | V4 有? | 语义 |
|---|---|---|---|
| `run_id` | number | ✅ | run 主键 |
| `status` | `RUNNING|COMPLETED|FAILED` | ✅ | 不变 |
| `type` | `STATUS|SOLUTION|LOG|FINAL|INFO` | ✅ | 不变 |
| `progress` | number(0-100) | ✅ | 不变 |
| `metrics` | object | ✅ | 不变（solution_count/objective_value/best_bound/gap/wall_time） |
| `message` | string | ✅ | 不变 |
| `log_line` | string | ✅ | 不变（含 `[DIAG]`/`category=CONFLICT` 诊断行） |
| `phase` | `BUILDING\|PRESOLVE\|SOLVING\|EXTRACTING\|DIAGNOSING` | ❌ V5 新增 | 当前阶段（含无解诊断段 DIAGNOSING） |
| `event` | `MODEL_STATS\|NEW_INCUMBENT\|SEARCH_STATS\|PHASE_ENTER\|DIAGNOSIS` | ❌ V5 新增 | 事件类型 |
| `model_stats` | `{num_vars, num_constraints, by_layer:{...6 层}, by_constraint:{<name>:{count, ms, vars}}, presolve?}` | ❌ V5 新增 | 模型构建规模。**by_constraint 每条目冻结为 `{count, ms, vars}`**（与 solver §2.2 对齐，非 `{vars,constraints}`）；by_layer:{assignments,shift,vacancy,special_cover,special_shortage,task_placement}；presolve 可选 |
| `incumbent` | `{obj, bound, gap, wall_time, breakdown:{...9 分量}, preview?}` | ❌ V5 新增 | 新解 + L4 分量（§3.2 breakdown 9 项）+ 轻量 preview（fill_rate/vacant_positions） |
| `search_stats` | `{branches, conflicts, booleans}` | ❌ V5 新增 | 搜索强度 |
| `infeasibility` | `{located, groups:[{group, lit_key, message_zh, suggestion_zh, config_keys[]}]}` | ❌ V5 新增 | 仅 event=DIAGNOSIS 携带；写入 solver_progress.infeasibility |

> **铁律**：V4 字段名/语义不改（§5 边界 C）。新字段 V4 前端忽略、V5 前端消费。`metrics`/`incumbent.breakdown` 的 9 个分量键名与 §3.2 `objective_breakdown` 严格一致（special_shortage_penalty / vacancy_penalty / special_impact / hours_deviation_scaled / special_shift_count / night_shift_variance / weekend_work_variance / triple_salary_count / leadership_penalty）。

### 7.3 solver → 后端（POST `/api/v5/scheduling/callback/result`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `run_id` | number | 不变 |
| `result` | object（不透明 JSON） | V4 班次锚定结构全保留（schedules/unassigned_jobs/special_shift_*/share_group_compliance/metrics），**新增** `result.infeasibility_analysis`（见 7.5）+ `result.metrics.objective_breakdown`（终解的 9 分量，**在 metrics 容器内**，与 solver §3.4 对齐，供 L4 离线比对） |

### 7.4 后端 → 前端 SSE（命名事件 `progress`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | `INIT\|RUNNING\|STOPPING\|COMPLETED\|APPLIED\|FAILED` | 不变 |
| `stage` | `INIT\|ASSEMBLING\|SOLVING\|DONE` | 不变 |
| `error` | string\|null | 不变 |
| `solver_progress` | object | V4 键（progress/metrics/message/logs）+ V5 键（phase/model_stats/search_stats/convergence[]/events[]/viz_meta），见 §2.1 |

### 7.5 `infeasibility_analysis` 结构（七组约束，§4c）

**冻结 schema（与 solver §6.5、frontend §7.1 字段逐字符对齐）**：

```jsonc
"infeasibility_analysis": {
  "is_infeasible": true,
  "located": true,                      // 是否定位到七组之内
  "diagnosed_at": "2026-06-11T...",
  "minimal_conflict_groups": [          // SufficientAssumptionsForInfeasibility 映射回的业务组
    {
      "group":         "STANDARD_HOURS",  // 七组之一（见下）
      "lit_key":       "lit_hours",       // CP-SAT assumption literal 键（调试用）
      "message_zh":    "工时下限太紧：6月假期多，月度下限差 12 小时无人可补",
      "suggestion_zh": "建议在高级设置放宽月度工时容差（H9 下限）",
      "config_keys":   ["enable_standard_hours"],  // 数组：一键跳配置目标开关
      "related_employees": [101, 205],    // 可选，便于前端高亮
      "related_dates":     ["2026-06-15"]  // 可选
    }
  ]
}
```

> 与实时回调 `solver_progress.infeasibility.groups[]`（§7.2）组项字段**完全相同**，仅外层键名/数组名不同（实时=`infeasibility.groups`，结果=`infeasibility_analysis.minimal_conflict_groups`）。`extractInfeasibilityAnalysis(result)` 原样返回 `result.infeasibility_analysis`，不做字段改名。

七组 `group`（与 §4c 表 / solver §6.2 对齐，**第 7 组冻结为 `POSITION_MUST_FILL`**）：`STANDARD_HOURS` / `LOCKED_OPERATIONS` / `CONSECUTIVE_DAYS` / `SPECIAL_SHIFT_COVERAGE` / `LEADERSHIP_COVERAGE` / `LOCKED_SHIFTS` / `POSITION_MUST_FILL`。

### 7.6 后端 → 前端（GET `/api/v5/scheduling/runs/:id/result`）

`data` = V4 富化结构（metrics/details/assignments/shift_plans/operations/special_shift_*/calendar_days/...，**逐字段等价 V4**）+ V5 新增：

| 新字段 | 来源 | 用途 |
|---|---|---|
| `infeasibility_analysis` | `result.infeasibility_analysis`（含 `minimal_conflict_groups[]`，§7.5） | 无解原因面板 |
| `objective_breakdown` | `result.metrics.objective_breakdown`（**从 metrics 下读**，§7.3） | L4 分量展示 / 与 V4 离线比对 |
| `viz` | `solver_progress.{convergence,events,model_stats,search_stats,infeasibility}` | 「回看求解过程」（结果页可重放收敛曲线 + 无解诊断） |

---

## 8. 实现步骤拆解（每步可独立验证）

| 步 | 内容 | 独立验证手段 |
|---|---|---|
| S1 | 复制 V4 → V5 五处骨架文件（route + index/types/lifecycle/precheck/preview controller），全局替换 V4→V5 字面量、URL→SOLVER_V5_URL、run_code→V5-；**先不接 viz**。`server.ts` 挂载 + auth-bypass 扩展。 | `cd backend && npm run build` 通过；`curl -XPOST /api/v5/scheduling/solve`（solver 未起时应建 run 后 FAILED，但 run_code=V5-）；`GET /api/v5/scheduling/runs` 返回空或仅 V5 run。 |
| S2 | orchestrator 接 DataAssemblerV4（复用）+ request_id 外层覆盖 + metadata.solver_generation。指向 SOLVER_V5_URL。 | mock 一个 5006 端口回 200 的假 solver，验证 run 走到 SOLVING→COMPLETED；DataAssemblerV4 被调用（日志 RequestID=V5-...）。 |
| S3 | `updateSolveProgressV5` 接 viz 扩展字段（§2.2 读-改-写 + 裁剪）+ §2.1 初始结构。 | 单测：构造 350 个 NEW_INCUMBENT 回调 → 断言 `convergence.length<=300` 且 `viz_meta.convergence_count==350`；构造 250 个 event → `events.length<=200`。 |
| S4 | SSE 透传（§3）+ 200ms 合并节流 + 独立 progressEmitter。 | 集成测试：SSE 客户端连 `/runs/:id/progress`，喂回调，断言收到的 `solver_progress` 含 convergence/phase 字段且 V4 字段（progress/logs）不丢。 |
| S5 | result 端点附 infeasibility_analysis + viz + objective_breakdown（§6.3/§7.6）。 | mock solver 回带 `infeasibility_analysis` 的 result → `GET /runs/:id/result` 的 `data.infeasibility_analysis` 非空。 |
| S6 | apply/stop/status 复刻验证（零差异）。 | 用 V5 run 跑完整 apply 事务，断言落库表与 V4 一致（同输入对比 bpa/esp 行）。 |
| S7 | .env.sample + start_all.sh V5 solver 块（与部署/solver 设计师协调）。 | `./start_all.sh` 后 `curl /api/v5/health`（solver）+ `/api/v5/scheduling/runs`（backend）双通。 |

---

## 9. 测试方案

### 9.1 单元测试（vitest，`backend/src/tests/`，CI-safe 无 DB）

- `schedulingV5.viz-clamp.test.ts`：`clampVizArrays` 纯函数——验证 convergence 超 300 时保头+下采样+保尾、events 超 200 FIFO、logs 超 1000 保尾；`viz_meta` 计数器记真实总数。
- `schedulingV5.request-id.test.ts`：验证 orchestrator 外层覆盖 `request_id` 为 `V5-{runId}-{ts}` 且**不修改 DataAssemblerV4 返回的其它字段**（深比对除 request_id 外全等）。
- `schedulingV5.payload-compat.test.ts`：验证 V5 回调 payload 解析对缺失 viz 字段（纯 V4 形态）优雅降级，且 V4 字段全部正确落 `solver_progress`。
- `schedulingV5.infeasibility.test.ts`：`extractInfeasibilityAnalysis` 对有/无 `infeasibility_analysis` 的 result 行为正确。

### 9.2 集成测试（需 live MySQL，`npm run test:db`）

- 全链路 mock-solver（一个 5006 端口的假 Flask/express，按脚本回放回调）：建 run → 喂进度回调（含 viz）→ SSE 收到 → 喂 result callback → result 端点富化 → apply 落库。断言 run_code=V5-、`solver_progress` 含 viz、apply 后表数据与同输入 V4 一致。
- 鉴权测试：`/api/v5/scheduling/callback/progress` 不带 `X-Solver-Callback-Token` → 401（密钥已配）/ 503（密钥未配）；带正确密钥 → 200。

### 9.3 回归测试（R2 不降低，离线对比脚本）

复用 §3.3 的离线对比脚本（喂同一批 `logs/request_{id}.json` 分别 POST 到 V4:5005 与 V5:5006），按 L0–L4 字典序比对。**后端侧职责**：保证 V5 喂给 solver 的请求与 V4 逐字节等价（除 request_id 前缀）——加一个测试：同一 `(start,end,batchIds,config)`，分别走 V4 orchestrator 的 assemble 和 V5 orchestrator 的 assemble（均调 DataAssemblerV4），断言生成的 solver 请求 body 除 `request_id` 外深比对全等。这把「L0–L3 不降低」的后端责任收口为「输入等价」。

### 9.4 体验不变验证（R3，A–F 边界）

- B（config 87 字段）：V5 透传 config 不丢键——测试喂全量 87 字段 config，断言 solver 请求 body 的 config 与输入一致（V5 只在 metadata 加 solver_generation）。
- D（结果 payload 形状）：result 端点返回的 V4 字段集与 V4 端点逐键比对相等（新增字段不算差异）。
- E（apply 落库）：见 9.2。

---

## 10. 与 V4 的差异点逐条清单（含 R2/R3 影响与保障）

| # | 差异点 | 对 R2（结果不降低）影响 | 对 R3（体验不变）影响 | 保障 |
|---|---|---|---|---|
| 1 | 新目录 `schedulingV5/` + 路由前缀 `/api/v5/scheduling` | 无 | 无（V4 路由原样保留，并存） | V4 文件零改动；server.ts 纯增量挂载 |
| 2 | `SOLVER_V5_URL`（5006）替换 `SOLVER_V4_URL` | 无（仅目标地址） | 无 | 新 env，V4 仍指 5005 |
| 3 | `run_code='V5-'` + listRunsV5 `LIKE 'V5-%'` | 无 | 体验：历史列表分代展示（更清晰，非劣化） | 同表前缀隔离，无迁移 |
| 4 | `request_id` 外层覆盖 `V5-` 前缀 | 无（solver 优先用 metadata.run_id，request_id 仅日志文件名） | 无 | 包装覆盖，DataAssemblerV4 零改动 |
| 5 | DataAssemblerV4 **直接复用** | **正向保障**：输入与 V4 逐字节等价 → L0–L3 不降低的前提成立 | 无 | 9.3 输入等价测试 |
| 6 | `solver_progress` 新增 viz 累积结构 + 裁剪 | 无（纯观测，不进求解） | 体验：进度弹窗多「过程可视化」面板（R5 核心新增，加值非劣化） | JSON_ARRAY 上限裁剪防膨胀；V4 字段只增不改 |
| 7 | SSE payload 新增 viz 子键 + 200ms 合并节流 | 无 | 无（V4 字段位置语义不变，新键降级） | §5 边界 C；前端对未知键降级 |
| 8 | 鉴权沿用 V4 权限码 + 同一 callback secret | 无 | 无（无新 RBAC 配置） | §4 查证：数据驱动权限，沿用零成本 |
| 9 | result 新增 `infeasibility_analysis`/`viz`/`objective_breakdown` | 无（只增字段；breakdown 供离线比对，正向） | 体验：无解原因面板（R6 加分） | §5 边界 D：result 形状只增不改 |
| 10 | 独立 `progressEmitter` 实例 | 无 | 无 | V5 run 与 V4 run 事件隔离 |
| 11 | apply/precheck/preview/stop/status **零逻辑差异** | 无 | 无 | §5.2/§5.3 逐条复刻 + I1-I3 不变量 |

---

## 11. 异议（无）

对 D1–D6 顶层决策无强烈异议。两点**温和提示**（不构成异议，登记为风险/待协调）：

- **R-1（权限码沿用 vs 灰度管控）**：沿用 V4 权限码意味着「能跑 V4 的人自动能跑 V5」。若产品后续要灰度（仅部分人试用 V5），需新增 `SOLVER_RUN_EXECUTE_V5` 并 seed DB。本期按 D（倾向沿用）执行，提示决策层知悉此权衡。
- **R-2（V5 log 软上限是 V4 没有的保护）**：V5 给 `logs` 加了 1000 行软上限（V4 无上限）。这是 V5 独立 run 的内部优化，**不影响 V4**，但若回归脚本依赖完整 log 行数比对，需注意 V5 log 可能被裁尾（建议比对用结构化 `logs_full` 或 result 而非裸 logs）。

---

## 12. 依赖与待协调项（open questions）

1. **solver 侧回调端点 `/api/v5/scheduling/callback/progress`** 必须由 V5 solver 的 `BACKEND_API_URL` **静态固定**指向（部署时已配为 `http://localhost:3001/api/v5/scheduling/callback/progress`）。`metadata.solver_generation='V5'` 仅作诊断标记，**不**参与回调 URL 选择——见 `10_solver_design.md §7.2`。
2. **`incumbent.breakdown` / `result.metrics.objective_breakdown` 的 9 分量键名与量纲**必须与本文档 §7.2/§7.3 严格一致（与 solver §3.2/§3.4 对齐，breakdown 在 metrics 容器内）。需与 solver 设计师锁定字段名，否则 L4 离线比对对不上。
3. **`start_all.sh` 的 V5 solver 启动块**（端口 5006 + BACKEND_API_URL + 共用 SOLVER_CALLBACK_SECRET）——归部署/solver 设计师，本文档登记为依赖。
4. **前端 `viz` 消费形态**（收敛曲线点列 convergence、事件流 events、model_stats 条形图）需与 `13_frontend_design.md`（前端设计师）对齐 §7.4/§7.6 的字段命名与裁剪后的数据量上限（300 点 / 200 事件）。
5. **并发互斥**（V4 风险点 #1：无「已有 RUNNING run 拒绝新 run」）——V5 是否在 `createSolveTaskV5` 入口加互斥检查？本文档**默认保持 V4 行为（不加）**以维持体验一致；若加属增强，需产品确认（登记，不在本期默认开启）。

---

## 13. 评审修订记录（总架构师裁决后回改）

> 由 V5 总架构师对三方评审 findings 裁决后统一回改。冻结契约以 `20_IMPLEMENTATION_PLAN.md §冻结契约` 为唯一权威。

| # | 评审项（裁决）| 本文档改动 |
|---|---|---|
| BLOCKER | model_stats.by_constraint schema（**采纳 {count,ms,vars}**）| §7.2 改为 `{count, ms, vars}`，并补 `by_layer` 六层 + 可选 `presolve` |
| BLOCKER | 无解诊断字段名（**采纳**）| §7.5 minimal_conflict_groups 组项改为 `{group, lit_key, message_zh, suggestion_zh, config_keys[], related_*?}`，加 `located`；§2.1/§2.2 solver_progress 补 `infeasibility` 字段 + DIAGNOSIS 写入分支 |
| BLOCKER | objective_breakdown 嵌套（**采纳 result.metrics**）| §7.3/§7.6 改为 `result.metrics.objective_breakdown` |
| BLOCKER | phase 枚举缺 DIAGNOSING（**采纳**）| §2.1/§7.2 phase enum 补 `DIAGNOSING`；event enum 补 `DIAGNOSIS` |
| BLOCKER | isSolverMachinePath 漏改（**采纳**）| §0 总纲 R1 措辞改为「server.ts 两处纯增量改动」，与 §6.1 一致 |
| MAJOR | model_stats 缺 by_layer/presolve（**采纳**）| §7.2 补 by_layer + presolve（同上 BLOCKER 行合并） |
| MAJOR | 缺 config.hint.previous_solution 注入（**采纳**）| §1.4.1 新增注入逻辑（查上次 APPLIED/COMPLETED V5 run → 精简 → 校验 → 注入，失败降级） |
| MAJOR | phase enum 缺 DIAGNOSING（同上 BLOCKER）| 已含 |
| MAJOR | convergence 点 t 字段来源不明（**采纳 wall_time**）| §2.1/§2.2 convergence 点改 `{wall_time,...}`，wall_time=payload.incumbent.wall_time |
| MAJOR | 第 7 组 group 标识符（**采纳 POSITION_MUST_FILL**）| §7.5 确认为 POSITION_MUST_FILL（前端 §7.1 同步改） |
| MINOR | metadata.solver_generation 选回调端点（**采纳**）| §1.4/§12.1 改为纯诊断标记，回调 URL 静态固定 |
| MINOR | solver_progress 缺 infeasibility 字段（**采纳方案 1**）| §2.1 补 `infeasibility: null`，§2.2 加 DIAGNOSIS 写入分支 |
