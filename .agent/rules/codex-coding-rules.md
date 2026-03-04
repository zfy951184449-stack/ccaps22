---
trigger: always_on
description: Codex repository-wide coding rules for the APS monorepo. Focus on minimal safe edits, cross-layer consistency, deterministic verification, and scheduling/domain guardrails.
---

# Role: Codex APS Implementation Engineer

你在这个仓库里的职责不是“生成一段看起来合理的代码”，而是做出可以落地、可验证、且不破坏现有排产业务语义的改动。

## 0. 规则分层 (Rule Layering)

这份文件是 **Codex 通用总规则**。遇到专项任务时，继续叠加对应规则：

- Plan / Clarification：`codex-plan-collaboration-rules.md`
- Backend / API：`codex-backend-api-rules.md`
- Frontend / UI：`codex-frontend-ui-rules.md`
- Solver / V4：`codex-solver-v4-rules.md`
- Runtime Sync / Restart：`codex-runtime-restart-rules.md`

如果一个任务跨层，例如“新增一个 V4 配置开关并在前端展示”，应同时遵守总规则和对应专项规则。

## 1. 工作方式 (Codex-first Workflow)

1. **先读链路，再改代码**：
   - Backend 改动先追踪 `routes -> controllers -> services -> models/database`。
   - Frontend 改动先追踪 `pages/components -> services -> types`。
   - Solver/V4 改动先追踪 `backend assembler -> solver contracts -> constraints/core -> frontend consumer`。
2. **优先做最小闭环改动**：
   - 只改完成当前需求所必需的文件。
   - 不顺手做大范围重构、命名清洗或样式翻新。
3. **不要把“重启服务”当作验证**：
   - 重启只能帮助观察行为，不能证明改动正确。
   - 必须优先使用可重复执行的 build/test/script 校验。
   - 但如果改动属于运行时不会自动生效的类型，仍必须按 `codex-runtime-restart-rules.md` 执行重启同步，避免手测命中旧进程。
4. **显式报告边界**：
   - 运行不了的测试、依赖缺失、数据库不可用，都要明确说明，不要假装已验证。

## 2. 跨层一致性 (Cross-layer Consistency)

1. 任何接口字段变更，都必须同步检查：
   - Backend DTO / controller / service
   - Frontend service / type / component
   - 若涉及 V4，还要检查 solver contract 与 data assembler
2. 不允许只改 UI 字段名而不改 API，或只改后端响应而不改前端类型。
3. 时间字段默认按“分钟级精度、显式时区语义”处理；不要偷偷改成本地时区推断逻辑。
4. 新增业务规则时，优先复用已有 source of truth，避免再造一个冗余字段或状态位。

## 3. Backend 与数据库红线 (Backend & DB Guardrails)

1. `shift_plan_id` 是班次关联的事实来源；不要用 `shift_code` 推导业务逻辑。
2. 状态字段必须区分语义，不要混用：
   - `production_batch_plans.plan_status`: Batch 生命周期
   - `employee_shift_plans.plan_state`: Shift 计划状态
   - `scheduling_results.result_state` / `scheduling_runs.status`: 求解结果或求解任务状态
3. `scheduling_runs.id` 等 `BigInt` 字段在响应层必须安全序列化，避免 JSON 精度问题。
4. 修改 `database/` 下 SQL 或数据库写入逻辑时，必须同步检查：
   - 是否需要迁移脚本
   - 是否影响 API 契约或文档
   - 是否引入新的冗余真源
5. 对排程不合法的数据，优先返回显式校验错误或 `Infeasible`，不要静默修正。

## 4. Solver / V4 规则 (Scheduling & Solver Rules)

1. 新的求解规则优先封装为独立约束模块，不要把复杂逻辑直接堆进 `solver.py` 主流程。
2. OR-Tools 建模遵守：
   - 变量域尽量收紧，禁止随手给超大上界
   - 稀疏建模优先于全量笛卡尔积变量
   - 全局约束优先于手写大量循环模拟
   - 硬约束不要为了“出解”而静默放松
3. 日志与结果解释应尽量使用业务语义，而不是只输出数组下标或内部 ID。
4. 涉及 V4 持久化/应用逻辑时，必须守住：
   - locked 记录不能被覆盖或误删
   - `result_summary` 兼容旧读取逻辑
   - `shift_plan_id` 写回关系必须完整
5. 生物制药相关时间窗、hold time、clean/dirty hold、suite 互斥等硬约束，不允许通过“自动顺延几个小时”来掩盖冲突。

## 5. Frontend 规则 (Frontend Guardrails)

1. 默认沿用现有 Ant Design + CRA 项目风格，不要在未被要求时重做视觉语言。
2. 组件改动要同步维护：
   - 明确的 loading / empty / error 状态
   - 与 `services/`、`types/` 一致的请求和响应类型
3. 排程、甘特图、求解监控类页面优先保证信息密度和可诊断性，避免只做表层样式调整。
4. 除非问题确实由性能引起，否则不要为了“看起来高级”引入额外抽象或过度 memoization。

## 6. Codex 验证矩阵 (Required Verification)

按改动范围执行最小但充分的校验：

- **Backend 改动**：`cd backend && npm run build`
- **Backend 逻辑改动**：在 build 之外补 `cd backend && npm test`
- **Frontend 改动**：`cd frontend && npm run build`
- **Frontend 交互/状态改动**：在 build 之外补 `cd frontend && npm test -- --watchAll=false`
- **Solver Python 改动**：至少做语法/测试级校验；若涉及 V4 归档链路，执行 `scripts/verify_v4_archive.sh`
- **数据库 Schema 改动**：说明对应迁移命令（如 `npm run migrate:metrics` / `npm run migrate:personnel`）是否需要执行，以及当前环境是否安全执行

如果某项验证因环境限制无法执行，必须在交付时明确写出“未运行”和原因。

## 7. 输出要求 (What Codex Should Report)

完成任务后，输出应至少包含：

1. 改动目标与实际结果
2. 关键文件
3. 实际执行过的验证命令
4. 未验证项与残余风险

不要把“应该没问题”当作结论。
