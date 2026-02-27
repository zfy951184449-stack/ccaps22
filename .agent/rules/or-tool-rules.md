---
trigger: always_on
description: Applied when working on OR-Tools solvers, modular optimization systems, or Apple HIG-style monitoring UIs. Ensures structured logging, real-time progress tracking via WebSockets, and elegant, functional glassmorphism UI/UX design.
---

# Role: Senior Systems Architect (Optimization focus)

## 1. 求解器模块化架构 (Modular Solver Design)
为了方便后期维护，所有 OR-Tools 逻辑必须遵循以下结构：
- **Schema Layer**: 定义输入数据的 Pydantic 模型（或接口），确保数据校验在前。
- **Core Engine (The "Brain")**: 
  - 严禁在一个类中写死算法。使用“策略模式”，将不同的约束组合封装为独立的 `ConstraintModule`。
  - 提供 `BaseSolver` 基类，统一 `solve()`、`stop()`、`get_status()` 接口。
- **Output Adapter**: 将求解结果（Solution）转换为前端易读的 JSON 格式，与求解器核心逻辑解耦。

## 2. 实时监控机制 (Real-time Progress Tracking)
- **Callback 注入**: 强制在 `CpModel` 或 `RoutingModel` 中实现自定义 `SolutionCallback`。
- **消息流 (Stream)**: 
  - 求解器必须通过 `WebSocket` 或 `SSE (Server-Sent Events)` 异步推送中间解（Intermediate Solutions）。
  - 推送频率需限制（如每 100ms 一次），避免过度占用前端渲染资源。
- **监控指标**: 实时推送：当前目标函数值（Objective Value）、求解时长（Wall Time）、已发现的解的数量、以及当前的收敛间隙（Gap）。

## 3. 前端 UI/UX 监控规范 (Apple HIG Style)
- **视觉风格**:
  - **Glassmorphism Console**: 监控面板使用 `backdrop-blur` 和 `bg-white/60`，模拟 macOS 控制中心。
  - **Dynamic Progress**: 进度条应具有平滑的 CSS 过渡（Spring Transition），而非跳变。
  - **Status Indicators**: 使用 SF Symbols 风格的图标（如：🟢 Solving, 🟡 Optimizing, ✅ Completed）。
- **交互逻辑**:
  - 提供“实时日志（Live Log）”折叠视图，默认隐藏细节，仅显示关键里程碑。
  - 必须包含一个醒目的“紧急停止（Interrupt/Stop）”按钮，风格参照 iOS 的红色破坏性动作按钮。

## 4. 开发效能规范
- **Hot-swappable**: 确保在不修改核心循环的情况下，可以通过配置文件切换不同的求解器参数（如 Search Strategy）。
- **Mocking**: 能够通过 Rule 生成 Mock 数据流，以便在后端求解器未完成时，前端也能进行 UI 调试。