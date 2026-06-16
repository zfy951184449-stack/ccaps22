# V5 求解器高级配置弹窗——现状审计报告

> 审计时间：2026-06-12  
> 审计范围：只读 UX 审计（严禁改源码）  
> 审计源文件：  
> - `frontend/src/components/SolverV5/SolverConfigurationModalV5.tsx`  
> - `frontend/src/types/solverV5.ts`（含 `DEFAULT_SOLVER_CONFIG_V5`）  
> - `frontend/src/components/SolverV5/MonthlyBatchSelector.tsx`  
> - `frontend/src/components/SolverV5/IntervalSolveTab.tsx`  
> - `frontend/src/components/SolverV5/StandingDutyTab.tsx`  
> - `frontend/src/components/SolverV5/SolverV5.css`

---

## 1. 完整字段清单（按现有渲染分组）

> **字段计数说明**：`SolverConfigV4Base` 接口定义 55 个字段（含 2 个可选字段），`SolverConfigV5Extension` 新增 3 个字段，合计接口级别 58 个；`DEFAULT_SOLVER_CONFIG_V5` 运行时对象包含 56 个（两个可选字段 `enable_special_shift_coverage` / `enable_special_shift_joint_coverage` 未写入默认对象）。文档提及的"87 字段"是更宽泛的设计文档表述，实际 TypeScript 接口键为 55+3=58 个。

### 1.0 V5 增强分区（渲染在最顶部，蓝色面板）

| 字段 key | 控件类型 | 默认值 | 单位 | tooltip 文案要点 |
|---|---|---|---|---|
| `enable_solution_hint` | 开关 | `true` | — | "用上一次解加速收敛（不影响最优结果）" |
| `enable_objective_breakdown` | 开关 | `true` | — | "上报各目标分量数据供监视器图表展示（不影响求解方向）" |
| `enable_lexicographic_l4` | 开关 | `false` | — | "开启后在 L0–L3 目标相等的前提下进行第二阶段优化（L4），优先改善目标分量分布"；关闭时有附加提示文字"关闭时与 V4 逐字节等价"；开启时显示 `WxbTag(color=amber)` 实验标签（tooltip: "仅在等价最优解中挑分量更优者，不劣于 V4"）|

### 1.1 团队范围（面板）

| 字段 key | 控件类型 | 默认值 | 单位 | tooltip / 说明 |
|---|---|---|---|---|
| `team_ids` | 多选下拉（`WxbSelect mode=multiple`） | `[]`（空=全部） | — | 面板说明："限定求解范围至指定团队。留空则包含所有员工。"；选项由 `/api/organization/solver-teams` 动态加载 |

### 1.2 求解参数（蓝色面板）

| 字段 key | 控件类型 | 默认值 | 单位 | min / max | tooltip / 说明 |
|---|---|---|---|---|---|
| `max_time_seconds` | 数字输入（`WxbInputNumber`） | `300` | 秒 | 30 – 3600，步进 30 | 面板说明："时间越长结果越优，但响应更慢。建议范围 60 到 600 秒。" |
| `stagnation_limit` | 数字输入（`WxbInputNumber`） | `300` | 秒 | 30 – 3600，步进 30 | 同上面板，无独立 tooltip |

### 1.3 硬约束（WxbDivider 分隔）

以下字段均为 **开关（`WxbSwitch`）**：

| 字段 key | 标题 | 默认值 | 缩进子项 | 说明 / tooltip 文案 |
|---|---|---|---|---|
| `enable_share_group` | 共享组约束 | `true` | 否 | "同一共享组内人员的排班互斥/共存规则" |
| `enable_unique_employee` | 人员唯一性 | `true` | 否 | "同一时段内每人仅能分配一个岗位" |
| `enable_one_position` | 一人一岗 | `true` | 否 | "同一操作内禁止多岗位分配" |
| `enable_locked_operations` | 保留锁定操作 | `true` | 否 | "手工锁定的操作人员分配将作为硬约束保留" |
| `enable_locked_shifts` | 保留锁定班次 | `true` | 否 | "手工锁定的员工班次将作为硬约束保留" |
| `strict_locked_shifts` | └ 严格模式 | `false` | **是**（父: `enable_locked_shifts`） | "锁定数据异常时直接报错（关闭则跳过异常条目）"；父关闭时 disabled |
| `enable_shift_assignment` | 班次分配规则 | `true` | 否 | "根据任务需求自动关联班次" |
| `enable_standard_hours` | 标准工时合规 | `true` | 否 | "确保排班符合法定工时要求" |
| `enable_prefer_standard_shift` | 优先标准班次 | `false` | 否 | "无操作需求时优先安排标准班（白班）" |
| `enable_leadership_coverage` | 领导层排班约束 | `true` | 否 | "生产日必须有管理岗在岗；主管/经理不参与操作；管理人员优先工作日出勤" |
| `enable_leader_production_coverage` | └ 生产日需领导在岗 | `true` | **是**（父: `enable_leadership_coverage`） | "每个有生产操作的日期至少 1 名管理岗上班（硬约束）。领导太少、覆盖不过来导致无解时可关闭"；父关闭时 disabled |

**领导层参与策略子配置**（`enable_leadership_coverage=true` 时展开，`WxbSegmented`，三态）：

| 字段 key | 职级显示名 | 控件类型 | 默认值 | 选项 |
|---|---|---|---|---|
| `leader_ops_policy_dept_manager` | 经理 | 三态分段选择器 | `'ban'` | 允许参与 / 软性减少 / 禁止参与 |
| `leader_ops_policy_team_leader` | 主管 | 三态分段选择器 | `'ban'` | 同上 |
| `leader_ops_policy_group_leader` | 组长 | 三态分段选择器 | `'soft'` | 同上 |

**领导层权重数字配置**（`enable_leadership_coverage=true` 时展开，2×2 网格）：

| 字段 key | 标签 | 控件类型 | 默认值 | min / max |
|---|---|---|---|---|
| `objective_weight_leader_nonworkday` | 非工作日出勤惩罚 | 数字输入 | `20` | 0 – 1000 |
| `objective_weight_leader_workday_rest` | 工作日休息惩罚 | 数字输入 | `10` | 0 – 1000 |
| `objective_weight_leader_ops` | 操作分配惩罚 | 数字输入 | `30` | 0 – 1000 |
| `objective_weight_leader_special` | 特殊班次惩罚 | 数字输入 | `50` | 0 – 1000 |

### 1.4 连续天数约束（WxbDivider 分隔）

| 字段 key | 标题 | 控件类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `enable_max_consecutive_work_days` | 最大连续工作天数 | 开关 | `true` | "限制连续工作天数上限" |
| `enable_max_consecutive_rest_days` | 最大连续休息天数 | 开关 | `true` | "限制连续休息天数，防止长期缺勤" |
| `enable_consecutive_work_rest_pattern` | 上班/休息节奏约束 | 开关 | `false` | "有操作安排时：连续上班 [最少–最多] 天，连续休息 [最少–最多] 天" |

**节奏约束子配置**（`enable_consecutive_work_rest_pattern=true` 时展开，2×2 数字网格）：

| 字段 key | 标签 | 控件类型 | 默认值 | min / max |
|---|---|---|---|---|
| `min_consecutive_work_days_pattern` | 最少连续上班 | 数字输入 | `2` 天 | 1 – `max_consecutive_work_days_pattern` |
| `max_consecutive_work_days_pattern` | 最多连续上班 | 数字输入 | `3` 天 | `min_consecutive_work_days_pattern` – 7 |
| `min_consecutive_rest_days_pattern` | 最少连续休息 | 数字输入 | `2` 天 | 1 – `max_consecutive_rest_days_pattern` |
| `max_consecutive_rest_days_pattern` | 最多连续休息 | 数字输入 | `3` 天 | `min_consecutive_rest_days_pattern` – 7 |

### 1.5 夜班约束（WxbDivider 分隔）

| 字段 key | 标题 | 控件类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `enable_night_rest` | 夜班后休息 | 开关 | `true` | "夜班后强制安排休息日" |
| `enable_prefer_extended_night_rest` | └ 优先延长休息 | 开关 | `true` | "夜班后尽可能休息更多天（软约束）"；父 `enable_night_rest=false` 时 disabled |
| `enable_no_isolated_night_shift` | 禁止孤立夜班 | 开关 | `true` | "夜班前一天必须是白班，禁止休息后直接上夜班" |
| `enable_night_shift_interval` | 夜班间隔 | 开关 | `true` | "两次夜班之间的最小间隔天数" |
| `enable_balance_night_shifts` | 夜班均衡 | 开关 | `true` | "团队内夜班数量均匀分配" |

**夜班间隔子配置**（`enable_night_shift_interval=true` 时展开）：

| 字段 key | 标签 | 控件类型 | 默认值 | min / max |
|---|---|---|---|---|
| `min_night_shift_interval` | 夜班最小间隔天数 | 数字输入 | `7` 天 | 2 – 30 |

注：子面板内有动态文字 "当前设置：两次夜班之间至少间隔 {min_night_shift_interval - 1} 天"（7 减 1 = 6，语义与字段名有轻微歧义）。

**延长夜班休息子配置**（`enable_prefer_extended_night_rest=true` 且 `enable_night_rest=true` 时展开，1×2 数字网格）：

| 字段 key | 标签 | 控件类型 | 默认值 | min / max |
|---|---|---|---|---|
| `preferred_night_rest_days` | 期望休息天数 | 数字输入 | `2` 天 | 2 – 4 |
| `objective_weight_night_rest_extend` | 惩罚权重 | 数字输入 | `15` | 0 – 500 |

### 1.6 独立任务（WxbDivider + 面板）

| 字段 key | 标题 | 控件类型 | 默认值 | 缩进 | 说明 |
|---|---|---|---|---|---|
| `enable_standalone_tasks` | 纳入独立任务 | 开关 | `true` | 否 | "启用后，当月有效的独立任务将参与自动排班" |
| `allow_standalone_vacancy` | 允许独立任务空缺 | 开关 | `true` | **是**（父: `enable_standalone_tasks`） | "无合适候选人时允许岗位留空" |
| `objective_weight_standalone_vacancy` | 空缺惩罚权重 | 数字输入 | `5000` | **是**（父: 前两项均=true） | min=100, max=100000, 步进 1000 |

### 1.7 优化目标（WxbDivider 分隔）

以下字段每行渲染为「开关 + 权重数字输入」双控件行：

| toggle key | 标题 | 默认值 | weight key | 权重默认值 | 权重 min | 说明 |
|---|---|---|---|---|---|---|
| `enable_minimize_deviation` | 最小化工时偏差 | `true` | `objective_weight_deviation` | `1` | 0 | "减少实际工时与标准工时的偏差"；关闭时权重 disabled |
| `enable_minimize_special_shifts` | 最小化特殊班次 | `true` | `objective_weight_special_shifts` | `100` | 0 | "减少非标准班次的使用数量" |
| `enable_balance_night_shifts` | 夜班均衡分配 | `true` | `objective_weight_night_balance` | `5` | 0 | "惩罚夜班分配不均匀（方差 x 权重）" |
| `enable_balance_weekend_work` | 周末工作均衡 | `true` | `objective_weight_weekend_balance` | `5` | 0 | "惩罚周末/节假日工作分配不均匀" |
| `enable_minimize_triple_salary` | 三倍薪日成本优化 | `true` | `objective_weight_triple_salary` | `10` | 0 | "尽量避免在法定节假日安排排班" |
| `allow_position_vacancy` | 允许岗位空缺 | `false` | `objective_weight_vacancy` | `10000` | 0 | "允许无人接手时留空（高惩罚权重）" |

### 1.8 未在弹窗中渲染的字段（静默字段）

以下字段存在于接口/默认值中，但**未出现在 Modal JSX 里**，用户无法通过 UI 查看或修改：

| 字段 key | 类型 | 默认值 | 备注 |
|---|---|---|---|
| `max_consecutive_rest_days` | number | `4` | 全局连续休息上限（区别于 pattern 系列）；V4 也未在 UI 渲染 |
| `min_rest_after_night_block` | number | `2` | 夜班块后强制休息天数；V4 也未在 UI 渲染 |
| `off_hours_multiplier` | number | `1.5` | 非标班次工时乘数；V4 也未在 UI 渲染 |
| `enable_special_shift_coverage` | boolean（可选） | 未写入 default | V4 接口可选字段，V5 继承，无默认值，无 UI |
| `enable_special_shift_joint_coverage` | boolean（可选） | 未写入 default | V4 接口可选字段，V5 继承，无默认值，无 UI |

**说明**：前三个字段在 V4 modal 中同样未暴露到 UI，属于历史沿袭的静默字段，求解器使用其硬编码默认值。两个 `enable_special_shift_*` 可选字段既无默认值也无 UI。

---

## 2. 入口与作用域

### 2.1 打开配置弹窗的入口

共发现 **2 个独立入口**，均在 `MonthlyBatchSelector.tsx` 管辖范围内：

| 入口位置 | 打开方式 | 组件 |
|---|---|---|
| `MonthlyBatchSelector` 页头（WxbPageHeader actions 区） | 点击「高级配置」按钮（WxbButton secondary） | `SolverConfigurationModalV5` |
| `IntervalSolveTab`（区间求解 Tab）WxbFilterBar actions 区 | 点击「配置」按钮（WxbButton secondary） | `SolverConfigurationModalV5`（IntervalSolveTab **自己**持有独立实例） |

**值班任务 Tab（`StandingDutyTab`）**：不持有 `SolverConfigurationModalV5`，该 Tab 的独立任务不通过高级配置弹窗控制。

### 2.2 config state 生命周期

两个入口各自独立持有一份 `SolverConfig` 状态：

```
MonthlyBatchSelector：
  const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG_V5);
  // 生命周期：组件挂载时初始化，页面刷新即重置。

IntervalSolveTab：
  const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG_V5);
  // 完全独立，与 MonthlyBatchSelector 的 config 不共享。
```

**结论：两份 config 互相独立，内存态，页面刷新即丢失。无持久化（localStorage / 后端存储）。**

### 2.3 入口间 config 的联动

- `MonthlyBatchSelector` 的「部门筛选器」（WxbSelect）与 `solverConfig.team_ids` 双向联动：
  - 切换部门 → 自动写入 `solverConfig.team_ids`
  - 关闭配置弹窗 → 读取 `team_ids` 反向同步到部门筛选器（`handleConfigClose`）
- `IntervalSolveTab` 也有相同的部门-team_ids 联动，但仅限该 Tab 内部。
- 两个 Tab 的 config 完全隔离，无同步机制。

### 2.4 无解诊断高亮跳转

`MonthlyBatchSelector` 和 `IntervalSolveTab` 均实现了无解诊断跳转：监视器抽屉（`SolveMonitorV5Drawer`）触发 `onOpenConfig(configKeys: string[])` 时，关闭监视器、携带 `highlightKeys` 打开配置弹窗。高亮样式通过 CSS 类 `.solver-v5-config-row-highlight`（amber 色描边 + 浅黄背景）实现。

---

## 3. 既有交互资产清单

### 3.1 已实现的能力

| 能力 | 实现状态 | 备注 |
|---|---|---|
| 恢复默认 | 已实现 | Footer 左侧「恢复默认」按钮，`handleReset()` 回调 `DEFAULT_SOLVER_CONFIG_V5` 完整对象 |
| 无解诊断高亮跳转（highlightKeys） | 已实现 | `isHighlighted(key)` 函数 + `data-config-key` 属性 + `.solver-v5-config-row-highlight` CSS |
| 子开关缩进联动 | 已实现 | `strict_locked_shifts`（父: locked_shifts）、`enable_prefer_extended_night_rest`（父: night_rest）、`enable_leader_production_coverage`（父: leadership_coverage）；`isToggleDisabled()` 控制 disabled 态 |
| 条件展开子面板 | 已实现 | `enable_leadership_coverage` → 展开领导策略+权重；`enable_night_shift_interval` → 展开间隔天数；`enable_prefer_extended_night_rest && enable_night_rest` → 展开休息天数配置；`enable_consecutive_work_rest_pattern` → 展开节奏网格；`enable_standalone_tasks` → 展开空缺开关；`allow_standalone_vacancy` → 展开空缺权重 |
| 动态范围约束（min/max 互锁） | 已实现 | pattern 系列四个字段的 min/max 随另一字段值实时更新（e.g. `min={1} max={config.max_consecutive_work_days_pattern}`） |
| tooltip / 描述文字 | 已实现 | 每行开关均有 `span` 描述；`enable_lexicographic_l4` 有 WxbTooltip 包裹的实验标签；`min_night_shift_interval` 下有动态释义文字 |
| 保存配置（内存态） | 已实现 | Footer 右侧「保存配置」按钮等同于关闭（`onClose()`），无后端调用 |
| 团队异步加载 | 已实现 | 弹窗 visible 时触发 `fetchTeams()`，带 loading 状态 |
| 分组折叠 | **未实现** | 各分组之间用 `WxbDivider` 分隔，无折叠展开控制 |
| 表单校验 | **未实现** | 数字字段有 min/max 限制（依赖 WxbInputNumber 原生范围），无跨字段校验或提交校验 |
| 配置 diff / 变更高亮 | **未实现** | 无与默认值的对比展示 |
| 持久化 / 预设 | **未实现** | 无 localStorage、无后端存储、无"保存为预设"功能 |

### 3.2 enable_lexicographic_l4 特殊交互

该字段有三层状态反馈：
1. 关闭时：描述中追加灰色提示文字 "关闭时与 V4 逐字节等价。"
2. 开启时：标题旁出现 WxbTag(color=amber, "实验")
3. WxbTooltip 悬停 "仅在等价最优解中挑分量更优者，不劣于 V4"

---

## 4. 痛点清单

### P1 — 滚动长度与空间效率

- **Modal 高度上限为 68vh**（`.solver-v5-config-modal .ant-modal-body { max-height: 68vh; overflow-y: auto; }`），宽度 640px。
- 渲染顺序：V5 增强分区 → 团队范围 → 求解参数 → 硬约束（11 行开关）→ 领导策略（条件展开 7 行） → 连续天数（3 行+条件 4 行）→ 夜班（5 行+条件 2 行）→ 独立任务 → 优化目标（6 行双控件）。
- 所有功能都展开时内容高度约 **2000–2200px**，在 1080p 屏幕 68vh≈734px 内需滚动约 3 屏才能看完所有内容。
- 没有"跳转到分组"的快捷入口，找某字段需目测滚动。

### P2 — 权重数字可读性极差

优化目标区权重取值范围跨越 4 个数量级：
- `objective_weight_deviation = 1`
- `objective_weight_night_balance = 5`
- `objective_weight_weekend_balance = 5`
- `objective_weight_triple_salary = 10`
- `objective_weight_night_rest_extend = 15`
- `objective_weight_special_shifts = 100`
- `objective_weight_standalone_vacancy = 5000`
- `objective_weight_vacancy = 10000`

数字框直接显示原始整数（如 `10000`），无相对比例、无量纲说明，用户无法直觉判断"增大 vacancy 权重 1000 倍是否合理"。没有对数滑条、无百分比归一化、无「相对于默认值」的增减方向标注。

### P3 — 无保存与无 diff

- 弹窗内修改后点击「保存配置」仅关闭弹窗（`onClose()`），数据保持在内存 state 中。页面刷新后配置丢失，无任何提示。
- 无变更标记：用户不知道自己改了哪些字段（与默认值的 diff 完全不可见）。
- 两个 Tab 各自持有独立 config，无法将"批次列表 Tab 的配置"复制到"区间求解 Tab"。

### P4 — 无输入校验

- `min_night_shift_interval = 7` 的语义描述是"间隔 {值 - 1} 天"，存在语义歧义（字段名是"interval"但子文字解释为"至少间隔 n-1 天"），容易让用户误填。
- Pattern 系列的 min/max 互锁仅在 UI 层约束，不做提交前校验。
- 开关关闭后权重字段被 disabled 但不清零，数值静默保留（对后续重新开启有影响但无提示）。

### P5 — 静默字段信息丢失

`max_consecutive_rest_days=4`、`min_rest_after_night_block=2`、`off_hours_multiplier=1.5` 三个字段对排班结果有影响但完全不暴露在 UI 中，用户无法知道它们的存在，也无法调整。历史沿袭自 V4，属于隐性设计债。

### P6 — 分组无折叠

所有分组均用 `WxbDivider(label)` 分隔，无折叠/展开控制。高级用户无法快速隐藏不感兴趣的分组（如夜班约束已理解后可折叠），初次使用者也无法看出哪些分组是"高频调整"。

### P7 — enable_balance_night_shifts 双重出现

`enable_balance_night_shifts` 在两处渲染：
1. 硬约束分组（nightShiftConstraints 数组，第 4 项）—— 开关
2. 优化目标分组（objectiveControls 数组，第 3 项）—— 开关 + 权重数字

同一 config key 在两处均绑定到同一开关，用户修改任一处都会影响另一处，但视觉上看不出两者是同一字段，容易误认为是不同功能。

### P8 — 「保存配置」按钮语义误导

Footer 右侧按钮文案「保存配置」（带 WxbIcon "released"）在用户心智中暗示持久化，但实际行为仅是关闭弹窗（`onClick={onClose}`），没有任何网络请求或存储操作。与「恢复默认」构成的足迹暗示用户配置会被保留，实则每次刷新都要重新设置。

### P9 — 条件子面板的折叠效果缺失动画

条件展开的子面板（`section.solver-v5-config-subpanel`）为直接条件渲染（`{config.xxx && <section>}`），切换时无过渡动画，布局突变，体验粗糙。

---

## 5. 加法约束（R2/R3 冻结规则说明）

根据 `docs/solver_v5/design/20_IMPLEMENTATION_PLAN.md §1`（及类型注释）冻结规则：

| 规则 | 内容 |
|---|---|
| **R2** | V4 原有 87 字段（实际实现 55 键）的**键名**不得改变 |
| **R3** | V4 原有字段的**默认值**不得改变（`DEFAULT_SOLVER_CONFIG_V5` 中的 V4 部分与 V4 `DEFAULT_SOLVER_CONFIG` 逐字节一致） |
| **加法原则** | 新能力只能追加字段（如已追加 `enable_solution_hint`、`enable_lexicographic_l4`、`enable_objective_breakdown` 三个 V5 键），不得修改已有字段语义 |

**后续设计注意**：任何 UX 改进（如暴露静默字段、改变分组、添加预设）均不得修改键名或默认值，否则违反 R2/R3。

---

## 附：字段总计核对表

| 维度 | 数量 | 来源 |
|---|---|---|
| `SolverConfigV4Base` 接口字段 | 55 | 类型文件（含 2 个 `?` 可选字段） |
| `SolverConfigV5Extension` 接口字段 | 3 | 类型文件 |
| 合计接口字段 | 58 | |
| `DEFAULT_SOLVER_CONFIG_V5` 运行时 key | 56 | 2 个可选字段不写入 default |
| Modal 中可见/可操作字段 | 约 49 | 含所有开关 + 数字 + 多选下拉 |
| 静默字段（有 key 无 UI） | 5 | `max_consecutive_rest_days`、`min_rest_after_night_block`、`off_hours_multiplier`、`enable_special_shift_coverage`、`enable_special_shift_joint_coverage` |
| `enable_balance_night_shifts` 双重出现 | 1 | 夜班约束 + 优化目标各一处 |
