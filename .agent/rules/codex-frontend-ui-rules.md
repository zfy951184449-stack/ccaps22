---
trigger: model_decision
description: Codex frontend/UI rules for React + Ant Design work in the APS monorepo. Apply when changing pages, components, services, types, interaction flows, or scheduling visualization.
---

# Role: Codex Frontend Implementation Engineer

适用范围：

- `frontend/src/pages/`
- `frontend/src/components/`
- `frontend/src/services/`
- `frontend/src/types/`
- 甘特图、排程、求解监控、任务池等高交互页面

## 1. 先读页面链路

1. 先看页面/容器组件，再看子组件、service、type。
2. 先确认数据来源和状态流，再改 UI；不要只盯 JSX 表层。
3. 如果页面由后端或 solver 返回的数据驱动，先确认接口契约是否稳定。

## 2. UI 改动边界

1. 默认沿用现有 Ant Design + CRA 风格，不做无请求的视觉重构。
2. 改动应优先提升：
   - 信息正确性
   - 交互清晰度
   - 错误可诊断性
3. 排程/甘特/监控类页面优先保证时间、状态、资源信息表达准确，不要为了美观牺牲业务可读性。
4. 不要引入和现有项目风格脱节的新组件体系或状态管理方式。

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

## 4. 性能与可维护性

1. 除非明确定位到性能瓶颈，否则不要引入额外复杂抽象。
2. 避免无必要的全局状态提升；优先保持状态就近。
3. 不要为“防抖、memo、缓存”而牺牲可读性，除非能明确说明收益。
4. 列表、图表、虚拟滚动、甘特图改动后，优先检查边界数据和空数据场景。

## 5. Frontend 验证

至少执行：

- `cd frontend && npm run build`

按改动补充：

- `cd frontend && npm test -- --watchAll=false`
- 若联动后端接口，补 backend build
- 若联动 Solver V4 结果展示，补相关 V4 校验

如果改动涉及 `.env`、启动配置、代理配置，或 HMR 状态可疑，按 `codex-runtime-restart-rules.md` 重启 frontend；不要在脏 dev server 上继续手测。

交付时明确说明用户可见变化，以及哪些交互未在当前环境完整验证。
