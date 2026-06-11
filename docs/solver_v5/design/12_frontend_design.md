# V5 前端设计：SolverV5 界面（精细 UI 设计）

> 角色：V5 前端架构设计师
> 编写日期：2026-06-11，基于 commit a237777（main）
> 上游必读：`docs/solver_v5/research/00_v4_system_map.md`（系统全景，尤其 §3 L0-L4 / §4b 事件流 / §4c 无解分析 / §5 A-F 边界）、`docs/solver_v5/research/06_frontend.md`（V4 全部组件 + 87 配置字段 + wxb-ui 清单）
> 本文档只做**前端设计**，不写代码。代码符号英文，正文中文。约束遵守用户冻结需求 R1-R6 与指挥官决策 D1-D6。
>
> **零新依赖前提（已核实）**：`frontend/package.json` 已含 `react-window@1.8.10`、`react-virtualized-auto-sizer`、`framer-motion@12`，且 wxb-ui 已自带一整套**手写 SVG 图表原语**（见 §5.1）。因此本设计的全部可视化**不引入任何新 npm 依赖**，全部用 wxb-ui 现有图表组件 + 手写 SVG。`@ant-design/plots` 虽在依赖里但**不使用**（它会拖慢首屏且与 wxb-ui 视觉不一致）。

---

## 0. 设计总纲（一句话）

V5 前端 = **复制 V4 的 SolverV4 全部组件为基线**，改名 `SolverV5`、API 指向 `/api/v5/scheduling/*`，把所有交互/数据流/结果格式原样保留（R3/R4/§5 F 全继承），**唯一实质新增**是：①进度弹窗里新增「求解过程可视化」入口与一个全屏的**求解监视器抽屉（SolveMonitorV5Drawer）**；②INFEASIBLE 时结果页/监视器顶替为「无解原因分析面板」。V5 与 V4 **并存**，走全新路由 `/solver-v5` 与全新菜单项，用户随时可回 V4（R3）。

可视化对 R2（结果不降低）**零影响**：它只是把后端 SSE 透传来的 V5 扩展字段（`phase/event/model_stats/incumbent/search_stats`，见 00 文档 §4b）画出来；这些字段对未消费它们的 V4 前端是透明的，对求解结果本身也无任何反作用。

---

## 1. 文件清单

> 路径前缀统一 `frontend/src/`。**全部为新增文件**（D3：不共享可变文件）。命名规则：把 V4 的 `*V4*` 一律换成 `*V5*`，目录 `SolverV4/` → `SolverV5/`。

### 1.1 页面与路由（薄壳）

| 新文件 | 职责 | 从 V4 复制自 | 增强点 |
|---|---|---|---|
| `pages/SolverV5Page.tsx` | 路由入口薄壳（13 行级），渲染 `<MonthlyBatchSelectorV5 />` | `pages/SolverV4Page.tsx` | 仅改组件 import；外层 `className="solver-v5-page"` |

### 1.2 SolverV5 主组件（复制 V4 + 改 API/改名）

| 新文件 | 职责 | 从 V4 复制自 | 增强点（差异见 §3） |
|---|---|---|---|
| `components/SolverV5/MonthlyBatchSelectorV5.tsx` | 主页面：4 Tab 容器 + 高级配置入口 + 进度/结果状态机 | `MonthlyBatchSelector.tsx` | API→V5；打开的是 `SolveProgressV5Modal`/`SolveResultV5Page`；新增 `solverConfig` 提升到页面级 context（修 06 文档坑 C）|
| `components/SolverV5/OperationReviewModalV5.tsx` | 操作审查弹窗（900px），预检 + 触发求解 | `OperationReviewModal.tsx` | precheck/solve→`/api/v5/scheduling/*`；其余原样 |
| `components/SolverV5/SolverConfigurationModalV5.tsx` | 87 字段配置弹窗 | `SolverConfigurationModal.tsx` | 复用同一 `SolverConfig` 类型（§4）；**新增一段「V5 增强」分区**（§3.6）|
| `components/SolverV5/SolveProgressV5Modal.tsx` | **小窗**进度弹窗（700px），SSE 消费 + 精简看板 | `SolveProgressV4Modal.tsx` | SSE→V5 端点；新增「展开监视器」按钮；解析 V5 扩展字段（§6）|
| `components/SolverV5/SolveResultV5Page.tsx` | 全屏结果抽屉（100vw） | `SolveResultV4Page.tsx` | 全部换 `WxbDrawer`+`WxbButton`（修 06 文档坑 A1）；INFEASIBLE 顶替为无解面板（§7）；result→V5 端点 |
| `components/SolverV5/RunHistoryTabV5.tsx` | 历史记录表 | `RunHistoryTab.tsx` | `run_code` 前缀显示 `V5-`；API→`/api/v5/scheduling/runs`；列表行加「求解模式」列（单层/分阶段）|
| `components/SolverV5/IntervalSolveTabV5.tsx` | 区间求解 Tab | `IntervalSolveTab.tsx` | API→V5；其余原样（含 `solve_start_date/solve_end_date`）|
| `components/SolverV5/StandingDutyTabV5.tsx` | 值班任务 Tab | `StandingDutyTab.tsx` | **可直接复用 V4 版**（standalone-tasks API 与求解器版本无关）；为零耦合仍复制一份，但内部不改逻辑 |
| `components/SolverV5/QualifiedPersonnelModalV5.tsx` | 合格人员弹窗 | `QualifiedPersonnelModal.tsx` | 列标题汉化（修 06 文档坑 G）|
| `components/SolverV5/batchSelectionV5.ts` | 批次自动勾选工具 | `batchSelection.ts` | 原样复制（纯函数）|

### 1.3 SolverV5 结果页子组件（复制 V4）

| 新文件 | 职责 | 从 V4 复制自 |
|---|---|---|
| `components/SolverV5/components/ScheduleMatrixV5.tsx` | 排班矩阵（react-window 虚拟化） | `components/ScheduleMatrix.tsx` |
| `components/SolverV5/components/ManualEditDrawerV5.tsx` | 人工改班抽屉 | `components/ManualEditDrawer.tsx` |
| `components/SolverV5/components/MetricCardV5.tsx` | 小指标卡 | `components/MetricCard.tsx` |
| `components/SolverV5/components/TalentDashboardV5.tsx` | 人才看板 | `components/TalentDashboard.tsx` |
| `components/SolverV5/views/AssignmentsViewV5.tsx` | 操作分配 Master-Detail | `views/AssignmentsView.tsx` |
| `components/SolverV5/views/AssignmentCalendarViewV5.tsx` | 分配日历视图 | `views/AssignmentCalendarView.tsx` |

### 1.4 【核心新增】求解过程可视化模块（全新，无 V4 对应）

> 目录 `components/SolverV5/monitor/`。这是 R5 的全部载体，所有图表区块拆成独立纯展示组件，便于单测 + 降级。

| 新文件 | 职责 | 数据源（V5 SSE 字段）|
|---|---|---|
| `components/SolverV5/monitor/SolveMonitorV5Drawer.tsx` | **求解监视器全屏抽屉**（展开视图）。100vw `WxbDrawer`，承载全部 7 个可视化区块 + 实时日志。从 `SolveProgressV5Modal` 的「展开监视器」打开，复用同一 SSE 流（不重连）| 全部 |
| `components/SolverV5/monitor/useSolveStreamV5.ts` | **SSE 消费 hook**（唯一数据中枢）。订阅 `/api/v5/scheduling/runs/:id/progress`，解析 V4+V5 字段，累积成 `SolveStreamState`（§6.2），做点数上限/节流。`SolveProgressV5Modal` 与 `SolveMonitorV5Drawer` 共享同一个 hook 实例（通过 props 传 state，不双开连接）| — |
| `components/SolverV5/monitor/PhaseTimeline.tsx` | 区块 a：求解阶段时间轴（组装→建模→Presolve→求解→提取）| `phase` + `event=PHASE_ENTER` |
| `components/SolverV5/monitor/ModelBuildStats.tsx` | 区块 b：模型构建统计（各约束模块贡献的约束数/变量数柱状图）| `model_stats.by_constraint[name].{count,vars}`（约束数读 `count`、变量数读 `vars`）+ `model_stats.by_layer`（层级变量规模） |
| `components/SolverV5/monitor/ConvergenceChart.tsx` | 区块 c：目标收敛曲线（obj/best_bound 双线 + gap 阴影）| `incumbent.{obj,bound,gap,wall_time}` |
| `components/SolverV5/monitor/ObjectiveBreakdownChart.tsx` | 区块 d：目标分量堆叠图（O0-O8 随 incumbent 演进）| `incumbent.breakdown` |
| `components/SolverV5/monitor/IncumbentPreview.tsx` | 区块 e：中间解快照预览——**覆盖率进度环 + 空缺数徽章**（方案 A 轻量聚合，每次更优解刷新；非员工×日期热力图）| `incumbent.preview.{fill_rate,vacant_positions,scheduled_shifts}`（V5 新增，§6.1）|
| `components/SolverV5/monitor/SearchIntensity.tsx` | 区块 f：搜索强度（分支/冲突数双 sparkline + 数值）| `search_stats.{branches,conflicts,booleans}` |
| `components/SolverV5/monitor/SolveLogPanel.tsx` | 区块 g：实时日志面板（沿用 V4 双格式 + category 标签）| `logs_full` / `logs` |
| `components/SolverV5/monitor/InfeasibilityPanel.tsx` | 无解原因分析面板（R6）。INFEASIBLE 时顶替结果区 | `infeasibility`（V5 新增，§7.1）|
| `components/SolverV5/monitor/monitorTypes.ts` | 监视器全部 TS 类型（`SolveStreamState`/`PhaseInfo`/`IncumbentPoint`/`ModelStat`/`InfeasibilityGroup` …）| — |
| `components/SolverV5/monitor/monitorColors.ts` | 图表配色表（从 wxb-theme token 映射，§5.2）| — |
| `components/SolverV5/monitor/SolveMonitor.css` | 监视器布局样式（仅 CSS 变量，无硬编码 hex）| — |

### 1.5 服务层（修 06 文档坑：API 集中化）

| 新文件 | 职责 |
|---|---|
| `services/schedulingV5Api.ts` | **集中**所有 V5 求解 API（`solve/precheck/preview/stop/apply/getResult/getRuns/getRunStatus`），相对路径 `/api/v5/scheduling/*`，统一错误处理。修 06 文档坑「V4 fetch 散落各组件」。组件不再裸 `fetch`，只调本文件导出函数。SSE 例外：`EventSource` 仍在 `useSolveStreamV5.ts` 里建（SSE 不走 axios）|
| `types/solverV5.ts` | V5 专属类型：`SolverConfig`（沿用 V4 87 字段 + V5 增强键）、`SolveResultV5`、`V5ProgressEvent`、`SolveStreamState` 等的对外契约（§4/§6/§7）|

### 1.6 纯增量注册改动点（R1 允许的唯一“改动”）

> 这是对既有文件的**纯增量**修改，不触碰任何 V4 逻辑行，只新增条目。

| 文件 | 改动（仅新增）| 精确位置 |
|---|---|---|
| `frontend/src/App.tsx` | ① 顶部 `import SolverV5Page from './pages/SolverV5Page';`（紧邻第 17 行 `import SolverV4Page`）② 新增一段 `<Route path="/solver-v5" element={<ProtectedRoute allowAnonymousInShadow requiredPermission="SOLVER_RUN_READ"><SolverV5Page /></ProtectedRoute>} />`（紧贴第 219-226 行 `/solver-v4` 路由块之后）| 第 17 行后 + 第 226 行后 |
| `frontend/src/components/Navigation/TopNavigation.tsx` | 在「人员与排班」分组（`key:'personnel'` 的 children）里，第 97 行 `solver-v4` 项**之后**新增一行：`{ key:'solver-v5', icon:<ExperimentOutlined />, label:'V5 自动排班（增强可视化）', path:'/solver-v5', requiredPermission:'SOLVER_RUN_READ' }`。**图标用 `ExperimentOutlined`**（已核实：TopNavigation.tsx 全文件 44 处图标**均用 antd `@ant-design/icons`**，是该文件既定约定；wxb-ui 无 emoji 规则只约束**新建 UI 组件**，不约束这个 antd-by-convention 的导航文件。V4 项用 `RocketOutlined`，V5 改用 `ExperimentOutlined` 以便用户靠图标区分两代——`ExperimentOutlined` 已在 antd icons，无需新增依赖）| 第 97 行后 |
| `frontend/src/components/wxb-ui/index.ts` | **无需改动**（监视器组件不进 wxb-ui，直接从 `SolverV5/monitor` 引）。图表只复用已导出的 `WxbChartCard/WxbBarChart/WxbAreaChart/WxbSparkline/WxbGauge/WxbBadge/WxbMiniGantt` | — |
| `backend/src/server.ts`（**跨文档交叉引用，归集成工单**）| 在 `isSolverMachinePath` 内追加 2 行 v5 路径匹配（`/api/v5/scheduling/callback/` 与 `/api/v5/scheduling/runs/:id/status`），否则 AUTH_ENFORCE=true 时 solver 机器回调被 JWT 拦死。详见 11_backend §4.1/§6.1 | 同 11_backend |

> 不复用 V4 的 `mvpRedirects`（V4 旧路径仍重定向到 `/solver-v4`，V5 是平行新入口，不抢路由）。`requiredPermission` 沿用 `SOLVER_RUN_READ`（V5 不新增权限码，避免动 RBAC；权限治理另说）。

---

## 2. 信息层级与布局总览（R5 的核心：不堆砌）

可视化分**三个层级容器**，按「用户当前关注点」分配区块，避免信息过载：

```
层级 1：小窗进度弹窗 SolveProgressV5Modal（700px，居中，沿用 V4 体感）
  └─ 只放「概览」：进度条 + 4 张 KPI + 迷你收敛火花线 + 阶段点 + [展开监视器] 按钮 + 折叠日志
        目的：不打断 V4 用户习惯，一眼看到“到哪了/有解没”，想深看再展开

层级 2：求解监视器抽屉 SolveMonitorV5Drawer（100vw，从右滑入，求解中可随时打开/收起）
  └─ 放「全部 7 区块」：左主栏（收敛曲线+分量堆叠+中间解预览）/ 右侧栏（阶段时间轴+模型统计+搜索强度）/ 底部全宽日志
        目的：给“想看懂求解器在干嘛”的用户一块沉浸式仪表盘

层级 3：结果页 SolveResultV5Page（100vw，求解完成后）
  └─ V4 全功能（KPI/矩阵/分配/编辑/导出/应用）+ INFEASIBLE 时顶替为 InfeasibilityPanel
```

**为什么分层而非全堆进度弹窗**：V4 用户的肌肉记忆是「700px 小窗看进度」。强行把 7 个图表塞进 700px 会破坏 R3（体验不大幅改变）。所以小窗只做「概览 + 入口」，重型可视化进**独立抽屉**，用户主动展开才看，求解中可随时开关，不影响后台 SSE。

### 2.1 监视器抽屉线框（ASCII）

```
┌─ SolveMonitorV5Drawer (100vw) ──────────────────────────────────────────────┐
│ [←] 求解监视器 #V5-1718...    [状态 Tag RUNNING]   gap 12.3%   [停止] [收起] │
├──────────────────────────────────────────────┬───────────────────────────────┤
│  左主栏 (≈ 62%)                                │  右侧栏 (≈ 38%)                │
│  ┌──────────────────────────────────────────┐ │ ┌───────────────────────────┐ │
│  │ c. 目标收敛曲线                            │ │ │ a. 求解阶段时间轴          │ │
│  │   obj(实线) / best_bound(虚线) + gap阴影   │ │ │  组装▓▓建模▓Presolve▓求解▓▓│ │
│  │   [WxbChartCard 多系列+region 注解]        │ │ │  ▓提取  (各段耗时 ms)      │ │
│  └──────────────────────────────────────────┘ │ └───────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │ ┌───────────────────────────┐ │
│  │ d. 目标分量堆叠图 O0..O8                   │ │ │ b. 模型构建统计           │ │
│  │   [WxbChartCard 多系列 geometry=bar 堆叠]  │ │ │  各约束模块 约束数/变量数  │ │
│  └──────────────────────────────────────────┘ │ │  [WxbBarChart 垂直柱+旋标签]│ │
│  ┌──────────────────────────────────────────┐ │ └───────────────────────────┘ │
│  │ e. 中间解快照预览                          │ │ ┌───────────────────────────┐ │
│  │   员工×日期 缩略热力图 (react-window)      │ │ │ f. 搜索强度               │ │
│  │   每次更优解刷新，右上角“第N次改进”        │ │ │  分支 ▁▂▄▆█  冲突 ▁▁▂▃    │ │
│  └──────────────────────────────────────────┘ │ │  [WxbSparkline ×2 + 数值] │ │
│                                                │ └───────────────────────────┘ │
├────────────────────────────────────────────────┴───────────────────────────────┤
│ g. 实时日志（全宽，等宽字体，可折叠，category 过滤 pill）                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

> 小屏（< 1280px）退化为单列堆叠（CSS grid 媒体查询）；侧栏区块移到主栏下方。

---

## 3. 与 V4 的差异点（逐条 + 对 R2/R3 影响）

> 原则：差异**只在“加法”**。下表每条标注对 R2（结果不降低）、R3（体验不大幅变）的影响与保障。

| # | 差异点 | 具体内容 | R2 影响 | R3 影响 | 保障 |
|---|---|---|---|---|---|
| 3.1 | API 端点前缀 | 所有 `/api/v4/scheduling/*` → `/api/v5/scheduling/*`（含 SSE/precheck/solve/result/apply/runs/stop） | 无 | 无 | 后端 `DataAssemblerV4` 复用（D2），求解输入与 V4 逐字节一致 |
| 3.2 | run_code 前缀 | 历史列表显示 `V5-{ts}` | 无 | 极小（仅文案）| 与 V4 历史隔离，互不污染 |
| 3.3 | 新增「展开监视器」 | 进度弹窗多一个按钮 → 打开 `SolveMonitorV5Drawer` | 无（纯展示）| 加法，不删 V4 任何元素 | 监视器只读 SSE，不发求解指令 |
| 3.4 | 进度弹窗概览增强 | 小窗多了：迷你收敛火花线、阶段点、2→4 张 KPI | 无 | 小窗布局微调，仍 700px 居中 | V5 字段缺失时这些区块**隐藏**，退化为纯 V4 小窗（§3.7 降级铁律）|
| 3.5 | 结果页 wxb-ui 化 | `Drawer`→`WxbDrawer`、`<button class=v4-btn>`→`WxbButton`、CSS hex→变量 | 无 | 视觉更统一，交互不变 | 修 06 文档坑 A1/A2，是“修复”不是“改体验” |
| 3.6 | 配置弹窗 V5 增强分区 | 新增一段「V5 求解增强」：`enable_solution_hint`(默 on)、`enable_lexicographic_l4`(默 off)、`enable_objective_breakdown`(默 on，仅控可视化上报) | **可能** | 加法分区，V4 字段全保留 | 见下方「3.6 详注」——这些开关默认值保证“与 V4 等价” |
| 3.7 | 无解原因面板 | INFEASIBLE 时结果区顶替为 `InfeasibilityPanel` | 无 | 仅在 V4 会显示“无解(红)”的场景多给信息 | V5 无 `infeasibility` 字段时退化为 V4 的“无解”红字（§7.3）|
| 3.8 | StandingDuty 等无关 Tab | 复制但逻辑零改 | 无 | 无 | 仅为 D3 零耦合而复制 |

### 3.6 详注：配置弹窗「V5 求解增强」分区对 R2 的保障

这一分区是唯一可能影响 R2 的前端入口，必须严守 00 文档 §4a 的“不降低保障”：

- `enable_solution_hint`（默 **on**）：软 hint，绝不 fix（D5）。CP-SAT 仅当 hint 可行时利用，**目标/约束数学不变 → 最优值不变**（00 §4a）。UI 文案：「用上一次解加速收敛（不影响最优结果）」。
- `enable_lexicographic_l4`（默 **off**）：L4 层分阶段（D5）。**默认关 = 与 V4 单层加权完全一致**。打开时 UI 必须显示 `WxbTag amber`「实验」+ tooltip：「仅在等价最优解中挑分量更优者，不劣于 V4」。
- `enable_objective_breakdown`（默 **on**）：纯观测变量上报（00 §4a「目标分量显式建模」），`== 原表达式`，**不改优化方向**。它只为区块 d 供数据；关掉则区块 d 退化为空态。

> 这三个键是 V5 **新增**键（§5 B：只能加键不能改名/改默认）。后端透传给 solver_v5，solver_v5 据此决定是否 `AddHint`/分阶段/建观测变量。前端永不直接改目标权重。

### 3.7 降级铁律（R3 的硬保障）

**任何 V5 扩展字段缺失，UI 必须优雅退化为 V4 体验**，绝不报错、绝不空白崩溃：

| 缺失字段 | 退化行为 |
|---|---|
| `phase` 整体缺失 | 阶段时间轴区块隐藏；进度只靠 `progress` 百分比（纯 V4） |
| `model_stats` 缺失 | 模型统计区块显示空态「建模统计不可用」 |
| `incumbent.breakdown` 缺失 | 分量堆叠图区块隐藏；收敛曲线仍用 `obj/bound`（这俩 V4 已有）|
| `incumbent.preview` 缺失 | 中间解预览区块显示空态「暂无快照」|
| `search_stats` 缺失 | 搜索强度区块隐藏 |
| `infeasibility` 缺失（但 status=INFEASIBLE）| 退化为 V4 的“无解”红字 + 日志 |
| **全部 V5 字段缺失** | 监视器抽屉只剩「阶段=未知 + 日志面板」，等价于 V4 进度弹窗的放大版 |

实现：每个区块组件接收可空 props，内部 `if (!data) return <空态/降级UI>`。监视器入口按钮永远可点（即使无图表，至少有日志）。

---

## 4. SolverConfig 契约（87 字段 + V5 增强键）

`types/solverV5.ts` 导出的 `SolverConfig` **逐字段复制 V4**（06 文档 §5 列出的全部 87 字段，键名/默认值一字不改——§5 B 铁律），并在末尾追加 V5 增强键：

```ts
// types/solverV5.ts —— 在 V4 SolverConfig 全部字段之后追加：
export interface SolverConfigV5Extension {
  // ── V5 求解增强（D5）──
  enable_solution_hint: boolean;        // 默 true ；软 hint 加速，绝不 fix
  enable_lexicographic_l4: boolean;     // 默 false；L4 分阶段，关=与V4等价
  enable_objective_breakdown: boolean;  // 默 true ；仅控可视化上报，纯观测变量
}
export type SolverConfig = SolverConfigV4Base & SolverConfigV5Extension;

export const DEFAULT_SOLVER_CONFIG_V5: SolverConfig = {
  ...DEFAULT_SOLVER_CONFIG /* 来自 V4 87 字段默认 */,
  enable_solution_hint: true,
  enable_lexicographic_l4: false,
  enable_objective_breakdown: true,
};
```

> `SolverConfigV4Base` 即把 06 文档 §5 那段 interface 原样搬过来（含 `LeaderOpsPolicy='allow'|'soft'|'ban'`）。**绝不改 V4 字段默认值**，否则用户存的配置错位、结果漂移（§5 B）。配置弹窗下发 `config` 给 `/api/v5/scheduling/solve` 时整对象一起传，solver_v5 忽略不认识的键即兼容、消费新增键即增强。

---

## 5. 视觉规范与图表选型

### 5.1 渲染技术选型（零新依赖，全部已有）

| 区块 | 选用组件 | 来源 | 理由 |
|---|---|---|---|
| c. 收敛曲线 | `WxbChartCard`（多系列模式：`seriesConfig`+`points`，line geometry，`annotations` region 画 gap 阴影 + referenceLine 画 best_bound 收敛线）| `wxb-ui/ChartCard/ChartCard.tsx`（已支持 line/bar/area/region/referenceLine/tooltip/crosshair）| 现成多系列 SVG 折线 + 注解，**正好**双线+gap 阴影 |
| d. 分量堆叠图 | `WxbChartCard`（`seriesConfig` 里把 O0-O8 设 `geometry:'bar'` → 自动堆叠）| 同上（`stackedBars` 逻辑已实现）| 现成堆叠柱，9 个分量一柱一时刻 |
| b. 模型构建统计 | `WxbBarChart`（**垂直柱**——`BarChart.tsx` 仅实现垂直柱，无 `horizontal` prop；约束名较长，需对 X 轴标签做缩写或 45° 旋转 via CSS transform；约束数/变量数用 `WxbSegmented` 切换或并排两图）| `wxb-ui/BarChart/BarChart.tsx` | 现成柱状，hover 显数值。**修订：原文「横条」与实现不符，已改为垂直柱 + 旋转标签** |
| f. 搜索强度 | `WxbSparkline` ×2（分支、冲突）+ `WxbKpiCard` 显当前值 | `wxb-ui/Sparkline/Sparkline.tsx` | 极轻量火花线，高频更新成本低 |
| a. 阶段时间轴 | 手写 SVG（横向甘特条，每阶段一段，宽=耗时占比）；或复用 `WxbMiniGantt` | 手写 / `wxb-ui/MiniGantt` | 阶段少（5 段），手写 SVG 最可控；颜色用 token |
| e. 中间解预览 | **`WxbGauge`（覆盖率进度环）+ `WxbBadge`（空缺数）+ scheduled_shifts 数值卡**（方案 A 轻量聚合，非热力图）| `wxb-ui/Gauge` + `wxb-ui/Badge` | preview 只发聚合指标（§6.1），无需员工×日期矩阵，渲染极轻；无虚拟化负担 |
| 小窗迷你收敛 | `WxbSparkline`（obj 序列）| `wxb-ui/Sparkline` | 700px 小窗只塞得下火花线 |
| gap 仪表 | `WxbGauge`（可选，监视器头部显 1-gap%）| `wxb-ui/Gauge/Gauge.tsx` | 现成环形仪表 |

> **关键复用**：`WxbChartCard` 同时覆盖 c（折线+注解）和 d（堆叠柱），是本设计的图表主力。它已支持 `headless` 模式（只画图不带卡片 chrome），监视器里用 `headless` + 外层自配标题。

### 5.2 图表配色（全部从 wxb-theme token，无硬编码 hex）

> 取自 06 文档 §14 token 表。`monitorColors.ts` 集中映射，组件只引常量名。

```ts
// monitorColors.ts —— 值一律 var(--wx-*)
export const MONITOR_COLORS = {
  objective:  'var(--wx-blue-700)',   // obj 主线（深海蓝）
  bound:      'var(--wx-blue-500)',   // best_bound（交互蓝，虚线）
  gapRegion:  'var(--wx-blue-100)',   // gap 阴影（淡蓝 region，opacity 配低）
  // 分量 O0-O8 —— 用语义色 + 蓝绿梯度区分（9 色，避免相邻混淆）
  o0_special_shortage: 'var(--wx-red-500)',     // 专项欠配（最痛）红
  o1_vacancy:          'var(--wx-amber-500)',   // 空缺 琥珀
  o2_special_impact:   'var(--wx-blue-100)',
  o3_hours_dev:        'var(--wx-blue-500)',
  o4_special_shift:    'var(--wx-blue-700)',
  o5_night_var:        'var(--wx-green-500)',
  o6_weekend_var:      'var(--wx-fg-3)',
  o7_triple_salary:    'var(--wx-fg-4)',
  o8_leadership:       'var(--wx-fg-2)',
  // 阶段轴
  phase_assembling: 'var(--wx-fg-4)',
  phase_building:   'var(--wx-blue-500)',
  phase_presolve:   'var(--wx-blue-100)',
  phase_solving:    'var(--wx-blue-700)',
  phase_extracting: 'var(--wx-green-500)',
  // 搜索强度
  branches:  'var(--wx-blue-500)',
  conflicts: 'var(--wx-red-500)',
  // 网格/分隔
  grid:    'var(--wx-divider, #EEF2F7)',
  border:  'var(--wx-border)',
} as const;
```

> 热力图（区块 e）班次格颜色**复用 V4 `getShiftStyle` 逻辑**（夜班=红/长白=蓝/普通=绿/休息=灰，06 文档 §8），但 V5 抽成共用 util `shiftCellStyle.ts`（修 06 文档坑 H，避免双维护）。注意 06 文档指出 V4 用的是 tailwind class（`bg-red-600` 等）——V5 在监视器里改用 CSS 变量等价色（`var(--wx-red-500)` 等），保持白色主题、无硬编码。

### 5.3 图标与无 emoji

- 全部图标用 `WxbIcon name="..."` 或内联 SVG（§5 B 第 1 条）。监视器区块标题图标：阶段轴用 `inspect`、收敛用现有趋势 SVG、日志用 `inspect`、搜索强度手写 SVG。
- 沿用 V4 `stripLogIcons`（剥 emoji，`SolveProgressV4Modal.tsx:36-37`）到 `SolveLogPanel`，保证日志无 emoji。

### 5.4 导航入口（与 V4 并存）

- 主菜单「人员与排班」组里，V4 项（`label:'V4 自动排班'`）保留，V5 新增项 `label:'V5 自动排班（增强可视化）'`。两个入口平行，用户随时切换（R3）。
- 可选加分：V5 页面 `WxbPageHeader` 的 `actions` 区放一个 `WxbButton variant=ghost`「切回 V4」→ `navigate('/solver-v4')`，反之亦然。这是“随时回 V4”的显式入口。

---

## 6. 状态管理与 SSE 消费

### 6.1 V5 SSE/回调 payload 契约（在 V4 基础上只增不改，00 §4b/§5 C）

后端经 SSE 命名事件 `progress` 下发（前端**必须** `addEventListener('progress')`，沿用 V4）。payload 形状：

```jsonc
{
  // ── V4 原字段（语义不变，必须保留）──
  "status": "INIT|RUNNING|STOPPING|COMPLETED|APPLIED|FAILED",
  "stage":  "ASSEMBLING|...|DONE",
  "error":  null,
  "solver_progress": {            // 可能是字符串，需先 JSON.parse（V4 坑 B）
    "progress": 0,                // 0-100
    "metrics": { "assigned_count": 0 },
    "logs_full": [ { "time","message","level","category" } ],  // 新格式
    "logs": [ "..." ],            // 旧格式（兼容）

    // ── V5 新增（V4 前端忽略未知字段，天然兼容；缺失时降级 §3.7）──
    // 注意：phase 是 solver 内部阶段（5 值，含 DIAGNOSING），不含 ASSEMBLING。
    //   组装段 ASSEMBLING 来自外层 backend 的 stage 字段（V4 已有），PhaseTimeline 据两者分段渲染（见下注）。
    "phase": "BUILDING|PRESOLVE|SOLVING|EXTRACTING|DIAGNOSING",
    "event": "PHASE_ENTER|MODEL_STATS|NEW_INCUMBENT|SEARCH_STATS|DIAGNOSIS",
    "phase_timings": { "BUILDING": 800, "PRESOLVE": 300, "SOLVING": 45000, "EXTRACTING": 120 },  // ms，累积（solver 内部段）
    "model_stats": {
      "num_vars": 12000, "num_constraints": 34000,
      "by_layer": { "assignments": 8000, "shift": 3000, "vacancy": 500, "special_cover": 200, "special_shortage": 100, "task_placement": 200 },
      // by_constraint 每条目冻结为 {count, ms, vars}（与 solver/backend 对齐，非 {constraints,vars}）：
      "by_constraint": { "ShareGroup": {"count": 120, "ms": 4.2, "vars": 0}, "ShiftAssignment": {"count": 9000, "ms": 30.1, "vars": 3000}, ... }
    },
    "incumbent": {                // NEW_INCUMBENT 事件携带
      "solution_count": 3, "obj": 152300, "bound": 140000, "gap": 8.07, "wall_time": 12.4,
      "breakdown": {              // 仅 enable_objective_breakdown=on（默 on）
        "special_shortage_penalty": 0, "vacancy_penalty": 20000, "special_impact": 0,
        "hours_deviation_scaled": 1500, "special_shift_count": 300, "night_shift_variance": 12,
        "weekend_work_variance": 8, "triple_salary_count": 40, "leadership_penalty": 60
      },
      "preview": {                // 轻量聚合快照（方案 A，非员工×日期矩阵；可为 null）
        "fill_rate": 0.94, "vacant_positions": 6, "scheduled_shifts": 412,
        "top_assignments": [ {"op": 101, "pos": 3, "emp": 205}, ... ]   // 可选明细，最多 N 条
      }
    },
    "search_stats": { "branches": 90210, "conflicts": 4021, "booleans": 8800 },
    "infeasibility": {            // 仅 status=INFEASIBLE 且诊断 pass 完成（event=DIAGNOSIS，§7）
      "located": true,
      "groups": [ { "group": "STANDARD_HOURS", "lit_key": "lit_hours",
                    "message_zh": "工时下限太紧...", "suggestion_zh": "放宽月度容差",
                    "config_keys": ["enable_standard_hours"] }, ... ]
    }
  }
}
```

> **PhaseTimeline 分段渲染（修订）**：组装阶段在 backend 侧发生（不属 solver），从外层 `stage=ASSEMBLING`（V4 已有）渲染；solver 内部段从 `phase=BUILDING/PRESOLVE/SOLVING/EXTRACTING/DIAGNOSING` 渲染。两者拼成完整时间轴，**不把 ASSEMBLING 混进 phase 枚举**。
>
> **`incumbent.preview` 体量控制（修订为方案 A 轻量聚合）**：solver_v5 端只发 `fill_rate/vacant_positions/scheduled_shifts` 聚合指标（+ 可选 top_assignments 明细），**不发**员工×日期稀疏矩阵。区块 e（IncumbentPreview）据此渲染「覆盖率进度环 + 空缺数徽章」，而非 ScheduleMatrix 缩略热力图（避免 on_solution_callback 重建映射的高成本）。§5.1 区块 e 选型与 §8 性能行同步改。

### 6.2 `useSolveStreamV5` hook —— 唯一数据中枢

```ts
// 累积状态（组件间唯一真相源）
export interface SolveStreamState {
  status: string;
  stage: string;
  progress: number;                 // 0-100
  phase: PhaseKey | null;
  phaseTimings: Record<PhaseKey, number>;   // ms
  modelStats: ModelStats | null;
  incumbents: IncumbentPoint[];     // 收敛曲线/分量数据源（有上限，§8）
  latestPreview: PreviewSnapshot | null;
  searchStats: SearchStats | null;
  searchHistory: { branches: number[]; conflicts: number[] };  // sparkline，有上限
  logs: LogLine[];                  // 沿用 V4 LogLine 结构
  infeasibility: InfeasibilityResult | null;
  metrics: { assigned: number; elapsed: string };
}

export function useSolveStreamV5(runId: number | null, open: boolean): {
  state: SolveStreamState;
  isTerminal: boolean;
}
```

消费逻辑（在 V4 基础上扩展）：
1. `new EventSource('/api/v5/scheduling/runs/{runId}/progress')` + `addEventListener('progress', handler)` + `onmessage` 兜底（沿用 V4 `SolveProgressV4Modal.tsx:83-164`）。
2. `data.solver_progress` 字符串则 `JSON.parse`（V4 坑 B）。
3. **日志增量**：沿用 V4 的 `prevCount/newCount` 切片增量逻辑（`logs_full` 优先，`logs` 兜底，`stripLogIcons`）。
4. **incumbent 累积**：`event=NEW_INCUMBENT` 时 push 一个点到 `incumbents`，超上限按 §8 降采样；同时刷新 `latestPreview`。
5. **阶段**：`phase` 变化或 `event=PHASE_ENTER` 时更新 `phase` + `phaseTimings`。
6. **terminal**（`COMPLETED|APPLIED|FAILED|INFEASIBLE`）→ `evtSource.close()`（沿用 V4，防泄漏）。
7. **共享**：`SolveProgressV5Modal` 持有该 hook 实例，把 `state` 通过 props 传给 `SolveMonitorV5Drawer`（监视器不另开 EventSource，避免双连接/双计费 1s flush）。

### 6.3 re-render 控制（§7 性能）

- SSE 1s flush（00 §4b）天然限流，但 `setLogs`/`setIncumbents` 仍可能高频。用 `useRef` 暂存批次 + `requestAnimationFrame`/100ms 节流 `flushSync` 合批，单帧最多一次 setState。
- 图表组件用 `React.memo` + 自定义 `areEqual`（比 `incumbents.length` 和最后一点，而非深比）。
- 监视器抽屉**关闭时仍保持 SSE**（在 `SolveProgressV5Modal` 层持有 hook），只是不渲染图表 → 抽屉开关零重连成本。

---

## 7. 无解原因分析面板（R6）

### 7.1 数据来源

**两条路径（冻结，与 backend §7.5 / solver §6.4-6.5 对齐）**：
- **实时路径**（求解中诊断完成即推）：读 `solver_progress.infeasibility.groups[]`，组项 `{group, lit_key, message_zh, suggestion_zh, config_keys[]}`。`SolveMonitorV5Drawer` / `SolveProgressV5Modal` 即时消费。
- **结果路径**（结果页/历史回看）：读 `result` 端点 `data.infeasibility_analysis.minimal_conflict_groups[]`，组项字段与实时路径**完全相同**（仅外层键名/数组名不同）。`SolveResultV5Page` 的 `InfeasibilityPanel` 消费。

后端仅在主求解 INFEASIBLE 时触发二次诊断 pass（00 §4c：`SufficientAssumptionsForInfeasibility` 按 7 组业务约束挂 assumption literal），把命中的约束组 + 业务文案 + 放宽建议 + 关联 config_keys 经 `category='CONFLICT'` 日志通道 + 上述两条结构化路径下发。

7 组（00 §4c）映射为面板卡片：

| group | 业务文案（message_zh，示例）| 放宽建议（suggestion_zh）| 一键跳配置（config_keys）|
|---|---|---|---|
| `STANDARD_HOURS` | 工时下限太紧，假期多的月份难满足 | 放宽月度工时容差（H9 下限）| `enable_standard_hours` |
| `LOCKED_OPERATIONS` | 锁定的员工不是该工序的候选人 | 取消该锁定或改派候选人 | `enable_locked_operations` |
| `CONSECUTIVE_DAYS` | 员工连续工作超限且无人可替 | 放宽最大连续工作日 | `enable_max_consecutive_work_days` |
| `SPECIAL_SHIFT_COVERAGE` | 专项班次候选人不足 N 人 | 改为软覆盖或补充候选人 | `enable_special_shift_coverage` |
| `LEADERSHIP_COVERAGE` | 某生产日无可用领导 | 放宽领导在岗策略（soft）| `enable_leadership_coverage`, `leader_ops_policy_*` |
| `LOCKED_SHIFTS` | 锁定班次数据缺失（strict 模式）| 关闭严格锁定班次 | `strict_locked_shifts` |
| `POSITION_MUST_FILL` | 某岗位无合格候选人 | 允许岗位空缺 | `allow_position_vacancy` |

### 7.2 面板布局（线框）

```
┌─ InfeasibilityPanel（顶替 SolveResultV5Page 的结果区 / 监视器主栏）─────────────┐
│ [图标] 本次求解无可行解 —— 以下约束组互相冲突，放宽其一即可能有解            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [WxbTag red] 冲突组 1：工时下限太紧                                         │ │
│ │  业务说明：6 月假期多，部分员工工时凑不满下限...                            │ │
│ │  建议：放宽月度工时容差                                  [跳到配置 →]       │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ [WxbTag red] 冲突组 2：专项班次候选人不足                                   │ │
│ │  ...                                                     [跳到配置 →]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [复用 precheck 告警栏样式：红底深红字 #fde8e8 等价的 var(--wx-red-*)]          │
│ 底部：[返回配置重试] [查看完整日志（CONFLICT category 过滤）]                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 用 `WxbCard` + `WxbTag color=red` 每组一卡，复用 V4 结果页的「预检告警栏」视觉（06 §7「预检告警栏」），但配色改 CSS 变量。
- 「跳到配置 →」按钮：关闭结果抽屉 → 打开 `SolverConfigurationModalV5` 并**滚动/高亮**到对应 `config_keys` 的开关（用 ref scrollIntoView + 短暂高亮 class）。这是 R6 的「一键跳配置」。

### 7.3 降级（§3.7）

- `infeasibility` 缺失但 status=INFEASIBLE/FAILED → 退化为 V4 行为：结果页/历史显示「无解(红)」`WxbTag`，日志面板照常（CONFLICT category 着色），不渲染冲突卡片。零崩溃。

---

## 8. 性能设计

| 项 | 上限/策略 | 理由 |
|---|---|---|
| 收敛曲线点数 | `incumbents` 软上限 **300 点**；超出后按等距降采样（保留首/末 + 每 N 点取 1），始终保留最新 incumbent | CP-SAT 大问题可能上千次改进；300 点 SVG 折线流畅，肉眼无差 |
| 分量堆叠点数 | 与收敛曲线**共用** `incumbents` 数组（同降采样），不另存 | 一次降采样两图共享 |
| 搜索强度 sparkline | `searchHistory` 各保留最近 **60 点**（滚动窗口） | 火花线只看趋势，60 点足够 |
| 中间解预览热力图 | `ScheduleMatrixV5` 缩略只读模式，`react-window FixedSizeList` 虚拟化（复用 V4），`ROW_HEIGHT≈12`；preview 稀疏格（仅非休息）；每次更优解整体替换而非增量 diff | 大矩阵（数百员工×31 天）必须虚拟化，否则卡顿（06 §8 已用 react-window）|
| SSE re-render | §6.3：useRef 合批 + 100ms 节流 + `React.memo` 区块 + 仅比 length/末点 | 1s flush 已限流，再加一层防抖避免抽屉内 7 图同时重渲 |
| 抽屉开关 | 监视器关闭不断 SSE（hook 在 Modal 层持有），只停渲染 | 开关零重连成本 |
| 日志面板 | 沿用 V4 自动滚底；可加「日志条数 > 2000 时只保留最近 2000」上限 | 长求解日志暴涨防内存 |

---

## 9. V4 全功能继承清单（R4）逐项映射

> 每一项 V4 能力都在 V5 有对应组件，确保 R4「具备 V4 全部功能」。

| V4 功能（06 文档）| V5 承载组件 | 状态 |
|---|---|---|
| 批次选择（月份/部门筛选/多选/自动勾选 ACTIVATED）| `MonthlyBatchSelectorV5` + `batchSelectionV5.ts` | 复制，零改 |
| 操作审查（分组展示/岗位标签颜色/合格人员弹窗）| `OperationReviewModalV5` + `QualifiedPersonnelModalV5` | 复制 + 汉化列头 |
| 配置弹窗 87 字段（硬约束/参数/目标/领导三态）| `SolverConfigurationModalV5` | 复制 + 追加 V5 增强分区（§3.6）|
| 进度（SSE/进度条/KPI/实时日志）| `SolveProgressV5Modal` + `useSolveStreamV5` | 复制 + 概览增强 |
| 全屏结果（KPI 横排/排班矩阵/操作分配/双 Tab）| `SolveResultV5Page` + `ScheduleMatrixV5` + `AssignmentsViewV5` | 复制 + wxb-ui 化 |
| 人工编辑（改班/改派/撤销栈/重置）| `SolveResultV5Page`（editHistory）+ `ManualEditDrawerV5` | 复制，零改逻辑 |
| 导出（Excel/PDF）| 复用 `utils/exportScheduleExcel.ts`/`exportSchedulePdf.ts`（06 坑 J：适配 V5 result 格式——但 result 形状与 V4 等价 §5 D，故大概率零改）| 复用 |
| 应用（事务落库/幂等防重）| `schedulingV5Api.applyRun` → `POST /api/v5/scheduling/runs/:id/apply` | 复制 |
| 历史（run 列表/质量 Tag/重开结果）| `RunHistoryTabV5` | 复制 + run_code V5- |
| 预检（precheck pass/warn/error）| `OperationReviewModalV5` → `POST /api/v5/scheduling/precheck` | 复制 |
| 预览（preview_only 纯预览旁路）| `schedulingV5Api.previewProposal` → `/api/v5/scheduling/preview-proposal` | 复制 |
| 区间求解（solve_start/end_date 冻结）| `IntervalSolveTabV5` | 复制 |
| 值班任务（RECURRING/FLEXIBLE/AD_HOC CRUD）| `StandingDutyTabV5` | 复制（逻辑零改）|

---

## 10. 实现步骤拆解（每步可独立验证）

> 自下而上，每步都能跑/截图验证，不必等全链路。

| 步 | 内容 | 独立验证方式 |
|---|---|---|
| S1 | 建 `types/solverV5.ts`（SolverConfig + 增强键）、`services/schedulingV5Api.ts`（先指向 V4 端点占位，或 mock）| `tsc` 编译通过；单测调用函数 |
| S2 | 复制 V4 全部组件 → `SolverV5/*`，批量改名 + API 改 `/api/v5/*`，建 `pages/SolverV5Page.tsx` | 改 App.tsx/Nav，访问 `/solver-v5`，页面与 V4 视觉一致、4 Tab 可点（后端 V5 端点未就绪时 precheck/solve 报错可接受）|
| S3 | 纯增量注册：App.tsx route + TopNavigation 菜单项 | 菜单出现「V5 自动排班」，点击进入页面 |
| S4 | 建 `monitor/monitorTypes.ts`/`monitorColors.ts`/`useSolveStreamV5.ts`，先消费 **V4 字段**（status/progress/logs）| 用 V4 端点的 SSE（或后端 V5 透传 V4 字段）验证进度+日志能流（等价 V4 进度弹窗）|
| S5 | 建 `SolveProgressV5Modal`：概览 + 「展开监视器」按钮 + 迷你 sparkline（V5 字段缺失时隐藏）| 求解中小窗显示进度/日志；无 V5 字段时退化为 V4 小窗 |
| S6 | 建 `SolveMonitorV5Drawer` 骨架 + `SolveLogPanel`（区块 g）| 点「展开监视器」开 100vw 抽屉，日志全宽显示，关闭不断流 |
| S7 | 区块 c 收敛曲线（`WxbChartCard` 多系列 + region 阴影），喂 `incumbents` | 后端发 `incumbent` 时曲线增长；mock 数据可先验证渲染 |
| S8 | 区块 d 分量堆叠（同 `WxbChartCard` bar geometry）| breakdown 字段驱动堆叠柱；缺失时区块隐藏 |
| S9 | 区块 a 阶段时间轴 + 区块 b 模型统计（`WxbBarChart`）+ 区块 f 搜索强度（`WxbSparkline`）| 各自 mock 字段验证；缺失降级 |
| S10 | 区块 e 中间解预览（`ScheduleMatrixV5` 缩略模式）| preview 字段驱动热力图刷新；性能（react-window）用大 mock 验证 |
| S11 | `SolveResultV5Page` wxb-ui 化（WxbDrawer/WxbButton/CSS 变量）+ 全功能继承 | 求解完成查看结果，矩阵/分配/编辑/导出/应用全通 |
| S12 | `InfeasibilityPanel`（R6）+ 一键跳配置 | 喂 INFEASIBLE + `infeasibility` mock，冲突卡片显示，点「跳配置」高亮对应开关；无字段降级为 V4 无解红字 |
| S13 | 性能与降级回归：300 点上限/节流/全字段缺失降级/小屏单列 | 大 mock 流压测；逐字段删验证降级 |

---

## 11. 测试方案

### 11.1 单元测试（jest + RTL，沿用 `frontend/npm run test:ci`）

- `useSolveStreamV5.test.tsx`：喂 mock SSE 序列（V4-only / V4+V5 / 字段缺失 / INFEASIBLE+诊断），断言 `SolveStreamState` 累积正确、incumbent 降采样到 ≤300、terminal 时 close、日志增量切片无重复。
- 各区块组件 snapshot + 空态/降级测试：`ConvergenceChart`/`ObjectiveBreakdownChart`/`ModelBuildStats`/`PhaseTimeline`/`SearchIntensity`/`IncumbentPreview`/`InfeasibilityPanel` 各喂 `null`/正常/异常数据，断言不崩溃、降级 UI 出现。
- `SolverConfigurationModalV5`：断言 87 V4 字段全在、默认值与 V4 一致；V5 增强 3 键默认值正确（hint=on/lex=off/breakdown=on）。
- `schedulingV5Api.test.ts`：断言全部走相对 `/api/v5/scheduling/*`，无硬编码 host（§5 B 第 4 条），错误处理统一。

### 11.2 集成/交互测试

- 路由：`/solver-v5` 渲染 `SolverV5Page`；菜单项可见且跳转；V4 `/solver-v4` 不受影响（并存）。
- 进度弹窗 → 展开监视器 → 关闭：断言**只建一个 EventSource**（mock `EventSource`，断言 `new` 调用次数=1）。
- INFEASIBLE 全链：solve 返回无解 + `infeasibility` → 结果页顶替为冲突卡片 → 点「跳配置」打开配置弹窗并高亮目标开关。

### 11.3 视觉/规范门禁

- ESLint/CI：无新硬编码 hex（grep `#[0-9a-fA-F]{3,6}` 在 `SolverV5/` 下应仅出现在 token 默认回退里，且优先用 `var(--wx-*)`）。
- 无 emoji：grep Extended_Pictographic 在 `SolverV5/` 下应为空（除 `stripLogIcons` 的正则本身）。
- 构建门禁：`frontend/npm run build`（`CI=false`）通过；纳入 `scripts/verify_v4_archive.sh` 的前端构建步骤（不新增 gate 文件，沿用现有）。

### 11.4 与 R2 对齐的端到端验证（依赖后端/solver_v5）

- 同输入下，V5 结果页 KPI（completion/coverage/质量分）与 V4 结果页**逐项一致**（OPTIMAL 时），用 00 文档 §3.3 的离线对比脚本喂同一 `logs/request_{id}.json`，前端展示数值与脚本输出对账。
- 收敛曲线终点 obj 等于结果页 metrics 的 `objective_value`（自洽校验：可视化数据与最终结果一致）。

---

## 12. 异议（对指挥官决策的保留意见）

无原则性异议。两点**实现层提示**（非反对）：

1. **D3「复制 V4 组件为基线」会带来代码重复**（SolverV4 与 SolverV5 两套近乎相同的 ~3000 行）。这是 R1（V4 零改动）+ D1/D3（零耦合）的必然代价，可接受。**建议**：把**纯展示且与求解器版本无关**的子组件（`ScheduleMatrix` 的格子样式 util、`exportScheduleExcel/Pdf`、`batchSelection` 纯函数、`getShiftStyle`）抽到 `frontend/src/components/SolverShared/` 共用，既减重复又不违反 R1（这些不是 V4 链路的可变求解文件，是无害纯工具）。若指挥官坚持绝对零共享，则全量复制，本设计已按全量复制给出文件清单（§1.2-1.3）。

2. **`@ant-design/plots` 依赖**虽在 `package.json`，本设计**刻意不用**（首屏体积 + 视觉不一致），全部走 wxb-ui 手写 SVG。这与 D 系列决策不冲突，仅记录技术取舍。

---

## 13. 评审修订记录（总架构师裁决后回改）

> 由 V5 总架构师对三方评审 findings 裁决后统一回改。冻结契约以 `20_IMPLEMENTATION_PLAN.md §冻结契约` 为唯一权威。

| # | 评审项（裁决）| 本文档改动 |
|---|---|---|
| BLOCKER | model_stats.by_constraint schema（**采纳 {count,ms,vars}**）| §6.1 改为 `{count, ms, vars}` + 补 `by_layer`；§1.4 ModelBuildStats 数据源标注约束数读 count、变量数读 vars |
| BLOCKER | 无解诊断字段名（**采纳 infeasibility/infeasibility_analysis 双路径**）| §6.1 组项改 `{group, lit_key, message_zh, suggestion_zh, config_keys[]}`；§7.1 明确实时读 `solver_progress.infeasibility.groups`、结果读 `infeasibility_analysis.minimal_conflict_groups` |
| BLOCKER | phase 枚举含 ASSEMBLING（**采纳：去 ASSEMBLING 加 DIAGNOSING**）| §6.1 phase 改 `BUILDING\|PRESOLVE\|SOLVING\|EXTRACTING\|DIAGNOSING`；ASSEMBLING 由外层 stage 渲染，PhaseTimeline 分段说明 |
| BLOCKER | incumbent.preview 字段/结构（**采纳方案 A 轻量聚合**）| §6.1/§1.4/§5.1/§8 区块 e 改为 `fill_rate/vacant_positions` 进度环+徽章，弃员工×日期矩阵 |
| MAJOR | 区块 b WxbBarChart 无 horizontal（**采纳：垂直柱+旋标签**）| §5.1/§2.1 线框/§1.4 改为垂直柱，X 轴标签缩写或 45° 旋转 |
| MAJOR | 第 7 组 group 标识符（**采纳 POSITION_MUST_FILL**）| §7.1 表 `POSITION_VACANCY`→`POSITION_MUST_FILL` |
| MINOR | §1.6 RocketOutlined vs wxb-ui 规则（**采纳：用 antd ExperimentOutlined**）| §1.6 V5 菜单图标改 `ExperimentOutlined`（与 V4 RocketOutlined 区分）；注明 TopNavigation 全用 antd 图标、wxb-ui 规则只约束新建组件 |
| MINOR | §1.6 漏 server.ts isSolverMachinePath（**采纳**）| §1.6 表补 server.ts 行，交叉引用 11_backend §4.1/§6.1（**实际改动归集成工单 I1**） |
| — | objective_breakdown 读取路径 | 结果页从 `result.metrics.objective_breakdown` 读（与 solver/backend 对齐） |

---

## 附：关键文件路径速查（绝对路径）

- 本设计文档：`/Users/zhengfengyi/MFG8APS/docs/solver_v5/design/12_frontend_design.md`
- V4 进度弹窗（SSE 消费基线）：`/Users/zhengfengyi/MFG8APS/frontend/src/components/SolverV4/SolveProgressV4Modal.tsx`
- V4 结果页（结果页基线）：`/Users/zhengfengyi/MFG8APS/frontend/src/components/SolverV4/SolveResultV4Page.tsx`
- wxb-ui 多系列图表（区块 c/d 主力）：`/Users/zhengfengyi/MFG8APS/frontend/src/components/wxb-ui/ChartCard/ChartCard.tsx`
- wxb-ui 条形图（区块 b）：`/Users/zhengfengyi/MFG8APS/frontend/src/components/wxb-ui/BarChart/BarChart.tsx`
- wxb-ui 火花线（区块 f / 小窗）：`/Users/zhengfengyi/MFG8APS/frontend/src/components/wxb-ui/Sparkline/Sparkline.tsx`
- wxb-ui 面积图/仪表：`/Users/zhengfengyi/MFG8APS/frontend/src/components/wxb-ui/AreaChart/AreaChart.tsx`、`.../Gauge/Gauge.tsx`
- 路由注册点：`/Users/zhengfengyi/MFG8APS/frontend/src/App.tsx`（第 17 行 import / 第 219-226 行 `/solver-v4` 路由块）
- 菜单注册点：`/Users/zhengfengyi/MFG8APS/frontend/src/components/Navigation/TopNavigation.tsx`（第 97 行 `solver-v4` 项）
- wxb-ui 导出索引：`/Users/zhengfengyi/MFG8APS/frontend/src/components/wxb-ui/index.ts`
- 配置字段权威（87 字段）：`/Users/zhengfengyi/MFG8APS/docs/solver_v5/research/06_frontend.md` §5
