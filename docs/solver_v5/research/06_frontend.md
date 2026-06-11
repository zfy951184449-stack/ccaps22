# 前端 V4 求解器界面精读报告

> 面向：将从零实现 V5 求解器界面的工程师  
> 精读时间：2026-06-11  
> 精读范围：SolverV4 前端完整界面层

---

## 目录

1. [路由注册与入口](#1-路由注册与入口)
2. [用户完整操作流](#2-用户完整操作流)
3. [MonthlyBatchSelector — 主页面](#3-monthlybatchselector--主页面)
4. [OperationReviewModal — 操作审查弹窗](#4-operationreviewmodal--操作审查弹窗)
5. [SolverConfigurationModal — 求解器配置弹窗](#5-solverconfigurationmodal--求解器配置弹窗)
6. [SolveProgressV4Modal — 进度弹窗与 SSE 消费](#6-solveprogressive4modal--进度弹窗与-sse-消费)
7. [SolveResultV4Page — 排班结果全屏抽屉](#7-solveresultv4page--排班结果全屏抽屉)
8. [子组件：ScheduleMatrix](#8-子组件-schedulematrix)
9. [子组件：AssignmentsView](#9-子组件-assignmentsview)
10. [RunHistoryTab — 历史记录](#10-runhistorytab--历史记录)
11. [IntervalSolveTab — 区间求解](#11-intervalsolvetab--区间求解)
12. [StandingDutyTab — 值班任务](#12-standingtdutytab--值班任务)
13. [API 调用清单](#13-api-调用清单)
14. [wxb-ui 组件清单与设计规范](#14-wxb-ui-组件清单与设计规范)
15. [UI 风格基调与布局说明](#15-ui-风格基调与布局说明)
16. [V5 设计建议与坑点](#16-v5-设计建议与坑点)

---

## 1. 路由注册与入口

**文件：** `frontend/src/App.tsx:220-226`

```
路径: /solver-v4
权限守卫: SOLVER_RUN_READ
组件: SolverV4Page
```

多个旧路径通过 `mvpRedirects`（`App.tsx:47-65`）重定向到 `/solver-v4`：

| 旧路径 | 重定向到 |
|---|---|
| `/auto-scheduling` | `/solver-v4` |
| `/modular-scheduling` | `/solver-v4` |
| `/scheduling-v3` | `/solver-v4` |
| `/platform-run-monitor` | `/solver-v4` |
| `/auto-scheduling-debug` | `/solver-v4` |

**页面文件：** `frontend/src/pages/SolverV4Page.tsx`（极薄，仅 13 行）

```tsx
// SolverV4Page.tsx:5-9
const SolverV4Page: React.FC = () => (
    <div className="solver-v4-page">
        <MonthlyBatchSelector />
    </div>
);
```

真正的业务逻辑全部在 `MonthlyBatchSelector` 组件里。

---

## 2. 用户完整操作流

```
[导航] /solver-v4
    │
    ▼
[MonthlyBatchSelector] ← WxbPageShell + WxbTabs (4 个 tab)
    │
    ├─── Tab: 批次列表 ─── 选月份 + 选部门 → WxbDataTable 多选批次
    │         │
    │         ▼
    │    WxbBulkActionBar "排班选中批次" 按钮
    │         │
    │         ▼
    │    [OperationReviewModal] 审查操作 (900px 弹窗)
    │         ├── 点 "预检" → POST /api/v4/scheduling/precheck → 显示 pass/warn/error
    │         └── 点 "确认并排班" → POST /api/v4/scheduling/solve → 得到 runId
    │                   │
    │                   ▼
    │         [SolveProgressV4Modal] 进度弹窗 (700px, 固定居中)
    │              - EventSource /api/v4/scheduling/runs/{runId}/progress
    │              - 展示进度条 + KPI 卡 + 实时日志面板
    │              - 按钮：停止排班 / 应用排班结果 / 查看结果
    │                   │
    │                   ▼
    │         [SolveResultV4Page] 全屏抽屉 (100vw, 从右滑入)
    │              - 顶部 KPI 横排
    │              - tab: 排班矩阵 | 操作分配明细
    │              - 可人工编辑班次 / 操作分配
    │              - 按钮：导出 Excel/PDF / 应用排班
    │
    ├─── Tab: 区间求解 ── [IntervalSolveTab] 选区间+批次 → 同 solve 流程
    │
    ├─── Tab: 值班任务 ── [StandingDutyTab] 管理 RECURRING 模板 + 本月任务
    │
    └─── Tab: 历史记录 ── [RunHistoryTab] 查看历史 run，可重新打开结果页
```

右上角"高级配置"按钮（`MonthlyBatchSelector.tsx:255-259`）打开 `SolverConfigurationModal`，配置储存在 `MonthlyBatchSelector` state 中，下发给 `OperationReviewModal.solverConfig` 和 `IntervalSolveTab.solverConfig`。

---

## 3. MonthlyBatchSelector — 主页面

**文件：** `frontend/src/components/SolverV4/MonthlyBatchSelector.tsx`

### 状态

| state | 类型 | 说明 |
|---|---|---|
| `selectedMonth` | `Dayjs` | 默认当前月 |
| `data` | `BatchPlan[]` | 当月批次列表 |
| `selectedRowKeys` | `React.Key[]` | 已勾选的批次 ID |
| `solverConfig` | `SolverConfig` | 求解器全局配置，默认 `DEFAULT_SOLVER_CONFIG` |
| `selectedDepartment` | `DepartmentFilterValue` | 部门筛选，影响 `solverConfig.team_ids` |
| `progressVis/resultVis/currentRunId` | bool/number | 进度弹窗和结果抽屉的显示状态 |

### BatchPlan 数据结构

```ts
// MonthlyBatchSelector.tsx:34-44
interface BatchPlan {
    id: number;
    batch_code: string;
    template_name: string;  // 产品名
    team_id?: number;
    team_name?: string;
    team_code?: string;
    plan_status: string;     // ACTIVATED / COMPLETED / PENDING 等
    planned_start_date: string;
    planned_end_date: string;
}
```

### 部门筛选与配置联动

`handleDepartmentChange`（第 134-147 行）将部门 ID 同步写入 `solverConfig.team_ids`。反向：`handleConfigClose`（第 150-156 行）从 `solverConfig.team_ids` 反同步到 `selectedDepartment`。

### batchSelection 工具（`batchSelection.ts`）

- `filterBatchesByDepartment(data, dept)` — 按 `team_id` 过滤
- `getDefaultSelectedBatchIds(data, dept)` — 自动勾选 `ACTIVATED` 状态的批次
- `getVisibleSelectedBatchIds(keys, filtered)` — 仅返回当前可见行里已选的 key

---

## 4. OperationReviewModal — 操作审查弹窗

**文件：** `frontend/src/components/SolverV4/OperationReviewModal.tsx`

宽度 900px，标题「审查待排班操作 - YYYY年MM月」。

### Props

```ts
interface OperationReviewModalProps {
    visible: boolean;
    batchIds: number[];
    month: Dayjs;
    onSuccess: (runId: number) => void;
    solverConfig?: SolverConfig;   // 从外部传入
}
```

### 核心数据结构

```ts
// OperationReviewModal.tsx:17-41
interface PositionRequirement {
    position_number: number;
    available_count: number;     // 合格候选人数量
    total_count: number;
    qualifications: {
        qualification_name: string;
        required_level: number;
        is_mandatory: boolean;
    }[];
}
interface OperationOperation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    required_people: number;
    status: string;              // READY / LOCKED / PENDING
    share_group_name?: string;
    share_group_code?: string;
    share_group_ids?: string;    // 用于分组展示
    positions: PositionRequirement[];
}
```

### API 调用

1. **加载操作列表：** `POST /api/calendar/batch-operations`  
   Body: `{ batch_ids, start_date, end_date }`

2. **预检：** `POST /api/v4/scheduling/precheck`  
   Body: `{ batch_ids, start_date, end_date, config: SolverConfig }`  
   返回: `{ status: 'PASS'|'WARNING'|'ERROR', checks: [{name, status, message}[]] }`

3. **启动求解：** `POST /api/v4/scheduling/solve`  
   Body: `{ batch_ids, start_date, end_date, config: SolverConfig }`  
   返回: `{ success: boolean, data: { id: number, runId: number } }`

### 分组展示逻辑

操作按 `share_group_ids` 字段分组（第 271-292 行）：
- `share_group_ids` 存在 → 归入共享组，显示标题「共享组：{name}」
- 无 `share_group_ids` → 列入「独立操作」

### 岗位标签颜色

```ts
// OperationReviewModal.tsx:227-235
if (available === 0) color = 'red';
else if (available <= 3) color = 'amber';
else color = 'green';     // >= 4
```

点击标签 → 弹出 `QualifiedPersonnelModal`，调用 `GET /api/calendar/operations/{id}/recommended-personnel?position_number={n}`。

---

## 5. SolverConfigurationModal — 求解器配置弹窗

**文件：** `frontend/src/components/SolverV4/SolverConfigurationModal.tsx`

宽度 640px，配置保存在父组件 state，不写入后端（仅在触发求解时作为 `config` 字段一次性传给 `/api/v4/scheduling/solve`）。

### SolverConfig 完整字段（87 个字段）

```ts
export interface SolverConfig {
    // ── 硬约束开关 ──
    enable_share_group: boolean;           // 共享组约束
    enable_unique_employee: boolean;       // 人员唯一性
    enable_one_position: boolean;          // 一人一岗
    enable_locked_operations: boolean;     // 保留锁定操作
    enable_locked_shifts: boolean;         // 保留锁定班次
    strict_locked_shifts: boolean;         // └ 严格模式（子项）
    enable_shift_assignment: boolean;      // 班次分配规则
    enable_max_consecutive_work_days: boolean;
    enable_max_consecutive_rest_days: boolean;
    enable_standard_hours: boolean;
    enable_night_rest: boolean;
    enable_no_isolated_night_shift: boolean;
    enable_night_shift_interval: boolean;
    enable_balance_night_shifts: boolean;
    enable_prefer_standard_shift: boolean;
    enable_consecutive_work_rest_pattern: boolean; // 高级：上班休息节奏约束
    min_consecutive_work_days_pattern: number;
    max_consecutive_work_days_pattern: number;
    min_consecutive_rest_days_pattern: number;
    max_consecutive_rest_days_pattern: number;
    enable_leadership_coverage: boolean;
    enable_leader_production_coverage: boolean;    // └ 子项

    // ── 参数 ──
    max_consecutive_rest_days: number;       // 默认 4
    min_night_shift_interval: number;        // 默认 7
    min_rest_after_night_block: number;      // 默认 2

    // ── 优化目标 ──
    enable_minimize_deviation: boolean;
    objective_weight_deviation: number;      // 默认 1
    enable_minimize_special_shifts: boolean;
    objective_weight_special_shifts: number; // 默认 100
    objective_weight_night_balance: number;  // 默认 5
    enable_balance_weekend_work: boolean;
    objective_weight_weekend_balance: number;// 默认 5
    enable_minimize_triple_salary: boolean;
    objective_weight_triple_salary: number;  // 默认 10

    // ── 夜班延长休息（软） ──
    enable_prefer_extended_night_rest: boolean; // 默认 true
    preferred_night_rest_days: number;       // 默认 2
    objective_weight_night_rest_extend: number; // 默认 15

    // ── 空缺 ──
    allow_position_vacancy: boolean;         // 默认 false
    objective_weight_vacancy: number;        // 默认 10000
    off_hours_multiplier: number;            // 默认 1.5

    // ── 独立任务 ──
    enable_standalone_tasks: boolean;        // 默认 true
    allow_standalone_vacancy: boolean;       // 默认 true
    objective_weight_standalone_vacancy: number; // 默认 5000

    // ── 领导层约束 ──
    enable_leadership_coverage: boolean;     // 默认 true
    enable_leader_production_coverage: boolean; // 默认 true
    leader_ops_policy_group_leader: LeaderOpsPolicy; // 默认 'soft'
    leader_ops_policy_team_leader: LeaderOpsPolicy;  // 默认 'ban'
    leader_ops_policy_dept_manager: LeaderOpsPolicy; // 默认 'ban'
    objective_weight_leader_nonworkday: number; // 默认 20
    objective_weight_leader_workday_rest: number; // 默认 10
    objective_weight_leader_ops: number;     // 默认 30
    objective_weight_leader_special: number; // 默认 50

    // ── 团队范围 ──
    team_ids?: number[];                     // 空 = 全部团队

    // ── 时间控制 ──
    max_time_seconds: number;                // 默认 300
    stagnation_limit: number;                // 默认 300
}
```

`LeaderOpsPolicy = 'allow' | 'soft' | 'ban'`

### 配置面板分区

1. **团队范围** — `WxbSelect mode="multiple"`，从 `GET /api/organization/solver-teams` 加载
2. **求解参数** — `max_time_seconds`（30-3600s）、`stagnation_limit`（30-3600s）
3. **硬约束** 分隔线（`WxbDivider label="硬约束"`）
4. 领导层子面板（条件渲染：`enable_leadership_coverage` 为 true 时展开）
5. **连续天数约束** 分隔线
6. **夜班约束** 分隔线
7. 夜班间隔子面板（`enable_night_shift_interval` 为 true 时展开）
8. 夜班延长休息子面板（两个条件同时满足时展开）
9. 上班/休息节奏约束子面板（`enable_consecutive_work_rest_pattern` 为 true 时展开）
10. **独立任务** 分隔线
11. **优化目标** 分隔线 — 每行包含名称+描述+权重输入+开关

### 子项禁用逻辑

```ts
// SolverConfigurationModal.tsx:316-318
const isToggleDisabled = (key) =>
    (key === 'strict_locked_shifts' && !config.enable_locked_shifts) ||
    (key === 'enable_prefer_extended_night_rest' && !config.enable_night_rest) ||
    (key === 'enable_leader_production_coverage' && !config.enable_leadership_coverage);
```

---

## 6. SolveProgressV4Modal — 进度弹窗与 SSE 消费

**文件：** `frontend/src/components/SolverV4/SolveProgressV4Modal.tsx`

宽度 700px，居中，`maskClosable={false}`。

### SSE 连接

```ts
// SolveProgressV4Modal.tsx:83
const evtSource = new EventSource(`/api/v4/scheduling/runs/${id}/progress`);
// 后端使用命名事件 'progress'，必须用 addEventListener：
evtSource.addEventListener('progress', handleMessage); // 第 161 行
evtSource.onmessage = handleMessage;  // 兜底
```

### SSE 事件数据结构

```ts
{
    status: 'INIT' | 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'APPLIED' | 'FAILED',
    solver_progress?: {
        progress: number,      // 0-100
        metrics?: {
            assigned_count: number,
        },
        // 新格式：
        logs_full?: [{
            time: string,
            message: string,
            level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
            category?: 'GENERAL' | 'CONSTRAINT' | 'CONFLICT' | 'SOLVER' | 'PROGRESS'
        }],
        // 旧格式（兼容）：
        logs?: string[]
    }
}
```

注意：`stripLogIcons`（第 36 行）会剥除所有 emoji，与系统规范一致（禁止 emoji）。

### 终止状态判断

```ts
// SolveProgressV4Modal.tsx:53
const isTerminalStatus = (v) => ['COMPLETED', 'APPLIED', 'FAILED'].includes(v);
```

终止状态后 `EventSource.close()` 自动关闭，不会泄漏。

### 状态与按钮逻辑

| 状态 | 进度颜色 | Tag 颜色 | 可操作 |
|---|---|---|---|
| RUNNING | normal (蓝) | blue | 停止排班 |
| STOPPING | normal | amber | 无（等待） |
| COMPLETED | success (绿) | green | 应用结果 + 查看结果 |
| APPLIED | success | green | 已应用（禁用） |
| FAILED | error (红) | red | 若有 assigned > 0 仍可应用 |

### 应用接口

```ts
// SolveProgressV4Modal.tsx:195
POST /api/v4/scheduling/runs/${runId}/apply
// 响应字段：
data.batch_assignments_inserted
data.standalone_assignments_inserted
data.shift_plans_inserted
data.shift_plans_reused
data.locked_assignments_skipped
data.locked_shift_conflicts
```

### 展示内容

1. `WxbProgress` 进度条（`percent`、`status`）
2. 2 格 KPI：「已分配班次」(`metrics.assigned`) / 「已用时」(`metrics.elapsed`)
3. 实时日志面板（`height: 250px`，`overflow-y: auto`，等宽字体，自动滚底）
   - 格式：`[time] [category] message`
   - 颜色：INFO 默认 / SUCCESS 绿 / WARNING 橙 / ERROR 红

---

## 7. SolveResultV4Page — 排班结果全屏抽屉

**文件：** `frontend/src/components/SolverV4/SolveResultV4Page.tsx`

使用 Ant Design `Drawer`，`width="100vw"`，`placement="right"`，`destroyOnClose`。注意：**此组件未切换到 wxb-ui Drawer**，标题区按钮是手写 `<button className="v4-btn">` 而非 `WxbButton`（历史遗留，V5 应统一）。

### ResultData 结构

```ts
interface ResultData {
    metrics: {
        completion_rate: number;  // 0-100
        coverage_rate: number;
        satisfaction: number;
        solve_time: number;       // 秒
    };
    details: {
        total_positions: number;
        assigned_positions: number;
        total_operations: number;
        covered_operations: number;
    };
    assignments: any[];          // 操作分配记录（旧格式）
    shift_assignments?: any[];   // 员工班次分配
    operations?: any[];          // 带 positions[] 的操作详情
    calendar_days?: { date: string; is_workday: boolean }[];
    standard_hours?: number;
    precheck_results?: {
        status: 'PASS' | 'WARNING' | 'ERROR';
        checks: { name: string; status: string; message: string; details?: any[] }[];
    };
}
```

### API 调用

```
GET /api/v4/scheduling/runs/{runId}/result   → ResultData
GET /api/v4/scheduling/runs/{runId}/status   → { status: string }
POST /api/v4/scheduling/runs/{runId}/apply
```

### KPI 横排（前端实时计算）

```ts
// SolveResultV4Page.tsx:206-268
{
    completion_rate,   // 来自 data.metrics
    coverage_rate,
    balanceIndex,      // 前端计算：(weekendBal + nightBal) / 2
    employeeCount,     // shift_assignments 里唯一 employee_id 数
    qualityScore,      // = 0.3×completion + 0.2×coverage + 0.2×balance + 0.15×nightBal + 0.15×weekendBal
    standaloneTotal,   // operations 里 batch_code==='STANDALONE' 的数量
    standaloneAssigned,
    uncoveredOps,      // operations status==='UNASSIGNED'
    partialOps,        // operations status==='PARTIAL'
}
```

`balanceIndex` 使用变异系数（CV）计算均衡度：`score = (1 - CV) * 100`。

### 双 Tab 视图

```ts
// SolveResultV4Page.tsx:101
const [activeTab, setActiveTab] = useState<'matrix' | 'assignments'>('matrix');
```

- **排班矩阵**（`ScheduleMatrix` 子组件）：员工×日期格子，可点击编辑班次
- **操作分配明细**（`AssignmentsView` 子组件）：Master-Detail 布局，可手工改派

### 人工编辑与撤销

`editHistory: EditHistoryEntry[]` 记录所有操作：

```ts
// SolveResultV4Page.tsx:66-79
interface EditHistoryEntry {
    type: 'SHIFT' | 'ASSIGNMENT';
    employee_id; employee_name; date;
    oldShift?; newShift?;             // 班次变更
    operation_plan_id?; operation_name?; position_number?;
    action?: 'ASSIGN' | 'UNASSIGN' | 'REASSIGN';
    oldEmployee?; newEmployee?;        // 操作派工变更
}
```

- `handleUndo`：撤销最后一步，逐项恢复 `shift_assignments` 或 `operations`
- `handleResetAll`：全量恢复到 `originalData`（fetch 时深拷贝保存）
- 编辑未应用时"应用排班"按钮上显示 `+N改` 橙色徽标

### 预检告警栏

`data.precheck_results` 有问题时，在 KPI 横排上方出现彩色横条：
- WARNING：黄底橙字（`#fff8e1`）
- ERROR：红底深红字（`#fde8e8`）
- 支持展开/收起明细

### 导出功能

```
导出 Excel → exportV4ScheduleToExcel(data, runId)  // frontend/src/utils/exportScheduleExcel.ts
导出 PDF   → exportV4ScheduleToPdf(data, runId)    // frontend/src/utils/exportSchedulePdf.ts
```

---

## 8. 子组件：ScheduleMatrix

**文件：** `frontend/src/components/SolverV4/components/ScheduleMatrix.tsx`

使用 `react-window` 的 `FixedSizeList` 进行虚拟化渲染，配置常量：

```ts
HEADER_HEIGHT = 44
ROW_HEIGHT = 24       // 极紧凑
SIDEBAR_WIDTH = 140
STAT_WIDTH = 80
```

模式切换：`'shift'`（班次视图）/ `'operation'`（操作视图）。

班次单元格颜色规则（复用 PersonnelScheduleTable）：
- 夜班（shift_name 含"夜"或"night"）→ `bg-red-600 text-white`
- 长白班（含"长白"或"long"）→ `bg-blue-600 text-white`
- 其他有工时班次 → `bg-emerald-600 text-white`
- 休息 / 0 工时 → `bg-gray-50 text-gray-300`

每行末尾显示统计：`totalHours`、`nightCount`、`weekendCount`。  
点击单元格 → 触发 `onEditShift`，父组件弹出 `ManualEditDrawer`。

---

## 9. 子组件：AssignmentsView

**文件：** `frontend/src/components/SolverV4/views/AssignmentsView.tsx`

Master-Detail 双栏布局（`.asgn-master-detail`）：
- 左栏（38%）：操作列表，按 UNASSIGNED/PARTIAL/COMPLETE 分组，支持搜索过滤
- 右栏（62%）：所选操作的岗位明细，每个 position 显示已分配人员 + 操作按钮

候选人分三级（`CandidateTier`）：
- `RECOMMENDED`：当前班次就是操作所需班次，直接可用
- `NEEDS_SHIFT_CHANGE`：需要改班次才能参与
- `RESTING`：当天休息，需要改排班

KPI 卡点击可从外部注入过滤信号（`externalFilter` prop，含 nonce 防重复）。

---

## 10. RunHistoryTab — 历史记录

**文件：** `frontend/src/components/SolverV4/RunHistoryTab.tsx`

表格列：运行编号 / 求解质量 / 时间窗口 / 岗位填充率 / 求解耗时 / 创建时间（默认降序）/ 操作。

`SolverQualityTag` 组件展示逻辑：

```ts
// RunHistoryTab.tsx:24-63
QUEUED/RUNNING → "求解中" (blue)
APPLIED        → "已应用" (green)
OPTIMAL        → "最优解" (green)
FEASIBLE       → "可行解 (Gap X%)" (amber, with Tooltip)
INFEASIBLE     → "无解" (red)
FAILED (无 solver_status) → "无解" (red)
```

```ts
interface RunRecord {
    id; run_code; status; stage;
    solver_status: 'OPTIMAL' | 'FEASIBLE' | 'FEASIBLE (Forced)' | 'INFEASIBLE' | null;
    gap: number | null;     // 与最优解的差距百分比
    fill_rate: number | null;
    solve_time: number | null;
    window_start; window_end; created_at; completed_at;
}
```

API: `GET /api/v4/scheduling/runs` → `{ success: boolean, data: RunRecord[] }`

---

## 11. IntervalSolveTab — 区间求解

**文件：** `frontend/src/components/SolverV4/IntervalSolveTab.tsx`

区别于月度批次求解，多了 `solve_start_date` / `solve_end_date` 字段：

```ts
// IntervalSolveTab.tsx:183-193
POST /api/v4/scheduling/solve {
    batch_ids,
    start_date: monthStart,    // 月份开始（用于加载上下文）
    end_date: monthEnd,
    solve_start_date: solveStart,   // 实际求解区间
    solve_end_date: solveEnd,
    config: SolverConfig,
}
```

区间外已有排班数据「冻结」（由后端/求解器负责，前端仅展示摘要），约束验证仍用整月范围。  
`WxbRangePicker` 限制只能选当前月内日期（`disabledDate` 回调）。

---

## 12. StandingDutyTab — 值班任务

**文件：** `frontend/src/components/SolverV4/StandingDutyTab.tsx`（1566 行，最复杂）

### 任务类型

```ts
type: 'RECURRING' | 'FLEXIBLE' | 'AD_HOC'
// RECURRING = 周期模板（只有模板，不直接参与排班）
// FLEXIBLE  = 从 RECURRING 生成的本月实例
// AD_HOC    = 临时任务（手工直接创建）
```

### 生成逻辑

`POST /api/standalone-tasks/generate-recurring { target_month: 'YYYY-MM' }` 将 RECURRING 模板展开为当月 FLEXIBLE 实例。

`isGeneratedRecurringTask` 识别规则：`task_type === 'FLEXIBLE' && taskName ends with (YYYY-MM-DD)`（第 79 行正则）。

### recurrence_rule JSON 结构

```ts
// DAILY: { freq: 'DAILY', interval: N }
// WEEKLY: { freq: 'WEEKLY', interval: N, weekdays: number[] }  // 1=周一..7=周日
// MONTHLY-固定日期: { freq: 'MONTHLY', monthly_mode: 'MONTH_DAYS', month_days: number[] }
// MONTHLY-第几个周几: { freq: 'MONTHLY', monthly_mode: 'NTH_WEEKDAY', nth_week: N, nth_weekday: N }
// MONTHLY-最后一天: { freq: 'MONTHLY', monthly_mode: 'LAST_DAY' }
// 所有模式共有: window_days (弹性窗口天数)
```

### AD_HOC 特殊逻辑

- `preferred_shift_ids` 为单选（非多选）
- 选择班次后自动填入 `ad_hoc_start_time` / `ad_hoc_end_time`
- `duration_minutes` 由日期×时间自动计算，锁定不可手输
- `earliest_start` / `deadline` 为完整 `datetime`

### RECURRING 模板 deadline

固定写死为 `'2099-12-31'`（第 815 行），保持模板长期有效。

### API 清单

```
GET    /api/standalone-tasks?type=RECURRING           模板列表
GET    /api/standalone-tasks?window_start=&window_end=  本月实例
GET    /api/standalone-tasks/{id}                      单条详情
POST   /api/standalone-tasks                           创建
PUT    /api/standalone-tasks/{id}                      更新
DELETE /api/standalone-tasks/{id}                      删除
POST   /api/standalone-tasks/generate-recurring { target_month }
POST   /api/standalone-tasks/{id}/delete-instances [{ target_month }]
POST   /api/standalone-tasks/batch-delete { ids }
```

---

## 13. API 调用清单

V4 求解器相关 API 全部通过 `fetch` 裸调用（未封装到 `services/`），使用相对路径：

| 方法 | 路径 | 调用位置 | 说明 |
|---|---|---|---|
| GET | `/api/batch-plans?start_date=&end_date=` | MonthlyBatchSelector / IntervalSolveTab | 当月批次列表 |
| GET | `/api/organization/solver-teams` | MonthlyBatchSelector / SolverConfigurationModal / IntervalSolveTab | 团队列表 |
| POST | `/api/calendar/batch-operations` | OperationReviewModal | 批次操作详情 |
| GET | `/api/calendar/operations/{id}/recommended-personnel?position_number=` | QualifiedPersonnelModal | 合格人员 |
| POST | `/api/v4/scheduling/precheck` | OperationReviewModal / IntervalSolveTab | 预检 |
| POST | `/api/v4/scheduling/solve` | OperationReviewModal / IntervalSolveTab | 启动求解 |
| GET (SSE) | `/api/v4/scheduling/runs/{id}/progress` | SolveProgressV4Modal | 实时进度 |
| POST | `/api/v4/scheduling/runs/{id}/stop` | SolveProgressV4Modal | 终止求解 |
| POST | `/api/v4/scheduling/runs/{id}/apply` | SolveProgressV4Modal / SolveResultV4Page | 应用结果 |
| GET | `/api/v4/scheduling/runs/{id}/result` | SolveResultV4Page | 拉取结果 |
| GET | `/api/v4/scheduling/runs/{id}/status` | SolveResultV4Page | 运行状态 |
| GET | `/api/v4/scheduling/runs` | RunHistoryTab | 历史记录 |
| GET | `/api/shift-definitions` | StandingDutyTab | 班次定义列表 |
| GET | `/api/employees` | StandingDutyTab | 员工列表 |
| GET | `/api/qualifications` | StandingDutyTab | 资质列表 |
| (standalone-tasks 系列) | 见上节 | StandingDutyTab | 值班任务 CRUD |

**注意：** 无集中 service 文件，V4 的所有 API 直接分散在各组件里。V5 应把 API 调用集中到 `frontend/src/services/schedulingV5Api.ts`。

---

## 14. wxb-ui 组件清单与设计规范

**文件：** `frontend/src/components/wxb-ui/index.ts`

### 组件清单

| 分类 | 组件名 | 主要用途 |
|---|---|---|
| 核心 | `WxbButton` | 所有按钮，variant: `primary/secondary/ghost/danger/text` |
| 核心 | `WxbCard` | 卡片容器，prop `noPadding` |
| 核心 | `WxbIcon` | SVG 图标，props: `name: string, size: number`，**禁止 emoji** |
| 核心 | `WxbModal` | 弹窗（替代 antd Modal），宽度 280px→900px 均有用到 |
| 核心 | `WxbKpiCard` | KPI 数字卡片，props: `title, value`，支持子节点图标 |
| 核心 | `WxbPageShell` | 页面容器，prop: `size: 'full'`, `gap: 'md'` |
| 核心 | `WxbPageHeader` | 页头，props: `eyebrow, title, description, actions` |
| 核心 | `WxbFilterBar` | 筛选栏，props: `resultCount, resultLabel, filters, actions` |
| 核心 | `WxbBulkActionBar` | 批量操作栏（表格底部），`selectedCount, onClear, actions[]` |
| 核心 | `WxbDivider` | 分隔线，prop `label` (带文字)，`direction: 'vertical'` |
| 核心 | `WxbSwitch` | 开关，props: `checked, onChange, disabled` |
| 表单 | `WxbSelect` | 下拉选择，`mode="multiple"` 支持多选 |
| 表单 | `WxbDatePicker` | 日期选择，`picker="month"` 支持月份选择 |
| 表单 | `WxbRangePicker` | 日期范围选择 |
| 表单 | `WxbTimePicker` | 时间选择 |
| 表单 | `WxbInputNumber` | 数字输入，`addonAfter, min, max, step` |
| 表单 | `WxbInput` | 文本输入 |
| 表单 | `WxbCheckbox` | 复选框 |
| 表单 | `WxbRadioGroup` | 单选组，`options[]` |
| 数据展示 | `WxbDataTable<T>` | 数据表格，props: `columns, dataSource, rowKey, rowSelection, density: 'compact'/'standard', emptyState, pagination` |
| 数据展示 | `WxbTag` | 状态标签，`color: 'blue'/'green'/'amber'/'red'/'neutral'` |
| 数据展示 | `WxbTooltip` | 气泡提示，`title` |
| 数据展示 | `WxbEmpty` | 空状态，`description, action` |
| 导航 | `WxbTabs` | 选项卡，`items: [{ key, label, children }]` |
| 导航 | `WxbSegmented` | 分段控件，`size: 'sm'`, `options[], value, onChange` |
| 反馈 | `WxbDrawer` | 侧边抽屉（wxb-ui 版本，结果页未使用） |
| 反馈 | `WxbPopconfirm` | 确认气泡，`title, description, okText, cancelText, onConfirm` |
| 反馈 | `WxbProgress` | 进度条，`percent, status: 'normal'/'success'/'error'` |
| 反馈 | `WxbSpinner` | 加载指示 |
| 反馈 | `WxbCollapse` | 可折叠面板，`items: [{ key, label, children }]` |

### 主题 token（`frontend/src/styles/wxb-theme.css`）

#### 颜色规范（仅亮色主题）

```css
/* 品牌蓝 */
--wx-blue-700: #0B3D7F;   /* WuXi Blue 主色 */
--wx-blue-500: #1F6FEB;   /* 交互蓝 */
--wx-blue-100: #E6F2FB;   /* 信息背景 */
--wx-blue-50:  #F2F7FC;

/* 语义色 */
--wx-green-500: #2E9D6E;  /* success */
--wx-amber-500: #E8B53C;  /* warning */
--wx-red-500:   #D6493A;  /* error/danger */

/* 中性 */
--wx-fg-1: #0F1B2D;      /* 主文字 */
--wx-fg-2: #3A4A5C;
--wx-fg-3: #5A6B7E;      /* 次要文字 */
--wx-fg-4: #8898A8;      /* 占位/禁用 */
--wx-bg:   #FFFFFF;
--wx-surface-1: #FAFCFE;
--wx-surface-2: #F5F8FB;
--wx-border: #E4EAF1;
```

#### 字体

```css
--wx-font-sans: "Inter", "PingFang SC", "Source Han Sans SC", system-ui, sans-serif;
--wx-font-mono: "JetBrains Mono", "SF Mono", monospace;
```

#### 间距

```
--wx-space-4/8/12/16/20/24/32/48/64
```

#### 圆角

```
--wx-radius-4/6/8/12
```

### 必须遵守的设计规则

1. **禁止 emoji 作图标** — 只用 `WxbIcon name="..."` 或 inline SVG
2. **禁止硬编码颜色** — 颜色一律用 CSS 变量 `var(--wx-*)`
3. **白色主题只** — 无暗黑模式支持
4. **禁止硬编码 API host** — 只用 `/api/...` 相对路径
5. **API 调用集中在 `services/`** — 不要在组件内散写 raw `fetch`
6. **使用 `WxbButton`** 而非裸 `<button>`（结果页有违例，V5 需修正）

---

## 15. UI 风格基调与布局说明

### 整体感受

Apple HIG 风格的白色轻量 SaaS 界面：
- 背景：`#F5F8FB`（App.tsx 的 main-layout）
- 卡片：白色 + 小阴影 `0 1px 2px rgba(15,27,45,0.04)`
- 主色：深海蓝 `#0B3D7F`（WuXi 企业色）

### 主页面布局（`/solver-v4`）

```
┌─────────────────────────────────────────────────────┐
│ WxbPageHeader: eyebrow "Solver V4" / title "排班调度" │
│ actions: [高级配置 按钮]                               │
├─────────────────────────────────────────────────────┤
│ WxbCard (noPadding) 内嵌 WxbTabs                     │
│  ┌─ 批次列表 ─┬─ 区间求解 ─┬─ 值班任务 ─┬─ 历史记录 ─┐ │
│  │ WxbFilterBar               部门选 + 月份选          │ │
│  │ WxbDataTable [多选] 批次列表                        │ │
│  │ WxbBulkActionBar [排班选中批次]                     │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### OperationReviewModal（900px）

```
标题行
信息提示条（蓝底：保留锁定数据说明）
统计行：已选N批次 | 总M操作 | 总K岗位
预检结果面板（条件渲染，绿/黄/红背景）
操作分组列表（共享组 + 独立操作，每组一个 WxbDataTable）
footer: [取消] [预检] [确认并排班]
```

### SolveProgressV4Modal（700px，居中）

```
header: "自动排班进度"  [status WxbTag]
WxbProgress 进度条
KPI grid 2列: [已分配班次] [已用时]
"实时日志" 标题
日志面板（等宽字体，250px 高，自动滚底）
footer: [关闭] -- [停止排班] [应用排班结果] [查看结果]
```

### SolveResultV4Page（100vw 全屏抽屉）

```
Drawer header:
  [←] 排班结果 #N  2024-01-01~2024-01-31  求解Xs
  [导出↓] [应用排班 +N改]
预检告警横条（条件渲染）
KPI横排（行内 flex，7项）:
  完成率% | 覆盖度% | 均衡指数% | 参与N人 | 质量分/100 | 未覆盖N | 独立任务N/M
视图切换 pill: [排班矩阵] [操作分配明细 N]
--- 矩阵视图 ---
  ScheduleMatrix (react-window, 行高24px)
  编辑统计栏（条件渲染）
--- 操作视图 ---
  AssignmentsView (Master-Detail)
```

### 色彩语义

| 颜色 | `WxbTag color` | 语义 |
|---|---|---|
| 蓝 | `blue` | 进行中/信息 |
| 绿 | `green` | 完成/成功/已应用 |
| 橙/琥珀 | `amber` | 警告/PENDING |
| 红 | `red` | 错误/未分配/已取消 |
| 中性 | `neutral` | 默认/未知 |

---

## 16. V5 设计建议与坑点

### A. 必须修复的遗留问题（V5 起点清单）

1. **`SolveResultV4Page` 未使用 wxb-ui Drawer** — 仍用 Ant Design `Drawer` + 手写 `<button className="v4-btn">`，V5 应全部换成 `WxbDrawer` + `WxbButton`
2. **CSS 中仍有少量 hardcoded hex**（`v4-kpi-value[data-color="green"]` → `#2e7d32` 等）— V5 应改为 CSS 变量
3. **API 调用无集中 service** — 全部 `fetch` 散落在组件中，V5 需建 `schedulingV5Api.ts`
4. **precheck_results 返回值前端没完整利用** — `details` 字段有但界面只展示 `message`

### B. SSE 消费关键点

- 后端发命名事件 `progress`，前端**必须**用 `addEventListener('progress', ...)` 而非仅 `onmessage`（已注释在 SolveProgressV4Modal.tsx:160）
- `solver_progress` 字段可能是字符串需先 `JSON.parse`（第 100-101 行）
- 旧格式 `logs: string[]` 和新格式 `logs_full: LogLine[]` 都要兼容
- 终止状态后主动 `evtSource.close()`，不要等浏览器超时

### C. 配置传递路径

```
MonthlyBatchSelector.solverConfig (state)
    → SolverConfigurationModal (props, 双向同步)
    → OperationReviewModal.solverConfig (prop)
        → POST /api/v4/scheduling/solve body.config
    → IntervalSolveTab.solverConfig (state 独立副本)
        → POST /api/v4/scheduling/solve body.config
```

注意：两个入口（批次列表 tab 和区间求解 tab）各自独立维护 `solverConfig` state，不共享。V5 可考虑提升到页面级 context。

### D. 区间求解额外字段

区间求解比月度求解多传 `solve_start_date` / `solve_end_date`，后端/求解器需区分处理。

### E. `apply` 接口幂等性

`apply` 在进度弹窗和结果页各有一个入口，前端通过 `runStatus === 'APPLIED'` / `isApplied` 防止重复提交，但后端应确保幂等。

### F. 独立任务空缺开关行为

`allow_standalone_vacancy: true` 时为软约束（有空缺不报错），`false` 时为硬约束。历史上曾是死开关（memory 有记录），V5 确保 solver 真正消费此字段。

### G. `QualifiedPersonnelModal` 标题列未汉化

`QualifiedPersonnelModal.tsx` 列标题（Name / Team / Qualifications）仍为英文，属于遗留问题。V5 统一中文。

### H. `ScheduleMatrix` 与 `PersonnelScheduleTable` 共享样式

`getShiftStyle` 函数（ScheduleMatrix.tsx:39）刻意复现了 PersonnelScheduleTable 的样式逻辑（注释有说明），V5 应抽取为共用 util 函数，避免双维护。

### I. `batchSelection.ts` 自动勾选逻辑

默认只勾选 `plan_status === 'ACTIVATED'` 的批次。`PENDING`、`COMPLETED` 不会被自动勾选，但用户可手动勾选后触发排班。V5 需确认这个策略是否延续。

### J. 导出功能依赖

Excel 导出调用 `exportV4ScheduleToExcel`（`frontend/src/utils/exportScheduleExcel.ts`），PDF 调用 `exportV4ScheduleToPdf`（`frontend/src/utils/exportSchedulePdf.ts`）。这两个 util 文件的实现须在 V5 适配新结果格式。

---

*报告生成时间：2026-06-11*  
*基于代码版本：commit a237777 (main)*
