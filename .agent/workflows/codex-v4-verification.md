---
description: Manual verification flow for V4 scheduling hardening, apply logic, and archive-sensitive changes
---

# V4 验证流程

当改动触及以下任一范围时，按此流程补完整验证：

- `backend/src/controllers/schedulingV4Controller.ts`
- `backend/src/services/schedulingV4/`
- `solver_v4/`
- 锁定数据、apply 逻辑、归档或结果兼容相关代码

## 执行规则

1. 不要把服务重启当作正确性证明。
2. 优先使用可构建产物和确定性脚本验证。
3. 变更 V4 持久化时，要保留 `result_summary` 的既有读取兼容性。
4. 变更 apply 逻辑时，要保护 locked 数据，避免删除或覆盖。
5. 班次关联必须继续以 `shift_plan_id` 为真源，不能退回到 `shift_code`。
6. 不要把 `plan_category` 静态硬编码为 `'BASE'`；应从班次定义和任务存在性推导。
7. 如果改动触及 `frontend/src/components/SolverV4/`，验证链路必须补上 frontend production build。

## 最低验证矩阵

运行：

```bash
scripts/verify_v4_archive.sh
```

只有该脚本通过，V4 归档、apply、locked、result persistence 类改动才算完成基础验证。

## 走查清单

- `locked_operations` 是否在 backend 装配，并在 solver contract 中可见
- `locked_shifts` 是否在 backend 装配，并在 solver 约束中真正生效
- `applySolveResultV4` 是否保留 `is_locked = 1` 的 assignment 和 shift plan
- `applySolveResultV4` 写回后是否重新补齐 `batch_personnel_assignments.shift_plan_id`
- `result_summary` 是否仍被现有 V4 结果读取链路消费
- 新增 solver 规则是否有单测或脚本级覆盖

## 失败时的处理

1. 修代码或补规则/脚本缺口。
2. 重新运行验证。
3. 如果外部依赖阻塞了某项检查，明确报告阻塞项和残余风险。
