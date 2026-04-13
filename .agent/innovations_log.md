# 创新日志 (Innovations Log)

## 批次管理甘特图性能优化 — 未采纳的激进建议

记录日期: 2026-04-08

### 💡 建议 1: 彻底废弃 Tooltip 组件，改用 CSS-only hover card

**Challenger 原始建议:**
完全废弃 Ant Design 的 `<Tooltip>` 组件，改用纯 CSS 的 `[data-tooltip]::after` 伪元素或纯 HTML `title` 属性 + CSS tooltip，从根本上消除 React 组件树的挂载开销。

**未采纳原因（Planner 评估）:**
- CSS-only tooltip 在甘特图复杂布局（绝对定位 + overflow:hidden）下有裁切和溢出问题
- AntD Tooltip 默认 `destroyTooltipOnHide` 行为已经比较轻量
- 本次优化选择"条件跳过 Tooltip 挂载"（滚动时不渲染）作为折中方案，保留了静止时的 hover UX

**技术储备价值:**
若未来单日模式操作数量超过 500个，CSS-only tooltip 方案值得重新评估。
实现方式参考：`<div title="op name" class="gantt-bar-op" data-tooltip="...">` + `tooltip { position: fixed; ... }`

---

### 💡 建议 2: 水平方向虚拟化（列/时间轴虚拟化）

**Challenger 原始建议:**
当前甘特图对整个时间轴宽度（`totalWidth = totalDays * dayWidth`）进行全量渲染，周视图可达 `90天 * 100px = 9000px`。应实现水平方向虚拟化，只渲染视口内的时间列段，将初始渲染的操作 bar 数量从 O(totalOps) 降至 O(visibleOps)。

**未采纳原因（Planner 评估）:**
- CSS背景渲染（`background-image: linear-gradient`）已是零 DOM 成本的时间格绘制
- 操作 bar 已经通过虚拟化行（`useVirtualRows`）限制了渲染数量
- 水平虚拟化需要改造 operationPositions 的计算逻辑，引入左右边界剪裁，工程量较大
- 当前性能瓶颈已通过其他手段解决，水平虚拟化作为二期优化预留

**技术储备价值:**
当单日模式下一天内有 200+ 工序时（需求: 多产线多批次大型工厂），水平虚拟化将是必须项。
参考实现: `tanstack-virtual` 的 `useVirtualizer` 支持水平方向。

