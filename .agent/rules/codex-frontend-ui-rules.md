---
trigger: model_decision
description: Codex frontend/UI rules for APS frontend work. Apply when changing pages, components, services, types, interaction flows, or scheduling visualization.
---

# Codex Frontend/UI Rules

适用范围：

- `frontend/src/pages/`
- `frontend/src/components/`
- `frontend/src/services/`
- `frontend/src/types/`
- `frontend-next/src/app/`
- `frontend-next/src/design-system/`
- `frontend-next/src/features/`
- `frontend-next/src/services/`
- `frontend-next/src/entities/`
- 甘特图、排程、求解监控、任务池等高交互页面

先读：

- `AGENTS.md`
- `.agent/rules/codex-coding-rules.md`
- `docs/ARCHITECTURE.md`
- `docs/frontend-visual-language.md`
- legacy frontend 相关页面、组件、`services/`、`types/`
- frontend-next 相关路由、`features/`、`design-system/`、`services/`、`entities/`
- 若涉及接口契约，补读 `codex-backend-api-rules.md`

## 1. 先读页面链路

1. 先看页面/容器组件，再看子组件、service、type。
   - frontend-next 读序是：`app routes -> features/design-system -> services -> entities`
2. 先确认数据来源和状态流，再改 UI；不要只盯 JSX 表层。
3. 如果页面由后端或 solver 返回的数据驱动，先确认接口契约是否稳定。

## 2. UI 改动边界

1. 默认遵循 `docs/frontend-visual-language.md` 定义的“工业生产工作台”风格：浅色、高信息密度、结构清晰、状态可读性优先、装饰克制、动效节制。
2. `frontend/` 和 `frontend-next/` 使用同一套前端风格真源；技术栈不同不是视觉口径漂移的理由。
3. 当前实现可以继续基于现有组件库落地，但不要把组件库名、脚手架名、当前代码现状或外部设计体系名当作风格定义。
4. `frontend-next` 可以建立 first-party design system，但业务页不得绕过该体系直接堆原子样式或泄露底层库 API；legacy frontend 也不得把局部 one-off 样式当作默认先例继续复制。
5. 新建页面必须遵守该风格；触达的旧页面应向该风格收敛，但这不等于一次性重做整站视觉。
6. 改动应优先提升：
   - 信息正确性
   - 交互清晰度
   - 错误可诊断性
7. 排程/甘特/监控类页面优先保证时间、状态、资源信息表达准确，不要为了美观牺牲业务可读性。
8. 不要引入和现有项目风格脱节的新组件体系或状态管理方式。
9. 对未来 agent 可读性友好的界面状态，优先是显式的 loading / empty / error / success，而不是隐藏式状态分支。

### 视觉与排版执行规则

1. 默认不得为了“呼吸感”牺牲信息密度；禁止把本来紧凑可读的信息无故摊成大卡片、大空区或明显过大的控件。
2. 默认几何语言应低圆角、偏工程化；不要把 pill、胶囊按钮、胶囊标签、厚实软卡片当作常态。
3. 状态标签默认也按低圆角处理；如果出现胶囊形，应视为显式例外，而不是共享默认样式。
4. 业务主内容面默认不得引入 `blur`、`frosted`、装饰性 `gradient`、厚阴影；少量 meta surface 例外不得扩散到表格、矩阵、甘特、编辑区、监控面和状态标签。
5. 页面排版必须先满足扫描效率、比较效率、异常定位效率，再考虑风格化表现；任何降低信息密度、制造排版失衡或干扰阅读的设计，即使“更现代”，也不符合本项目默认方向。
6. 任意可能变长的信息都必须考虑 overflow 策略：wrap、truncate、scroll、fixed-width、multi-line 至少要有一个明确选择；不要把溢出问题留给实现后碰运气。
7. 文本、数字、状态、列头、图表标签、按钮文案、tab 文案如果可能越界，就必须在组件或布局层面有可预期的容器策略；静默溢出、裁切、撑破布局都算问题，不是小瑕疵。
8. 字体层级必须服务于业务优先级，而不是服务于视觉风格；禁止 headline 过大、辅助信息过重、正文过小、中文阅读节奏被过强 tracking 破坏。
9. 默认单一主滚动源；多重滚动容器只有在确有必要且边界清楚时才允许存在。
10. Feature 层不得通过本地 one-off 样式重新定义按钮、标签、面板、图表注释、时间轴条块的几何、密度或排版。
11. 当前代码实现不自动等于风格真源；当共享 primitive 与 `docs/frontend-visual-language.md` 冲突时，不允许继续复制该实现，应显式视为 design-system debt。

## 3. 数据与状态规则

1. `services/`、`types/`、组件 props 必须同步更新，避免“页面能跑但类型已漂移”。
2. 任何异步交互至少检查：
   - loading
   - empty
   - error
   - success / refresh 后状态
3. 表单、筛选器、弹窗类改动要核对：
   - 提交字段名
   - 默认值
   - 重置逻辑
   - 编辑态与新建态差异
4. 不要为了临时兼容后端异常数据，在前端静默改写核心业务字段。
5. 如果 UI 逻辑已经开始承载业务约束，优先把该约束回推到后端契约或 source-of-truth 文档，而不是继续堆前端补丁。

## 4. 性能与可维护性

1. 除非明确定位到性能瓶颈，否则不要引入额外复杂抽象。
2. 避免无必要的全局状态提升；优先保持状态就近。
3. 不要为“防抖、memo、缓存”而牺牲可读性，除非能明确说明收益。
4. 列表、图表、虚拟滚动、甘特图改动后，优先检查边界数据和空数据场景。

## 5. Frontend 验证

至少执行：

- `cd frontend && npm run build`
- `cd frontend-next && npm run build`

按改动补充：

- `cd frontend && npm test -- --watchAll=false`
- `cd frontend-next && npm run test:ci`
- 若联动后端接口，补 backend build
- 若联动 Solver V4 结果展示，补相关 V4 校验

如果改动涉及 `.env`、启动配置、代理配置，或 HMR 状态可疑，按 `codex-runtime-restart-rules.md` 重启对应 frontend；不要在脏 dev server 上继续手测。

交付时明确说明用户可见变化，以及哪些交互未在当前环境完整验证。
