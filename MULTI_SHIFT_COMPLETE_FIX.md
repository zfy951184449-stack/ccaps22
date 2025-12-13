# 多班次问题最终修复方案

## 问题回顾

用户报告：同一员工在同一天被分配了多个班次（例如：常日班操作 + 夜班），即使在修复aggregateShiftPlans后问题仍然存在。

##  真正的根本原因

**求解器的shift plan生成逻辑有BUG**

### 错误代码位置

`solver/server.py` 第2271-2280行（修复前）：

```python
segments = _segment_operations_by_time(date_key, operations)
for segment in segments:
    plan = _create_operation_shift_plan(emp_id, date_key, segment, shift_cache)
    if plan:
        shift_plans.append(plan)
```

### 问题分析

`_segment_operations_by_time` 函数会根据操作的时间重叠情况将操作分段：

- 如果操作时间重叠（例如09:00-12:00 和 10:00-14:00），它们会被分在同一个segment
- 如果操作时间**不重叠**（例如09:00-10:00 和 14:00-18:00），它们会被分成**两个segment**

**这导致**：同一天的两个不重叠操作会生成**两个shift plan**！

### 实际案例

**员工46 (刘天畅) - 2026年1月19日：**

- 操作918: 09:00-10:00 (1小时，上午) → 生成shift plan 1 (8h标准班次)
- 操作919: 14:00-18:00 (4小时，下午) → 生成shift plan 2 (11h标准班次)

两个操作都是日班，但因为时间不重叠，被分成两个shift plan，违反了"每天一个班次"的硬约束。

## 完整修复方案

### 修复1：求解器输出（✅ 已修复）

**文件：** `solver/server.py`  
**位置：** 第2271-2281行

**修复前：**
```python
segments = _segment_operations_by_time(date_key, operations)
for segment in segments:
    plan = _create_operation_shift_plan(emp_id, date_key, segment, shift_cache)
    if plan:
        shift_plans.append(plan)
        if _plan_requires_night_rest(plan):
            register_rest(emp_id, date_key)
```

**修复后：**
```python
# 关键修复：同一天的所有操作应该合并为一个班次
# 不再按时间分段，因为这违反了"每天一个班次"的约束
plan = _create_operation_shift_plan(emp_id, date_key, operations, shift_cache)
if plan:
    shift_plans.append(plan)
    if _plan_requires_night_rest(plan):
        register_rest(emp_id, date_key)
```

### 修复2：后端聚合（✅ 已修复 - 作为额外保护）

**文件：** `backend/src/services/autoSchedulingService.ts`  
**位置：** 第779-829行

**修复：** 移除aggregation key中的 `shiftCode`，确保即使求解器错误输出多个shift plan，后端也会合并它们。

```typescript
const key = [
    plan.employeeId,
    plan.date,
    (plan.planType || 'BASE').toUpperCase(),
    // 移除 shiftCode - 确保同一天只有一条记录
].join('|');
```

## 验证硬约束

### 求解器层面（✅ 正确）

```python
# solver/server.py:447
model.Add(prod_var + base_var + rest_var == 1)
```

这确保每个员工每天只能有一个班次类型（PRODUCTION/BASE/REST）。

### 输出层面（✅ 已修复）

修复后，求解器输出的shift plans确保每个员工每天只有一个shift plan。

### 持久化层面（✅ 已修复）

后端的aggregation作为二次保护，确保数据库中每个员工每天只有一条班次记录。

## 修改的文件

1. **`/Users/zhengfengyi/ccaps22/solver/server.py`** (第2271-2281行)
   - 移除时间分段逻辑
   - 同一天所有操作合并为一个shift plan

2. **`/Users/zhengfengyi/ccaps22/backend/src/services/autoSchedulingService.ts`** (第779-829行)
   - 修改聚合键，移除shiftCode
   - 添加合并逻辑，选择最长班次定义

## 已执行的操作

1. ✅ 修改求解器shift plan生成逻辑
2. ✅ 修改后端聚合逻辑
3. ✅ 重启后端服务器 (端口3001)
4. ✅ 重启求解器服务 (端口5005)

## 验证方法

运行以下脚本确认修复：

```bash
cd /Users/zhengfengyi/ccaps22/backend
npx ts-node check_duplicate_shifts.ts
```

**期望结果：**
```
✅ 未发现同一员工同一天有多条班次记录的情况
```

## 为什么之前的修复无效？

1. **第一次修复（aggregateShiftPlans）**：只修复了后端聚合逻辑，但求解器仍然输出多个shift plan
2. **重启问题**：修改后端代码后没有重启后端服务器，导致修改未生效
3. **根本原因未解决**：真正的问题在求解器的shift plan生成逻辑，直到现在才修复

## 测试建议

1. **创建新的排班任务**
2. **选择包含多个操作的批次**（确保有同一天的多个非重叠操作）
3. **运行自动排班**
4. **检查结果**：
   ```bash
   npx ts-node check_duplicate_shifts.ts
   ```
5. **验证前端显示**：确认每个员工每天只显示一个班次

## 诊断工具

- [check_duplicate_shifts.ts](file:///Users/zhengfengyi/ccaps22/backend/check_duplicate_shifts.ts) - 检查重复班次记录
- [analyze_operation_timing.ts](file:///Users/zhengfengyi/ccaps22/backend/analyze_operation_timing.ts) - 分析操作时间关系

## 后续建议

1. **数据清理**：清理现有的重复记录
2. **添加数据库约束**：
   ```sql
   ALTER TABLE employee_shift_plans 
   ADD UNIQUE INDEX uk_employee_date_category (employee_id, plan_date, plan_category);
   ```
3. **监控**：定期运行检查脚本确保问题不再出现
4. **单元测试**：为求解器的shift plan生成逻辑添加测试

## 移除的函数

`_segment_operations_by_time` 函数现在未使用，可以考虑删除（第2470-2509行）。
