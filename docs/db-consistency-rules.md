# 数据库一致性与真源规则

本文件记录 APS 仓库中容易被混淆的数据库语义和字段真源，避免在后端、前端和 solver 链路中制造新的分叉。

## 1. 真源字段

### 1.1 班次关联

场景：`batch_personnel_assignments` 同时存在冗余的 `shift_code` 和真源 `shift_plan_id`。

规则：

- 必须通过 `shift_plan_id` 关联 `employee_shift_plans` 获取准确信息。
- 不要用 `batch_personnel_assignments.shift_code` 驱动业务判断，它可能已经过期。

```typescript
const assignment = await prisma.batch_personnel_assignments.findUnique({
  where: { id: 1 },
  include: {
    employee_shift_plans: {
      include: { shift_definitions: true },
    },
  },
});
```

### 1.2 状态字段

不要混淆不同实体的状态语义：

- `production_batch_plans.plan_status`: 批次生命周期
- `employee_shift_plans.plan_state`: 班次计划状态
- `scheduling_results.result_state`: 求解结果状态
- `scheduling_runs.status`: 求解任务状态

如果需求只说“plan status”，先确认它指的是 Batch、Shift 还是 Run。

## 2. 常见歧义澄清

### 2.1 `scheduling_runs`

- `status` 是大小写敏感字符串，不是 DB Enum。
- `period_start` / `period_end` 是用户可见的排程覆盖范围。
- `window_start` / `window_end` 是内部优化窗口，不应用于用户展示。

### 2.2 `shift_definitions.nominal_hours`

- 含义是计薪/标准工时，不一定等于 `end_time - start_time`。
- 成本与薪资计算优先使用该字段。
- 时间轴渲染优先使用 `start_time` 和 `end_time`。

### 2.3 `employee_shift_plans.shift_nominal_hours`

- 这是 `shift_definitions.nominal_hours` 在建计划时的快照。
- 历史还原和追溯时优先使用快照值，而不是回读当前班次定义。

## 3. 编码约束

### 3.1 中间态整数字段

`batch_operation_constraints.constraint_type` 是整数中间字段：

- `0`: Start-Start
- `1`: Finish-Start
- `2`: Start-Finish
- `3`: Finish-Finish

使用时应定义常量或 Enum helper，不要直接裸写魔法数字。

### 3.2 ID 类型

- `scheduling_runs.id` 是 `BigInt`
- `batch_personnel_assignments.id` 是 `Int`

跨表拼装或 API 返回时，必须显式处理 `BigInt` 序列化。

## 4. 快速自检

- 是否使用了 `shift_plan_id` 而不是 `shift_code`
- 是否区分了 Batch / Shift / Run 的状态字段
- 是否处理了 `BigInt` 序列化
- 用户可见时间范围是否使用了 `period_start` / `period_end`
