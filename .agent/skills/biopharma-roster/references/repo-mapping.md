# Roster Repo Mapping (Global)

## 1. API/DTO mapping

- 人员分配接口应保留独立语义字段：
  - `qualification_constraint`
  - `handover_overlap`
  - `cross_zone_gowning_time`
  - `min_rest_between_shifts`
- 不得把以上字段塞进单一“notes”文本。

## 2. Solver mapping

- 先做资格过滤，再做班次覆盖。
- 连续工艺窗口使用硬约束保证无缝交接。
- 休息与连续工作天数可以 hard/soft 配置，但必须显式。

## 3. UI mapping

- 排班界面需显式展示资质不足、交接缺口、休息冲突。
- 与工艺排程联动时，冲突应可追溯至 `constraint_code`。

## 4. Skill routing

| 场景 | 触发 |
| --- | --- |
| 只看班次/资质/休息 | `biopharma-roster` |
| 只看工艺/设备/放行 | `biopharma-cmo` |
| 工艺与人员耦合 | 双触发（必须） |
