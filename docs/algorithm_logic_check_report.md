# 算法逻辑检查报告：操作分配与班次推断

## 用户要求

当某日有操作耗时1h和1人次时：
1. 会为这个操作安排一个人 ✅
2. 这个人的班次需要包含这个操作开始到结束的时间（例如操作开始时间为9:00）
3. 可以为对应的操作员安排常日班（DAY）或者长白班（LONGDAY）
4. 假设安排常日班，这个人当天的总工时为8h（planHours），车间工时为1h（操作时长）

## 当前算法检查结果

### ✅ 符合的部分

1. **操作分配**：
   - 优化器会确保操作被分配（通过覆盖率检查）
   - 多目标优化算法会尝试满足`requiredPeople`要求

2. **班次推断**：
   - 在`inferShiftNominalHours`和`persistSchedule`中都有班次推断逻辑
   - 根据操作开始时间（startHour）和结束时间（endHour）推断班次
   - 可以推断DAY、LONGDAY、NIGHT班次

3. **总工时设置**：
   - `planHours`设置为班次标准工时（DAY=8h, LONGDAY=11h, NIGHT=11h）
   - 符合要求：安排常日班时，总工时为8h

### ❌ 不符合的部分

1. **班次时间范围验证缺失**：
   - **问题**：当前推断逻辑只检查操作时长和开始/结束小时，但没有验证班次的时间范围（`start_time`和`end_time`）是否包含操作时间
   - **示例**：操作9:00开始，但DAY班次可能是08:30-17:00，需要验证9:00是否在08:30-17:00范围内
   - **位置**：`mlSchedulingService.ts` 第1254-1273行（`inferShiftNominalHours`）和第1900-1920行（`persistSchedule`中的班次推断）

2. **车间工时计算错误**：
   - **问题**：车间工时计算使用的是`planHours + overtimeHours`（班次标准工时），而不是操作实际时长
   - **当前逻辑**：
     ```typescript
     // workloadBalancer.ts 第773行
     shopfloorHours += schedule.planHours + schedule.overtimeHours;
     ```
   - **问题**：如果操作1h，但`planHours=8h`（DAY班次），车间工时会被计算为8h，而不是1h
   - **应该**：车间工时应该是操作实际时长（`planned_end_datetime - planned_start_datetime`），而不是`planHours`

3. **操作时长未单独记录**：
   - **问题**：当前没有单独记录操作实际时长的字段
   - **影响**：无法准确计算车间工时（操作时长）

## 需要修复的问题

### 问题1：班次时间范围验证

**当前代码**（`mlSchedulingService.ts` 第1900-1920行）：
```typescript
// 根据时间范围和工时推断班次
if (duration >= (nightShift?.nominalHours ?? 11) || startHour >= 19 || (endHour >= 0 && endHour < 6)) {
  shiftCodeUpper = nightShift?.shiftCode || longDayShift?.shiftCode || dayShift?.shiftCode || "";
} else if (duration >= (longDayShift?.nominalHours ?? 11) || endHour >= 21) {
  shiftCodeUpper = longDayShift?.shiftCode || dayShift?.shiftCode || "";
} else {
  shiftCodeUpper = dayShift?.shiftCode || shiftDefinitions[0]?.shiftCode || "";
}
```

**问题**：没有验证操作时间是否在班次时间范围内

**修复建议**：
```typescript
// 验证操作时间是否在班次时间范围内
const operationStartTime = start.format("HH:mm:ss");
const operationEndTime = end.format("HH:mm:ss");

// 检查DAY班次是否包含操作时间
if (dayShift) {
  const shiftStart = dayShift.startTime;
  const shiftEnd = dayShift.endTime;
  const isCrossDay = dayShift.isCrossDay;
  
  // 验证操作时间是否在班次时间范围内
  if (isTimeInShiftRange(operationStartTime, operationEndTime, shiftStart, shiftEnd, isCrossDay)) {
    shiftCodeUpper = "DAY";
  }
}
```

### 问题2：车间工时计算

**当前代码**（`workloadBalancer.ts` 第773行）：
```typescript
shopfloorHours += schedule.planHours + schedule.overtimeHours;
```

**问题**：使用`planHours`（班次标准工时）而不是操作实际时长

**修复建议**：
- 需要从`batch_operation_plans`表查询操作实际时长
- 或者，在`ScheduleRecord`中添加`operationDuration`字段记录操作实际时长
- 车间工时应该使用操作实际时长，而不是`planHours`

## 总结

当前算法**部分符合**用户要求：
- ✅ 操作会被分配
- ✅ 班次会被推断（DAY/LONGDAY/NIGHT）
- ✅ 总工时设置为班次标准工时（8h）
- ❌ **班次时间范围未验证**（操作时间可能不在班次时间范围内）
- ❌ **车间工时计算错误**（使用8h而不是1h）

需要修复这两个问题才能完全符合用户要求。

