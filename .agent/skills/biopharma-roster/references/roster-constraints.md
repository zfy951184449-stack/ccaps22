# Roster Constraints (Global)

本文件定义生物制药排班约束语义。

## 1. Constraint categories

1. `ROSTER_QUALIFICATION`: 资质、SOP、区域准入、有效期
2. `ROSTER_HANDOVER`: 班次交接重叠与连续覆盖
3. `ROSTER_TRANSITION`: 跨区更衣/脱衣与进入耗时
4. `ROSTER_REST`: 最小休息、最大连续工作天数、夜班上限

## 2. Mandatory rule interface

每条排班规则必须表达：

- `constraint_code`
- `severity`
- `hard_or_soft`
- `violation_message_template`
- `qualification_constraint`
- `handover_overlap`
- `cross_zone_gowning_time`
- `min_rest_between_shifts`

## 3. Handover and continuity

- 连续工艺（例如长时 USP）禁止无人值守窗口。
- 交接必须有显式 `handover_overlap`（例如 30 分钟）。
- 交接期间两班都应计入占用，不能虚拟并班。

## 4. Qualification and expiry

- 资格校验应包含：岗位、区域、产品/SOP。
- 若资格在任务期间过期，视为不可执行或硬违规。

## 5. Transition and gowning

- 跨区域必须建模 `cross_zone_gowning_time`。
- 不能假设操作员在区域间瞬时移动。

## 6. Rest and labor safeguards

- 至少校验 `min_rest_between_shifts`。
- 推荐校验 `max_consecutive_days_worked` 与夜班上限。
- 不得以“人工可协调”忽略法定/安全休息约束。

## 7. Violation output expectations

违规输出至少包含：

- `constraint_code`
- `is_violated`
- `affected_personnel`
- `affected_tasks`
- `time_window`
- `violation_reason`
- `recommended_non_silent_action`
