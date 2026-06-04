# MFG8APS CEO-Level Component Library Brief

## 目标

这套组件库要解决两个不同场景：

1. 日常生产排产：排班员、工艺工程师、IT 管理员需要高密度、可诊断、可审计的工作台。
2. 高层汇报展示：面向 CEO / 工厂负责人 / 经营会时，需要第一屏有视觉冲击力，能把 APS 从“后台工具”呈现为“生产经营操作系统”。

原则是“高层第一眼震撼，操作员长期使用不累”。建议把视觉分为两套皮肤：

1. Operational Skin：实际生产前端使用，落在 `frontend/src/components/wxb-ui/`，保持白色主题、CSS 变量、Wxb 组件和 SVG / `WxbIcon`。
2. Executive Presentation Skin：高层汇报、CEO review、展厅演示使用，可以使用深蓝品牌背景、发光数据层、明亮业务面板，但不要直接替代日常排产工作台。

## 组件库应包含的内容

### 1. Foundations

- Design tokens：品牌色、状态色、业务语义色、密度、间距、圆角、阴影、动效、z-index。
- Typography：中文优先的信息层级，数字指标使用 tabular nums，禁止过度字距。
- Layout：页面壳、双栏/三栏工作台、全屏甘特、驾驶舱首屏、会议室投屏布局。
- Icon system：生物工艺、排产、人员、合规、成本、风险、集成、审计图标。
- Motion：状态切换、进度、求解阶段、风险闪烁、拖拽反馈；动效必须可关闭。
- A11y states：focus、disabled、loading、empty、warning、error、success、read-only、mock/fallback。

### 2. Base Components

沿用或扩展现有 wxb-ui：

- Button / IconButton / SplitButton
- Input / SearchInput / Select / DatePicker / RangePicker / TimePicker / InputNumber
- Checkbox / Radio / Switch / Segmented / Slider / Stepper
- Modal / Drawer / Popover / Tooltip / Toast / Alert / Progress / Skeleton
- Tabs / Breadcrumb / Pagination / Dropdown / SideNav / TopNav
- Table / DataTable / Descriptions / Timeline / List / Tree / Empty / Divider
- Tag / Badge / StatusPill / PriorityBadge / RoleBadge / AuditBadge
- ChartCard / Gauge / Sparkline / BarChart / AreaChart / PieChart
- GanttChart / MiniGantt / Heatmap / CapacityStrip

### 3. APS Domain Components

这些是新库最该补的复合组件：

- ExecutiveHero：高层首屏，包含本月批次、覆盖率、成本、风险、生产节奏。
- FactoryKpiStrip：填充率、缺口、加班、三倍薪、产能、Readiness、执行偏差。
- ReadinessScorePanel：人力韧性评分、瓶颈岗位、关键人员依赖。
- BatchFlowMap：USP / DSP / QC / QA / Release 生产流地图。
- ExecutiveGanttPreview：高层版甘特，只显示关键路径、冲突、释放节点。
- SolverRunTimeline：组装、预检、求解、回写、应用的阶段进度。
- InfeasibleDiagnosisPanel：无解冲突定位、约束来源、影响批次、松弛建议。
- RelaxationActionBar：关闭约束、允许空岗、放宽工时、重跑方案。
- ScenarioCompareBoard：方案 A/B/C 对比，突出业务取舍和推荐方案。
- CostImpactPanel：加班小时、三倍薪人天、成本区间、预算偏差。
- QualificationGuardrail：候选人资质匹配、缺失资质、阻断原因。
- ScheduleChangeBrief：变更影响员工、岗位、班次、确认状态。
- ComplianceAuditTrail：who / when / what / before-after，适配 GMP 审计。
- RoleLandingPage：排班员、领导、一线员工、工艺、IT 的角色化首页。
- SystemHealthPanel：DB、solver、SSE、回调、备份、集成状态。
- IntegrationStatusBoard：MES / ERP / LIMS / SSO 接入状态与数据流向。
- BoardBriefExport：一页式 PDF / PPT 经营简报组件。

### 4. Page Templates

- CEO Executive Cockpit：经营视角，突出风险、成本、产能、人力韧性。
- Scheduler Command Workbench：筛选、批次、甘特、求解、诊断一屏闭环。
- Solver Result Review：结果矩阵、KPI、人工修改、合规校验、应用方案。
- Scenario Comparison：多轮 run 对比、配置溯源、推荐方案。
- Infeasible Recovery：失败 run 进入诊断，给松弛建议并重跑。
- Template Governance：模板版本、diff、影响批次、发布审批。
- IT Operations Console：健康检查、迁移、审计、备份、PII 治理。

### 5. Data Visualization

- Executive KPI number blocks：数字必须可被 3 秒读懂。
- Gantt / MiniGantt / Timeline：生产关键路径、锁定范围、冲突段。
- Heatmap：日期 x 团队、岗位 x 资质、班次 x 覆盖率。
- Radar / Quadrant：韧性、风险、价值成本、瓶颈优先级。
- Diff visualization：方案间的缺口、成本、公平度、风险差异。
- Flowline：USP 到 DSP 到 QC release 的生产流。
- Alert stack：P0 / P1 / P2 风险队列。

### 6. 内容语义

组件命名和文案要直接服务 APS 业务：

- 不说“error”，要说“无解 / 约束冲突 / 回写失败 / 资质阻断”。
- 不说“score”，要说“人力韧性 / 覆盖率 / 产能利用 / 风险暴露”。
- 不说“details”，要说“涉及批次 / 涉及岗位 / 涉及日期 / 建议动作”。

## 风格选择

### A. Bio Command Luminous 推荐用于高层演示

深 WuXi Blue / biotech cyan 背景，叠加明亮数据面板、生产流光线、关键路径甘特、风险雷达和方案推荐。不是黑色科幻大屏，而是“生命科学作战室”：高冲击、可信、适合高层汇报。

适用：领导层演示、管理驾驶舱、方案汇报、一页式简报。

### B. Executive Command White

白底、深 WuXi Blue、Bio Green、Amber 风险色。首屏有强数字、生产流地图、关键路径甘特和风险队列。冲击力比深蓝弱，但最容易与现有 wxb-ui 合流。

适用：生产系统领导驾驶舱、可长期使用的管理页。

### C. Precision Manufacturing Console

更工程化、更紧凑。低圆角、细边框、表格和甘特占主导，强调稳定、审计、可诊断。视觉冲击来自精密感，而不是大面积装饰。

适用：排班员、工艺工程师、IT 管理员日常工作台。

### D. Scientific Bioprocess Atlas

把 USP / DSP / QC / Release 做成生物工艺流图，加入反应器、层析柱、QC release、hold time 等图标。比普通 dashboard 更有行业辨识度。

适用：对外展示、工厂参观、售前演示、产品愿景页。

### E. Boardroom Story Mode

接近管理简报：一屏一个决策主题，突出“本月能不能交付、哪里卡、要谁拍板、采用哪个方案”。组件更像 PPT-ready 的经营模块。

适用：董事会、CEO review、月度 S&OP、跨部门评审。

## Claude Design Prompt

```text
你是一名为生物制药 APS 系统设计企业级组件库的高级产品设计师。请为 MFG8APS 设计一套新的 React 组件库和高层演示视觉方向。

项目背景：
- MFG8APS 是生物制药 CMO 场景的 APS 排产排班系统，覆盖批次管理、生产甘特、V4 求解器、人员排班、资质、模板、审计、IT 运维。
- 目标用户包括排班员、生产领导层 / 厂长、CEO 级高层、一线操作工、工艺工程师、IT 管理员。
- 领导反馈现有界面像报告和后台工具，不够有视觉冲击力。新设计要能在向 WuXi Biologics CEO 级别领导展示时，把系统呈现为“生产经营操作系统”，而不是普通排班软件。

硬性约束：
- 生产系统落地主题保持 wxb 默认白色主题；高层汇报可以另设 Executive Presentation Skin。
- Executive Presentation Skin 可以使用深蓝 / 青蓝高冲击背景，但不要做纯黑科幻大屏。
- 所有颜色使用 CSS 变量，命名延续 `--wx-*`，不要在组件代码里硬编码色值。
- 按钮、输入、表格、弹窗、抽屉、折叠、标签、徽标、空状态、分割线、提示、复选框等基础能力要映射到 wxb-ui 组件体系。
- 禁止 emoji 图标，使用 SVG 图标或 `WxbIcon`。
- 卡片圆角不超过 8px，界面要像工业生产工作台，不要做柔软消费级 UI。
- 不要做暗色大屏、霓虹风、纯装饰渐变、营销落地页、空洞英雄区。
- 日常操作界面必须保留高密度、可诊断、可审计的信息结构。
- 高层展示界面可以更有舞台感，但不能牺牲业务可信度。

设计目标：
1. 第一屏要有 CEO 级视觉冲击力：强数字、工厂生产流、关键路径、风险队列、方案推荐。
2. 体现生物制药行业特征：USP、DSP、QC、Release、GMP、资质、hold time、suite、批次、求解无解诊断。
3. 让领导能 30 秒回答：本月能否交付、哪里有风险、需要谁决策、哪个方案最优。
4. 让排班员能长期使用：筛选、甘特、求解、结果、诊断、人工调整、应用方案都清晰。
5. 让组件库能落地到 React：提供 tokens、组件层级、状态、响应式规则和示例页面。

请输出：
1. 设计风格总原则。
2. Design tokens：颜色、语义色、排版、间距、圆角、阴影、动效、密度。
3. 基础组件清单：按钮、输入、搜索、选择器、表格、标签、徽标、弹窗、抽屉、图表、甘特等。
4. APS 业务复合组件清单：
   - ExecutiveHero
   - FactoryKpiStrip
   - ReadinessScorePanel
   - BatchFlowMap
   - ExecutiveGanttPreview
   - SolverRunTimeline
   - InfeasibleDiagnosisPanel
   - RelaxationActionBar
   - ScenarioCompareBoard
   - CostImpactPanel
   - QualificationGuardrail
   - ScheduleChangeBrief
   - ComplianceAuditTrail
   - RoleLandingPage
   - SystemHealthPanel
   - IntegrationStatusBoard
   - BoardBriefExport
5. 页面模板：
   - CEO Executive Cockpit
   - Scheduler Command Workbench
   - Solver Result Review
   - Scenario Comparison
   - Infeasible Recovery
   - Template Governance
   - IT Operations Console
6. 每个核心组件的 states：default、hover、focus、loading、empty、warning、error、success、disabled、read-only、mock/fallback。
7. 桌面适配策略：会议室投屏 1920、桌面 1440、笔记本 1280；本轮不需要移动端设计。
8. 可访问性规则：键盘、焦点、对比度、表格语义、动效减少。
9. 输出一个可视化 demo 页面，主题优先采用 “Bio Command Luminous”：深 WuXi Blue 背景、青蓝生命科学光线、明亮数据面板、强数字、生产流地图、方案对比、风险诊断、董事会简报导出区。

请避免：
- 不要做纯黑科幻大屏；要做深蓝品牌级生命科学指挥舱。
- 不要只给通用 SaaS dashboard。
- 不要用无业务意义的装饰图形。
- 不要把每个信息块都做成漂浮卡片。
- 不要使用 emoji。
- 不要让高层展示页失去 APS 的关键业务语义。
```

## 演示 HTML

演示页已放在：

`docs/ceo-component-library-demo.html`
