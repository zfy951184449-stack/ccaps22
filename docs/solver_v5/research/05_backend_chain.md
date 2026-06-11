# 后端 V4 调度链路详细调研报告

> 目标读者：将要从零实现 V5 求解器的工程师。所有符号/字段名保持英文原样。
>
> 覆盖文件：
> - `backend/src/routes/schedulingV4.ts`
> - `backend/src/services/schedulingV4/DataAssemblerV4.ts`
> - `backend/src/controllers/schedulingV4/` 下全部 10 个文件

---

## 一、完整端点清单

路由前缀挂载：`/api/v4/scheduling`（见 `backend/src/server.ts`）。

| # | Method | Path | Handler | 鉴权 | 作用 |
|---|--------|------|---------|------|------|
| 0 | GET | `/runs` | `listRunsV4` | `SOLVER_RUN_READ` | 列出最近 50 条 V4 run 历史（run_code LIKE `V4-%`） |
| 1 | POST | `/solve` | `createSolveTaskV4` | `SOLVER_RUN_EXECUTE` | 触发新一轮 V4 求解；立即返回 runId，异步执行 |
| 2 | GET | `/runs/:runId/progress` | `getSolveProgressSSEV4` | `SOLVER_RUN_READ` | SSE 实时进度流（event: `progress`） |
| 3 | POST | `/callback/progress` | `updateSolveProgressV4` | `requireServiceAuth`（机器密钥） | solver 进程推送进度回调 |
| 3b | POST | `/callback/result` | `receiveSolveResultV4` | `requireServiceAuth` | solver 进程推送最终结果回调 |
| 4 | GET | `/runs/:runId/result` | `getSolveResultV4` | `SOLVER_RUN_READ` | 取已完成 run 的富化结果（含员工名、班次定义、资质等） |
| 5 | POST | `/runs/:runId/stop` | `stopSolveV4` | `SOLVER_RUN_ABORT` | 用户手动停止；向 solver 发 abort，同时推 SSE `STOPPING` |
| 6 | GET | `/runs/:runId/status` | `getSolveStatusV4` | `requireServiceAuth` | solver 轮询（`poll_server_stop`），返回 `{status,stage,error}` |
| 7 | POST | `/runs/:runId/apply` | `applySolveResultV4` | `SOLVER_RESULT_APPLY` + `requireScope` | 将结果落入生产表，事务操作 |
| 8 | POST | `/precheck` | `runPrecheckV4` | `SOLVER_RUN_READ` | 同步 precheck（组装数据后 30 s 超时转发至 solver `/api/v4/precheck`） |
| 9 | POST | `/preview-proposal` | `createPreviewProposalV4` | `SOLVER_RUN_READ` | 纯预览求解（60 s 超时）；不创建 run 记录，不落库 |

### 鉴权双轨制

- **人类用户端点**（0/1/2/4/5/7/8/9）：走 JWT `requirePermission`，具体 Permission Code 见上表。
- **机器回调端点**（3/3b/6）：走 `requireServiceAuth`，校验请求头 `X-Solver-Callback-Token === process.env.SOLVER_CALLBACK_SECRET`（`crypto.timingSafeEqual`）。`SOLVER_CALLBACK_SECRET` 未配置时返回 503（`SERVICE_AUTH_UNCONFIGURED`），配置但不匹配返回 401。
- `server.ts` 已将 `/callback/*` 路径从全局 `requireAuth` 中排除；`/runs/:runId/status` 也被排除（见路由注释行 66-74）。

---

## 二、DataAssemblerV4 — DB 读表与请求结构

入口：`DataAssemblerV4.assemble(startDate, endDate, batchIds, teamIds?, solveRange?, config?)`
文件：`backend/src/services/schedulingV4/DataAssemblerV4.ts`

### 2.1 并行 DB 读取（`Promise.all`，第 334-345 行）

| 调用 | 读的表 | 条件 / 说明 |
|------|--------|-------------|
| `fetchOperations` | `batch_operation_plans`(别名 bop) JOIN `production_batch_plans`(pbp) JOIN `operations`(o) | `pbp.id IN batchIds` + `planned_start_datetime BETWEEN startDate~endDate` + `pbp.plan_status='ACTIVATED'` |
| `fetchEmployees` | `employees`(e) LEFT JOIN `employee_roles`(er ON e.primary_role_id) + `employee_qualifications` + `employee_unavailability` | 全局：`employment_status='ACTIVE'`；有 teamIds：递归 CTE `organization_units` 过滤 `unit_id`；不读废弃 `employees.org_role`（用 `COALESCE(er.role_code, e.org_role, 'FRONTLINE')`） |
| `fetchShifts` | `shift_definitions` | `is_active=1`；字段 `category` 映射为 `plan_category` |
| `fetchCalendar` | `calendar_workdays` LEFT JOIN `holiday_salary_config` | `calendar_date BETWEEN startDate~endDate`；`salary_multiplier>=3` → `is_triple_salary` |
| `fetchShareGroups` | `batch_share_groups` JOIN `batch_share_group_members` JOIN `batch_operation_plans` | `bop.planned_start_datetime BETWEEN` + `bop.batch_plan_id IN batchIds` |
| `fetchLockedOperations` | `batch_operation_plans` JOIN `production_batch_plans` JOIN `batch_personnel_assignments`(bpa) | `bpa.is_locked=1 OR bop.is_locked=1` + `assignment_status IN ('PLANNED','CONFIRMED')` |
| `fetchLockedShifts` | `employee_shift_plans` | `plan_date BETWEEN` + `is_locked=1` |
| `fetchHistoricalShifts` | `employee_shift_plans` LEFT JOIN `shift_definitions` | 回溯 `max(max_consecutive_work_days,max_consecutive_rest_days,6)+1` 天；读 `plan_category`+`is_night_shift`，计算连续工作/休息天数 |
| `fetchSpecialShiftRequirements` | 委托给 `SpecialShiftWindowService.fetchSolverRequirements(effectiveSolveStart, effectiveSolveEnd)` | 区间求解时只取 solve 范围内的 special shift |

### 2.2 串行/条件读取（assemble 第二段）

| 调用 | 读的表 | 说明 |
|------|--------|------|
| `enrichOperationsWithCandidates` → `fetchRequirements` | `operation_qualification_requirements` | 按 `operation_id IN (...)` 批量取资质要求 |
| `fetchAndEnrichStandaloneTasks`（config.enable_standalone_tasks !== false） | `standalone_tasks` + `standalone_task_qualifications` | 全局取全部 PENDING/SCHEDULED 且时间窗重叠；teamIds 过滤时用递归 CTE + `team_id IS NULL`（全局任务） |
| `fetchResources` | `resources` | `is_schedulable=1`；teamIds 时用 CTE 过滤 `owner_org_unit_id` |
| `fetchResourceCalendars` | `resource_calendars` | 时间窗重叠；按 team 资源 ID 过滤 |
| `fetchMaintenanceWindows` | `maintenance_windows` | 时间窗重叠；按 team 资源 ID 过滤 |
| `fetchOperationResourceRequirements` | 双路：feature flag 打开时读 `batch_operation_resource_requirements`（快照优先）UNION `operation_resource_requirements`（兜底）；flag 关闭时只读 `operation_resource_requirements` | feature flags：`ENABLE_BATCH_RESOURCE_SNAPSHOTS` + `ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ` |
| 区间求解（isIntervalSolve=true）：`fetchFrozenShifts` + `fetchFrozenAssignments` | `employee_shift_plans` / `batch_personnel_assignments` JOIN `batch_operation_plans` | 全窗内、solve 范围**外**的已有排班/分配 → 作为 `frozen_shifts`/`frozen_assignments` 传给 solver |

### 2.3 组装出的 `V4SolverRequest` 结构

```typescript
{
  request_id: string;             // "V4-{timestamp}"
  window: { start_date, end_date };
  operation_demands: V4OperationDemand[];   // 批次工序 + standalone task，负 ID 表示 standalone
  special_shift_requirements: V4SpecialShiftRequirement[];
  employee_profiles: V4EmployeeProfile[];
  calendar: V4CalendarDay[];
  shift_definitions: V4ShiftDefinition[];
  shared_preferences: V4SharedPreference[];   // 跨批次共享组
  locked_operations: V4LockedOperation[];      // { operation_plan_id, enforced_employee_ids }
  locked_shifts: V4LockedShift[];
  historical_shifts: V4HistoricalShift[];      // 连续天数边界数据
  resources: V4Resource[];
  resource_calendars: V4ResourceCalendarEntry[];
  operation_resource_requirements: V4OperationResourceRequirement[];
  maintenance_windows: V4MaintenanceWindow[];
  // 区间求解时追加：
  solve_range?: { start_date, end_date };
  frozen_shifts?: V4FrozenShift[];
  frozen_assignments?: V4FrozenAssignment[];
  config?: any;    // 透传 + 注入 allow_standalone_vacancy 等
}
```

#### `V4OperationDemand` 关键字段
- `operation_plan_id`: 正整数 = `batch_operation_plans.id`；负整数 = `-standalone_tasks.id`
- `batch_code`: `"STANDALONE"` 标志独立任务
- `position_qualifications[].candidate_employee_ids`: 后端**预过滤**的候选员工列表（资质 + 不可用时间双重过滤）
- `scheduling_mode`: `"FIXED"` | `"FLEXIBLE"`（standalone task 类型决定）
- `source_type`: `"STANDALONE"` 标志独立任务来源

#### `V4EmployeeProfile` 关键字段
- `org_role`: 读自 `COALESCE(employee_roles.role_code, employees.org_role, 'FRONTLINE')`
- `unavailable_periods`: 来自 `employee_unavailability`

#### `V4ShiftDefinition` 关键字段
- `plan_category`: DB `shift_definitions.category` 列的映射（非 `category` 字段名）

### 2.4 时区处理
- 工厂时区固定 `'+08:00'`（`FACTORY_TIME_OFFSET` 常量，第 15 行）
- `toFactoryIsoDateTime()` 函数：MySQL DATE/DATETIME 字符串（无时区后缀）先解析为本地时间，再拼 +08:00 转 ISO 8601（UTC）字符串发给 solver

---

## 三、solveOrchestrator / solveLifecycle 状态机

### 3.1 Run 状态值与字段

`scheduling_runs` 表核心字段（`backend/src/controllers/schedulingV4/helpers.ts` + DB backup DDL）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT UNSIGNED PK AUTO_INCREMENT | run ID，唯一标识 |
| `run_code` | VARCHAR(64) | V4 runs 固定前缀 `V4-{timestamp}` |
| `run_key` | CHAR(36) | 同 run_code（createRunRecord 中设为相同值） |
| `status` | VARCHAR(20) | 状态机值，见下表 |
| `stage` | VARCHAR(20) | 阶段标记，见下表 |
| `window_start` / `window_end` | DATE | 完整调度窗口 |
| `solve_start` / `solve_end` | DATE | 区间求解的子范围（NULL = 全窗） |
| `target_batch_ids` | JSON | `number[]` |
| `result_summary` | LONGTEXT (JSON) | solver 原始结果 + buildStoredResult 包装 |
| `summary_json` | JSON | scope 快照 + special shift 计数 + 分配快照 |
| `solver_progress` | JSON | `{ progress, metrics, message, logs: string[] }` |
| `error_message` | TEXT | 失败原因 |
| `created_at` / `completed_at` | DATETIME | 创建/完成时间戳 |

**status 状态转移**：

```
QUEUED
  → RUNNING (triggerSolveAsync 开始：stage=ASSEMBLING)
  → RUNNING (数据组装完：stage=SOLVING)
  → STOPPING (用户 POST /stop)
  → COMPLETED / FAILED (stage=DONE)
  → APPLIED (POST /:runId/apply 成功)
```

**stage 阶段标记**（不是完整状态机，是辅助显示）：`INIT` → `ASSEMBLING` → `SOLVING` → `DONE`

### 3.2 运行中的 solve 存储位置

- **无内存 Map**：V4 没有类似 V2/V3 的全局 Map 缓存 running solve 对象。
- 进行中的 run 状态存在 **DB `scheduling_runs` 表**，通过 `run_id` 查询即可。
- SSE 进度广播通过 **`progressEmitter`**（`EventEmitter` 单例，`types.ts` 第 7 行，`setMaxListeners(100)`）：事件名为 `run:{runId}`（字符串）。

### 3.3 并发限制

**V4 目前没有并发限制**。`createSolveTaskV4` 直接 `createRunRecord` + `triggerSolveAsync(...).catch(...)` 异步启动，不检查是否已有 RUNNING 的 run。多次并发调用会在同一 solver 进程排队。

> V5 注意：若需要互斥，需在 `createSolveTaskV4` 中查询是否存在 `status='RUNNING'` 的 run 并拒绝。

### 3.4 超时机制

- **网络层超时**：`triggerSolveAsync` 第 119-120 行：`AbortController` + `setTimeout(10 * 60 * 1000)`（10 分钟）。超时后 `controller.abort()` 触发 `AbortError`，进入 catch 块，将 run 标记为 `FAILED`。
- **precheck** 超时：30 s（`precheckHandler.ts` 第 33 行）。
- **preview-proposal** 超时：60 s（`previewProposalController.ts` 第 222 行）。
- solver 内部有自己的时间限制，通过 `config.time_limit_seconds` 传递（DB `time_limit_seconds` 列存在但不在 createRunRecord 中显式写入）。

---

## 四、求解器回调 — 接收机制

### 4.1 进度回调

- **端点**：`POST /api/v4/scheduling/callback/progress`
- **鉴权**：`requireServiceAuth`（`X-Solver-Callback-Token` 共享密钥）
- **Body 字段**（`updateSolveProgressV4`，第 91-93 行）：
  ```json
  {
    "run_id": 123,
    "status": "RUNNING",
    "progress": 42,
    "metrics": { ... },
    "message": "...",
    "log_line": "..."
  }
  ```
- **DB 操作**：
  1. `UPDATE scheduling_runs SET status=COALESCE(?,status), solver_progress=JSON_MERGE_PATCH(COALESCE(solver_progress,'{}'),?)` — 增量合并进度
  2. 若有 `log_line`：`JSON_ARRAY_APPEND(solver_progress, '$.logs', log_line)` 追加日志
  3. 读出最新行，via `progressEmitter.emit('run:{run_id}', {...})` 推到 SSE

### 4.2 最终结果回调

- **端点**：`POST /api/v4/scheduling/callback/result`
- **鉴权**：`requireServiceAuth`
- **Body 字段**：`{ run_id, result }` — `result` 为 solver 原始 JSON
- **操作**：
  1. `saveResults(run_id, result)` → UPDATE `result_summary` + `summary_json`
  2. `updateRunStatus(run_id, COMPLETED|FAILED, ..., 'DONE')`
  3. `progressEmitter.emit('run:{run_id}', {status, stage:'DONE', ...})`
- **冲突保护**：`triggerSolveAsync` 的 catch 块在标记 FAILED 前先检查 DB 是否已被回调设为 COMPLETED，若是则跳过（防止 HTTP fetch 超时但 solver 已通过回调完成的竞态）。

### 4.3 SSE 推给前端

- **端点**：`GET /api/v4/scheduling/runs/:runId/progress`
- **协议**：标准 SSE，header: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- **事件名**：`progress`
- **payload 结构**（`sendProgress`，第 21-23 行）：
  ```json
  {
    "status": "RUNNING",
    "stage": "SOLVING",
    "error": null,
    "solver_progress": { "progress": 42, "metrics": {...}, "message": "...", "logs": [...] }
  }
  ```
- **双路数据来源**：
  1. **实时**：`progressEmitter.on('run:{runId}', onProgressUpdate)` — 由回调触发
  2. **兜底轮询**：`setInterval(5000ms)` 轮询 DB，应对 SSE 连接断线重连或 emitter 漏事件
- **终止条件**：收到 `status='COMPLETED'|'FAILED'` 时调用 `cleanup()`（移除 listener，clearInterval，`res.end()`）
- **连接断开**：`req.on('close', cleanup)` 清理资源

---

## 五、结果持久化

### 5.1 saveResults（`helpers.ts` 第 279-323 行）

触发时机：`triggerSolveAsync` fetch 收到 solver 响应 **或** `receiveSolveResultV4` callback 收到。

操作：
1. 构建 `storedResult = buildStoredResult(result)`（注入 `summary.status/scheduled_shifts/assigned_tasks/unassigned_jobs/fill_rate/saved_at`）
2. 从 DB 读出现有 `summary_json`，合并 special shift 统计
3. `UPDATE scheduling_runs SET result_summary=?, summary_json=? WHERE id=?`
4. 若 solver status 为 OPTIMAL/FEASIBLE/`FEASIBLE (Forced)` → `markSpecialShiftOccurrencesScheduled(runId)` → 调用 `SpecialShiftWindowService.markOccurrencesScheduled(runId, occurrenceIds)` 更新 `special_shift_occurrences.status`

### 5.2 apply（`applyResultController.ts`）

`POST /runs/:runId/apply` 触发，在**单个 DB 事务**中执行：

**清理阶段（scope-aware delete）**：

scope 来自 `summary_json.scope`（`createRunRecord` 写入，`triggerSolveAsync` 补充 `employee_ids` 和 `standalone_task_ids`）：

| scope 维度 | 写入时机 | 清理目标表 | 收窄策略 |
|-----------|---------|-----------|---------|
| `batch_ids` | `createRunRecord` | `batch_personnel_assignments` (JOIN `batch_operation_plans`) | 有 batch_ids → 按批次；全局 → 时间窗全删 |
| `employee_ids` | `triggerSolveAsync` assemble 后 | `employee_shift_plans` | 有 employee_ids → 按员工；全局 → 时间窗全删 |
| `standalone_task_ids` | `triggerSolveAsync` assemble 后 | `standalone_task_assignments` | 有任务 IDs → 按任务；全局 → 时间窗全删 |

- 清理前先读取 `is_locked=1` 的 assignments 和 shift plans 存入 Map，后续 INSERT 时跳过
- `is_fully_global = !hasScope || (scopeTeamIds.length===0 && scopeBatchIds.length===0)`
- 有 scope 但某维度键缺失 → **跳过（保守）**，不回退到全删（避免误删其他团队）

**写入阶段**：

| 目标表 | 操作 | 说明 |
|--------|------|------|
| `batch_personnel_assignments` | INSERT ... ON DUPLICATE KEY UPDATE | `(batch_operation_plan_id, employee_id, position_number, role='OPERATOR', assignment_status='PLANNED', scheduling_run_id)` |
| `standalone_task_assignments` | INSERT ... ON DUPLICATE KEY UPDATE | `(task_id, position_number, employee_id, status='PLANNED', scheduling_run_id, assigned_date, assigned_shift_id)` |
| `standalone_tasks` | UPDATE status='SCHEDULED' | 已分配的 task |
| `employee_shift_plans` | INSERT ... ON DUPLICATE KEY UPDATE | `(employee_id, plan_date, shift_id, plan_category, plan_state='PLANNED', plan_hours, batch_operation_plan_id, scheduling_run_id, is_generated=1)` |
| `batch_personnel_assignments.shift_plan_id` | UPDATE | 回填关联 `employee_shift_plans.id` |
| `special_shift_occurrence_assignments` | DELETE + INSERT | 先删旧 occurrence assignments，再按 requirement 插入；HARD requirement 若有 shortage 直接抛错 |
| `special_shift_occurrences` | UPDATE status='APPLIED'/'PARTIAL' | per occurrence |
| `employee_shift_plans` | UPDATE plan_category='OVERTIME' / plan_state='LOCKED' | 特殊班次 OVERTIME 类别标记；lock_after_apply 锁定班次，`lock_reason='SPECIAL_SHIFT_WINDOW:{window_id}'` |
| `scheduling_runs` | UPDATE status='APPLIED', summary_json=? | 最终状态 |

**ShiftPlanLinkService.backfillMissingShiftPlanLinks**：apply 完成后调用，修复遗漏的 `bpa.shift_plan_id` 关联（`shiftPlanLinkService.ts`）。

**结果格式双轨**：solver 可能返回两种格式，apply 都能处理：
- **新格式**（`rawResult.schedules` 数组存在）：每条 schedule 含 `{ employee_id, date, shift, tasks[] }`
- **旧格式**（`rawResult.assignments` + `rawResult.shift_schedule`）：分离的两个数组

### 5.3 apply 的 scope 不变量（L1 设计）

保证"责任域外零影响"的三条不变量（I1/I2/I3，代码注释中提及）：
- **I1**：局部求解不删除其他团队的 esp/bpa
- **I2**：责任域外的 is_locked=1 数据不被覆盖
- **I3**：全域 run（无 team）保持原有整窗删除行为（向后兼容旧 run 无 scope 字段）

---

## 六、precheck

`POST /api/v4/scheduling/precheck` → `precheckHandler.ts`

1. 接收 `{ batch_ids, start_date, end_date, config }`
2. 调用 `DataAssemblerV4.assemble(...)` 组装完整 solver 请求（与正式 solve 相同）
3. 30 s AbortController 超时，`POST {SOLVER_V4_URL}/api/v4/precheck`（透传组装结果）
4. 直接将 solver 返回的 `{ status, checks: [], total_checks }` 包装后返回给前端
5. **不创建 `scheduling_runs` 记录**，不写任何生产表

---

## 七、preview-proposal

`POST /api/v4/scheduling/preview-proposal` → `previewProposalController.ts`

1. 接收 `{ start_date, end_date, batch_ids, config, time_overrides, affected_operation_plan_ids, solve_range }`
2. `time_overrides`：`[{ operation_plan_id, planned_start, planned_end }]` — 内存时间覆盖，不写 DB
3. `DataAssemblerV4.assemble(...)` 组装 + `applyTimeOverrides(assembled, overrides)` 修改 `operation_demands` 的 `planned_start/end/planned_duration_minutes`
4. 生成临时 `request_id='preview-{timestamp}'`，注入 `config.metadata.preview_only=true`
5. 60 s 超时，`POST {SOLVER_V4_URL}/api/v4/solve`（与正式 solve 同一端点，solver 自行识别 preview_only）
6. 返回 `{ success, preview_only:true, data: { mode, request_id, proposal, solver_result } }`
7. `proposal` = `summarizePreview()`：assignments 列表 + 覆盖率指标 + risks 数组
8. **不创建 `scheduling_runs` 记录**，**不写任何生产表**
9. solver 不可达时降级返回 `capability_gap: { code: 'SOLVER_V4_PREVIEW_UNAVAILABLE' }`（不 500）

---

## 八、run history 存储

- 主表：`scheduling_runs`（`id`, `run_code`='V4-{ts}', `status`, `stage`, `window_start`, `window_end`, `solve_start`, `solve_end`, `result_summary` LONGTEXT, `summary_json` JSON, `solver_progress` JSON, `target_batch_ids` JSON, `error_message`, `created_at`, `completed_at`）
- `listRunsV4`：查询 `run_code LIKE 'V4-%' ORDER BY created_at DESC LIMIT 50`，从 `result_summary.metrics.gap/fill_rate/solve_time` 提取展示指标
- 关联表（落库时外键）：
  - `batch_personnel_assignments.scheduling_run_id`
  - `employee_shift_plans.scheduling_run_id`
  - `standalone_task_assignments.scheduling_run_id`
  - `special_shift_occurrence_assignments.scheduling_run_id`
  - `special_shift_occurrences.scheduling_run_id`

---

## 九、关键设计模式速查（V5 实现参考）

### 9.1 scope 快照模式（L1 设计）

```
createRunRecord → summary_json.scope.{is_global, team_ids, batch_ids, employee_ids=null}
triggerSolveAsync（assemble 后） → 补 employee_ids, standalone_task_ids
applySolveResultV4 → 读 scope，决定按 batch/employee/standalone 收窄 delete
```

### 9.2 结果格式双轨兼容

`rawResult.schedules`（新）vs `rawResult.assignments + shift_schedule`（旧）。`getSolveResultV4` 和 `applySolveResultV4` 均通过 `Array.isArray(rawResult.schedules)` 判断分支。

### 9.3 特殊班次全生命周期

```
DataAssemblerV4 → fetchSpecialShiftRequirements（via SpecialShiftWindowService）
→ enrichSpecialShiftRequirements（计算 impact_cost）
→ solver request.special_shift_requirements
→ solver result.special_shift_assignments / special_shift_shortages
→ saveResults → summary_json 存快照
→ applySolveResultV4 → applySpecialShiftCoverage：
    DELETE special_shift_occurrence_assignments
    INSERT special_shift_occurrence_assignments
    UPDATE special_shift_occurrences.status
    UPDATE employee_shift_plans（OVERTIME 类别 / LOCKED 状态）
→ markSpecialShiftOccurrencesScheduled
```

---

## 十、踩坑风险（Risks）

1. **并发无保护**：V4 无 "已有 RUNNING run 时拒绝新 run" 逻辑，多次快速点击会产生多条 run 同时跑。V5 实现时应在 `createSolveTaskV4` 入口加互斥检查。

2. **回调竞态**：`triggerSolveAsync` 的 HTTP fetch 和 `receiveSolveResultV4` callback 可能同时到达，通过 "检查 DB 已是 COMPLETED 则跳过 FAILED" 规避，但这是补丁逻辑。V5 建议用数据库 CAS（状态机原子转移）。

3. **SOLVER_CALLBACK_SECRET 未配置→503**：所有机器回调（progress/result/status）在密钥未配置时返回 503，不是 200。solver 进程需能正确处理非 2xx 降级。若 solver 重试 503 会阻塞。

4. **`solver_progress` JSON_MERGE_PATCH 语义**：进度回调使用 `JSON_MERGE_PATCH`（RFC 7396），若 solver 发送 `"logs": null` 会**删除** logs 字段。V5 确认 solver 端不发送 null 覆盖。

5. **时区陷阱**：`formatLocalDateTime` 直接读 `Date` 对象的本地时间 getter（`getFullYear()`等），非 UTC。若 Node.js 进程 `TZ` 环境变量不是 `+08:00`，时间会错位。V5 应显式锁定 `TZ=Asia/Shanghai`。

6. **`employee_shift_plans` ON DUPLICATE KEY UPDATE 无 `shift_id <=>` 保护**：INSERT 时 unique key 应为 `(employee_id, plan_date)`，但 DB 实际存在时用 `shift_id <=>` 查（`getSolveResultV4` 第 581-589 行）。如果同一天多班次，第二次 UPSERT 会覆盖第一条。

7. **standalone task 负 ID 约定**：`operation_plan_id = -task.id` 是 standalone 的标志，solver 和 apply 都依赖这个约定。V5 必须保持，或迁移为 `source_type` 字段判断。

8. **`listRunsV4` 硬限 50 条**：前端 run history 只能看到 50 条。如果需要分页，V5 应加 `LIMIT/OFFSET` 参数。

9. **`summary_json` 浅合并风险**：`updateRunSummary` 用 `{...current, ...patch}` 浅合并，如果 `patch.scope` 是完整对象但忘记展开现有 scope（`...existingScope`），会丢失已有 scope 字段。`orchestrator` 第 103-113 行通过 `getRunSummary` 读取后展开，逻辑正确但繁琐。

10. **`fetchHistoricalShifts` 只回溯固定天数**：连续工作天数的统计从 `historyEndDate` 往前扫，但如果员工在回溯窗口外还有更长的连续工作段，会被截断为 0（`for` 循环遇到第一个 REST 就 break，若回溯窗口起点前有 REST 则无法感知更前的 WORK）。V5 如需精确，应扩大回溯或改为数据库级计算。

11. **`apply` 事务中的 UPSERT 静默跳过失败**：assignments 写入循环（第 464-518 行）用 try/catch，失败只 `console.warn`，不回滚事务。若某条 assignment 写入失败，事务仍会 commit，导致结果不完整。V5 建议明确决定是否将单条失败视为整体失败。

12. **feature flags 影响资源需求读取**：`ENABLE_BATCH_RESOURCE_SNAPSHOTS` + `ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ` 同时为 true 时才读快照表 `batch_operation_resource_requirements`，否则只读模板级 `operation_resource_requirements`。两个 flag 需同时配置，V5 迁移时注意。
