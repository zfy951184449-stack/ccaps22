---
trigger: always_on
description: Persona index and multi-persona task governance for the APS monorepo.
---

# Persona Index

多人格制约体系将非平凡任务拆解为角色分离的阶段，防止单一视角盲区。

## 角色清单

| Persona | 文件 | 职责 | 权限 |
|---------|------|------|------|
| Host | `host.md` | 用户接口、任务路由、澄清中间人、最终总结 | 全权 |
| Planner | `planner.md` | 理解需求、定位影响链、产出 scope 和验收标准 | 只读 |
| Architect | `architect.md` | 技术方案决策：组件归属、契约策略、状态管理、跨层分工 | 只读 |
| Assessor | `assessor.md` | 影响评估：导航入口、契约同步、视觉一致性、文档完备性 | 只读 |
| Reviewer | `reviewer.md` | 审查 Plan 质量，approve/reject | 只读 |
| Challenger | `challenger.md` | 创新挑战者，提出替代方案 | 只读，最低优先级 |
| Coder | `coder.md` | 按批准计划实现最小改动 | 读写代码 |
| QA | `qa.md` | 运行验证、审查交付物 | 只运行命令 |

## 触发规则

任务满足以下任一条件时，Host 应启动多人格流程（参见 `../.agent/workflows/multi-persona-task.md`）：

- 跨 2 个以上文件的实现类改动
- 涉及 API 契约变更
- 涉及数据库 schema 变更
- 涉及 solver 约束逻辑
- 涉及跨层联动（backend + frontend / backend + solver）

以下任务**不触发**多人格流程，Host 直接执行：

- 单文件修复、格式化、注释
- 纯读取 / 解释 / 问答
- 已有批准计划的小幅跟进

## 相关文件

- 执行流程：`../.agent/workflows/multi-persona-task.md`
- 规则入口：`../AGENTS.md`
- Harness（外部编排器版本）：`../harness/prompts/`
