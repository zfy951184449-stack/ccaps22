# 排班算法中工时概念完整说明

本文档详细说明当前v4排班算法中所有与工时相关的概念、定义、计算方式和用途。

## 目录
1. [基础工时概念](#基础工时概念)
2. [时间维度工时](#时间维度工时)
3. [工时制相关概念](#工时制相关概念)
4. [特殊工时概念](#特殊工时概念)
5. [目标与标准工时](#目标与标准工时)
6. [工时计算规则](#工时计算规则)

---

## 基础工时概念

### 1. planHours（计划工时）

**定义**：排班计划中的基础工时，表示员工在某个日期被安排的工作时间。**planHours应该使用班次标准工时（nominalHours），而不是操作时长**。

**计算方式**：
- **有操作任务时**：根据操作时间推断班次类型，使用该班次的`nominalHours`（班次标准工时）
  - DAY班次（常日班）：8小时
  - LONGDAY班次（长日班）：11小时
  - NIGHT班次（夜班）：11小时
- **补充班次时**：`planHours = 已有工时 + 新增工时`（累计值）
- **默认值**：如果无法推断班次，则使用DAY班次的标准工时（8小时）

**代码位置**：
- `mlSchedulingService.ts:376` - `inferShiftNominalHours`函数，根据操作时间推断班次并返回nominalHours
- `mlSchedulingService.ts:401` - v4优化阶段，使用班次标准工时
- `mlSchedulingService.ts:1196` - v3优化阶段，使用班次标准工时
- `workloadBalancer.ts:1791` - 补充班次时累计

**示例**：
- 员工参与1小时操作，班次为常日班：`planHours = 8`（DAY班次标准工时）
- 员工参与8小时操作，班次为常日班：`planHours = 8`（DAY班次标准工时）
- 员工参与夜班操作：`planHours = 11`（NIGHT班次标准工时）
- 补充班次增加4小时：`planHours = 已有工时 + 4`

**重要说明**：
- **planHours表示班次标准工时，不是操作时长**
- 即使操作只有1小时，如果班次是常日班，planHours也应该是8小时

---

### 2. overtimeHours（加班工时）

**定义**：超出正常工作时间的工作时长，不计入总工时统计。

**计算方式**：
- 通常由业务逻辑设置，表示加班时长
- 在综合工时制下，有特殊的加班计算规则

**代码位置**：
- `workloadBalancer.ts:1792` - 补充班次时设为0
- `comprehensiveWorkTimeAdapter.ts:698` - 综合工时制加班计算

**重要说明**：
- **加班工时不计入总工时**（根据用户要求）
- 总工时 = `planHours`（不包括 `overtimeHours`）

**示例**：
- 员工正常班次：`overtimeHours = 0`
- 员工加班2小时：`overtimeHours = 2`（但不计入总工时）

---

### 3. totalHours（总工时）

**定义**：员工在某个时间段的累计总工时。

**当前计算方式**（需要修复）：
```typescript
const hours = schedule.planHours + schedule.overtimeHours;
totalHours += hours;
```

**正确计算方式**（根据用户要求）：
```typescript
const hours = schedule.planHours; // 只计算 planHours，不包括 overtimeHours
totalHours += hours;
```

**代码位置**：
- `workloadBalancer.ts:246` - 当前计算（需要修复）
- `comprehensiveWorkTimeAdapter.ts:672` - 周期累计工时计算

**示例**：
- 员工某天：`planHours = 8`, `overtimeHours = 2`
- 当前总工时 = 8 + 2 = 10小时（错误）
- 正确总工时 = 8小时（只计算 planHours）

---

## 时间维度工时

### 4. dailyHours（日度工时）

**定义**：员工在单日的累计工时。

**计算方式**：
```typescript
dailyHours = planHours + overtimeHours  // 当前实现（需要修复）
// 正确应该是：dailyHours = planHours
```

**代码位置**：
- `workloadBalancer.ts:253` - 日度工时统计
- `EmployeeWorkloadStats.dailyHours` - Map<date, hours>

**示例**：
- 2025-10-29：`dailyHours = 8`

---

### 5. weeklyHours（周度工时）

**定义**：员工在ISO周内的累计工时。

**计算方式**：
```typescript
weekKey = `${year}-W${week}`  // ISO周格式，如 "2025-W44"
weeklyHours = 周内所有日期的 dailyHours 累加
```

**代码位置**：
- `workloadBalancer.ts:264` - 周度工时统计
- `EmployeeWorkloadStats.weeklyHours` - Map<weekKey, hours>

**目标工时**：
- 默认：40小时/周

**示例**：
- 2025-W44：`weeklyHours = 40`

---

### 6. monthlyHours（月度工时）

**定义**：员工在单月内的累计工时。

**计算方式**：
```typescript
monthKey = "YYYY-MM"  // 如 "2025-10"
monthlyHours = 月内所有日期的 dailyHours 累加
```

**代码位置**：
- `workloadBalancer.ts:257` - 月度工时统计
- `EmployeeWorkloadStats.monthlyHours` - Map<monthKey, hours>

**目标工时**：
- 标准工时制：`月度工作日 × 8小时`
- 综合工时制：`月度标准工时 ± 10%`（如 166.64小时 ± 10%，即 150-183小时）

**示例**：
- 2025-10：`monthlyHours = 176`（22个工作日 × 8小时）

---

### 7. quarterHours（季度工时）

**定义**：员工在单季度内的累计工时。

**计算方式**：
```typescript
quarterHours = 季度内所有日期的 dailyHours 累加
```

**代码位置**：
- `workloadBalancer.ts:275` - 季度工时统计
- `EmployeeWorkloadStats.quarterHours` - number

**目标工时**：
- 标准工时制：`季度工作日 × 8小时`
- 综合工时制：
  - 下限：`max(500小时, 季度标准工时)`（最低不低于500小时）
  - 上限：540小时
  - 标准：`季度工作日 × 8小时`（动态计算）

**示例**：
- Q4 2025：`quarterHours = 488`（61个工作日 × 8小时）
- 综合工时制约束：500-540小时

---

## 工时制相关概念

### 8. comprehensivePeriodHours（综合工时制周期工时）

**定义**：员工在综合工时制周期内的累计工时。

**计算方式**：
```typescript
// 排除法定节假日
comprehensivePeriodHours = calculatePeriodAccumulatedHoursFromSchedules(
  schedules,
  periodStart,
  periodEnd,
  true  // excludeLegalHolidays = true
)
```

**代码位置**：
- `comprehensiveWorkTimeAdapter.ts:285` - 周期工时计算
- `EmployeeWorkloadStats.comprehensivePeriodHours` - number

**周期类型**：
- `WEEK`：周
- `MONTH`：月
- `QUARTER`：季度（常用）
- `YEAR`：年

**目标工时**：
- 从 `employee_shift_limits.comprehensive_target_hours` 读取
- 或根据周期类型动态计算

---

### 9. normalHours（正常工时）

**定义**：排除法定节假日后的累计工时。

**计算方式**：
```typescript
// 只统计非法定节假日的工时
normalHours = 总工时 - 法定节假日工时
```

**代码位置**：
- `comprehensiveWorkTimeAdapter.ts:659` - 正常工时统计
- `PeriodAccumulatedHoursDetail.normalHours` - number

**用途**：
- 用于综合工时制约束检查
- 法定节假日工时需要3倍工资

---

### 10. legalHolidayHours（法定节假日工时）

**定义**：在法定节假日期间的工作时长（需要3倍工资）。

**计算方式**：
```typescript
// 只统计法定节假日的工时
if (legalHolidaySet.has(s.date)) {
  legalHolidayHours += hours;
}
```

**代码位置**：
- `comprehensiveWorkTimeAdapter.ts:676` - 法定节假日工时统计
- `PeriodAccumulatedHoursDetail.legalHolidayHours` - number

**工资规则**：
- 法定节假日：3倍工资
- 调休休息日：2倍工资或补休

---

## 特殊工时概念

### 11. shopfloorHours（车间工时）

**定义**：员工执行操作任务（operationPlanId > 0）的累计工时。

**计算方式**：
```typescript
shopfloorHours = 0
schedules.forEach((schedule) => {
  if (schedule.operationPlanId && schedule.operationPlanId > 0) {
    shopfloorHours += schedule.planHours + schedule.overtimeHours;
  }
});
```

**代码位置**：
- `workloadBalancer.ts:655` - 车间工时计算
- `multiObjectiveOptimizer.ts:1080` - 车间工时均衡度计算

**用途**：
- 确保一线员工之间操作任务工时相对均衡
- 实现劳动公平性
- v4新增：优先均衡一线员工车间工时

**目标占比**：
- 默认：车间工时占总工时的70%（`targetRatio = 0.7`）

**示例**：
- 员工总工时：100小时
- 车间工时：70小时（操作任务）
- 补充班次：30小时（非操作任务）
- 车间工时占比：70%

---

### 12. accumulatedHours（累计工时）

**定义**：初始工时 + 已生成的调整建议工时。

**计算方式**：
```typescript
const initialHours = schedules.reduce(
  (sum, s) => sum + s.planHours + s.overtimeHours, 0
);
const adjustmentHours = adjustments
  .filter(adj => adj.action === "ADD" || adj.action === "MODIFY")
  .reduce((sum, adj) => sum + adj.planHours + adj.overtimeHours, 0);
accumulatedHours = initialHours + adjustmentHours;
```

**代码位置**：
- `workloadBalancer.ts:910` - 累计工时计算
- `workloadBalancer.ts:946` - 季度累计工时计算
- `workloadBalancer.ts:1029` - 月度累计工时计算

**用途**：
- 在工时均衡阶段，累计前面阶段已生成的调整建议
- 避免多阶段补足叠加导致的工时超标

**示例**：
- 初始工时：400小时
- 季度均衡调整：+100小时
- 月度均衡调整：+20小时
- 累计工时：400 + 100 + 20 = 520小时

---

## 目标与标准工时

### 13. targetHours（目标工时）

**定义**：员工在某个时间段应该达到的工时目标。

**类型**：
- `quarterTargetHours`：季度目标工时
- `monthTargetHours`：月度目标工时
- `weekTargetHours`：周度目标工时（默认40小时）
- `comprehensiveTargetHours`：综合工时制周期目标工时

**计算方式**：
- 标准工时制：`工作日数 × 8小时`
- 综合工时制：从数据库 `employee_shift_limits` 表读取

**代码位置**：
- `workloadBalancer.ts:229` - 季度目标工时
- `workloadBalancer.ts:297` - 月度目标工时
- `workloadBalancer.ts:302` - 周度目标工时

---

### 14. standardHours（标准工时）

**定义**：根据工作日数计算的标准工时。

**计算方式**：
```typescript
// 季度标准工时
const quarterWorkingDays = await calculateWorkingDays(quarterStart, quarterEnd);
const quarterStandardHours = quarterWorkingDays * 8;

// 月度标准工时
const monthWorkingDays = await calculateWorkingDays(monthStart, monthEnd);
const monthStandardHours = monthWorkingDays * 8;
```

**代码位置**：
- `workloadBalancer.ts:934` - 季度标准工时计算
- `workloadBalancer.ts:1040` - 月度标准工时计算

**示例**：
- Q4 2025：61个工作日 → 488小时
- 2025-10：22个工作日 → 176小时

---

### 15. nominalHours（班次标准工时）

**定义**：班次定义中的标准工时（折算工时）。

**数据来源**：
- `shift_definitions.nominal_hours` 字段

**常见值**：
- DAY（常日班）：8小时
- LONGDAY（长日班）：11小时
- NIGHT（夜班）：11小时

**代码位置**：
- `mlSchedulingService.ts:1621` - 从数据库读取
- `schedulingService.ts:934` - 班次定义

**用途**：
- 判断班次类型
- 计算班次标准工时
- 当前未用于 `planHours` 计算（需要修复）

**示例**：
- DAY班次：`nominalHours = 8`
- NIGHT班次：`nominalHours = 11`

---

## 工时计算规则

### 16. 总工时计算公式

**当前实现**（需要修复）：
```typescript
总工时 = planHours + overtimeHours
```

**正确实现**（根据用户要求）：
```typescript
总工时 = planHours  // 加班工时不计入总工时
```

**代码位置**：
- `workloadBalancer.ts:246` - 需要修复
- `comprehensiveWorkTimeAdapter.ts:672` - 需要修复

---

### 17. 车间工时计算公式

```typescript
车间工时 = Σ(planHours + overtimeHours)  // 只统计 operationPlanId > 0 的记录
```

**代码位置**：
- `workloadBalancer.ts:658` - 车间工时计算

---

### 18. 综合工时制约束规则

**季度约束**：
- 下限：`max(500小时, 季度标准工时)`（最低不低于500小时）
- 上限：540小时
- 标准：`季度工作日 × 8小时`（动态计算）

**月度约束**：
- 标准：`月度工作日 × 8小时`（动态计算）
- 下限：标准工时 × 90%
- 上限：标准工时 × 110%

**代码位置**：
- `workloadBalancer.ts:942` - 季度约束
- `workloadBalancer.ts:1047` - 月度约束

---

### 19. 综合工时制加班计算

**规则**：
- 如果周期累计工时 ≤ 目标工时 × 110%：无加班
- 如果周期累计工时 > 目标工时 × 110%：超出部分视为加班

**计算公式**：
```typescript
const upperLimit = targetHours * 1.1;  // 110%上限
if (totalHours <= upperLimit) {
  return 0;  // 无加班
}
return totalHours - upperLimit;  // 超出部分为加班
```

**代码位置**：
- `comprehensiveWorkTimeAdapter.ts:698` - 加班计算

---

## 总结

### 工时概念分类

1. **基础工时**：
   - `planHours`：计划工时（操作时长）
   - `overtimeHours`：加班工时（不计入总工时）
   - `totalHours`：总工时（= planHours）

2. **时间维度工时**：
   - `dailyHours`：日度工时
   - `weeklyHours`：周度工时
   - `monthlyHours`：月度工时
   - `quarterHours`：季度工时

3. **工时制相关**：
   - `comprehensivePeriodHours`：综合工时制周期工时
   - `normalHours`：正常工时（排除法定节假日）
   - `legalHolidayHours`：法定节假日工时（3倍工资）

4. **特殊工时**：
   - `shopfloorHours`：车间工时（操作任务工时）
   - `accumulatedHours`：累计工时（初始 + 调整建议）

5. **目标与标准**：
   - `targetHours`：目标工时
   - `standardHours`：标准工时（工作日 × 8）
   - `nominalHours`：班次标准工时

### 需要修复的问题

1. ✅ **planHours定义**：已修复，现在使用班次标准工时（nominalHours）而非操作时长
2. ✅ **总工时计算**：已修复，现在只计算planHours，不包括overtimeHours

---

**文档版本**：v1.0  
**最后更新**：2025-01-XX  
**维护者**：开发团队

