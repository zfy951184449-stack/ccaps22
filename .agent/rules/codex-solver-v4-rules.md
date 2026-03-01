---
trigger: model_decision
description: Codex solver/V4 rules for OR-Tools scheduling work in the APS monorepo. Apply when changing solver contracts, constraint modules, data assembler logic, result application, or solver-related frontend flows.
---

# Role: Codex Solver V4 Engineer

适用范围：

- `solver_v4/`
- `backend/src/services/schedulingV4/`
- `backend/src/controllers/schedulingV4Controller.ts`
- 与 V4 请求组装、求解结果应用、locked 数据持久化相关的代码

## 1. 先读完整链路

1. 按顺序追踪：
   - backend data assembler
   - solver contracts
   - solver core / constraints
   - apply result / persistence
   - frontend result consumer
2. 不要只在 solver 内部改字段名或约束开关而忽略 assembler 和 consumer。
3. 新增规则前，先确认它属于：
   - 输入校验
   - 硬约束
   - 软约束
   - 结果解释 / 展示

## 2. 建模红线

1. 新规则优先独立成约束模块，不要把复杂逻辑硬塞到主求解流程。
2. 变量域尽量收紧，优先稀疏建模，避免无意义笛卡尔积变量。
3. 全局约束优先；避免用手工循环模拟本可表达为全局约束的逻辑。
4. 不要为了“更容易出解”而静默放松硬约束。
5. 如果业务上不可行，应显式输出 `Infeasible` 或清晰的失败原因。

## 3. V4 持久化与兼容性

1. `locked_operations`、`locked_shifts` 不能被覆盖、误删或在 apply 阶段失效。
2. `result_summary` 需要保持旧读取链路可用，除非明确一起升级所有消费者。
3. `shift_plan_id` 写回必须完整，不能退回到依赖 `shift_code` 的旧逻辑。
4. 结果应用逻辑不要通过粗暴清空再重建破坏锁定数据和历史语义。

## 4. 生物制药与排程语义

1. Hold time、zero-wait、DHT/CHT、suite 互斥等属于业务硬边界时，不要用自动顺延掩盖冲突。
2. 求解日志和诊断输出优先使用业务语言，不要只暴露内部索引。
3. 前后端展示的状态命名、资源语义、时间语义必须和 solver 约束一致。

## 5. Solver 验证

至少执行与改动相符的验证：

- Python 语法或测试级校验
- `scripts/verify_v4_archive.sh`（涉及 V4 归档、apply、locked、result persistence 时）
- `cd backend && npm run build`（assembler / controller / service 有改动时）
- `cd frontend && npm run build`（前端 Solver V4 展示有改动时）

只要涉及 `solver_v4/**/*.py`、assembler、contract、apply 流程或联动 API，按 `codex-runtime-restart-rules.md` 重启 solver；必要时同步重启 backend，避免拿旧模型内存做手测。

如果验证被环境阻塞，必须明确指出阻塞项，而不是仅说明“理论上通过”。
