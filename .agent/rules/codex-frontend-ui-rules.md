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
2. 当前实现可以继续基于现有组件库落地，但不要把组件库名、脚手架名或外部设计体系名当作风格定义。
3. `frontend-next` 可以建立 first-party design system，但业务页不得绕过该体系直接堆原子样式或泄露底层库 API。
4. 新建页面必须遵守该风格；触达的旧页面应向该风格收敛，但这不等于一次性重做整站视觉。
5. 改动应优先提升：
   - 信息正确性
   - 交互清晰度
   - 错误可诊断性
6. 排程/甘特/监控类页面优先保证时间、状态、资源信息表达准确，不要为了美观牺牲业务可读性。
7. 不要引入和现有项目风格脱节的新组件体系或状态管理方式。
8. 对未来 agent 可读性友好的界面状态，优先是显式的 loading / empty / error / success，而不是隐藏式状态分支。

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
