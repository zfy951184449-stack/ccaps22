# 修复每日多班次问题

## 问题描述

用户报告：同一员工在同一天被分配了多个班次（例如日班+夜班）。

## 根本原因分析

### 求解器约束（✅ 正确）

求解器中有**硬约束**确保每天只有一个班次类型：

```python
# solver/server.py 第447行
model.Add(prod_var + base_var + rest_var == 1)
```

这确保每个员工每天只能是以下之一：
- `PRODUCTION`（生产班）
- `BASE`（基础班）
- `REST`（休息）

### 持久化逻辑（❌ 有BUG）

问题出在 `backend/src/services/autoSchedulingService.ts` 的 `aggregateShiftPlans` 函数。

**错误的聚合键（修复前）：**

```typescript
const key = [
    plan.employeeId,
    plan.date,
    (plan.planType || 'BASE').toUpperCase(),
    (plan.shiftCode || plan.shiftName || '').toUpperCase(),  // ← 问题！
].join('|');
```

这导致同一天的不同班次编码（例如 `DAY_SHIFT` 和 `NIGHT_SHIFT`）被视为不同的记录。

## 实际案例

**员工 43 (郭红) - 2026年1月1日：**

- 记录1：PRODUCTION, 8.00h标准, 操作847 (日班)
- 记录2：PRODUCTION, 11.00h标准, 操作1138 (夜班)

两条记录都是 `PRODUCTION` 类型但有不同的 `shift_nominal_hours`（8小时 vs 11小时），说明是不同的班次定义。

## 修复方案

### 修改聚合键

**正确的聚合键（修复后）：**

```typescript
const key = [
    plan.employeeId,
    plan.date,
    (plan.planType || 'BASE').toUpperCase(),
    // 移除 shiftCode/shiftName
].join('|');
```

### 合并逻辑

当同一天有多个班次时（例如日班+夜班），现在会：

1. **合并工时**：`existing.planHours = currentHours + addedHours`
2. **使用最长班次定义**：选择标准工时更长的班次（例如11h夜班 > 8h日班）
3. **合并操作**：将所有操作合并到一条记录

```typescript
// 如果新班次的标准工时更长，使用新班次的定义
const existingNominal = Number(existing.shiftNominalHours ?? 0);
const newNominal = Number(plan.shiftNominalHours ?? 0);
if (newNominal > existingNominal) {
    existing.shiftId = plan.shiftId;
    existing.shiftCode = plan.shiftCode;
    existing.shiftNominalHours = plan.shiftNominalHours;
    // ...
}
```

## 修复效果

### 修复前
```
2026-01-01:
  - PRODUCTION, 8h (日班), 操作847
  - PRODUCTION, 11h (夜班), 操作1138
```

### 修复后
```
2026-01-01:
  - PRODUCTION, 11h (夜班定义), 包含操作847和1138
```

## 验证方法

运行检查脚本：

```bash
cd backend
npx ts-node check_duplicate_shifts.ts
```

期望结果：
```
✅ 未发现同一员工同一天有多条班次记录的情况
```

## 约束确认

### 🔴 硬约束（求解器层面）

**每日班次类型互斥**：

```python
# solver/server.py:447
model.Add(prod_var + base_var + rest_var == 1)
```

每个员工每天**必须**且**只能**是以下之一：
- PRODUCTION
- BASE  
- REST

**不可违反**，求解器会拒绝任何违反此约束的解。

### ✅ 数据层面（持久化）

修复后，持久化逻辑确保：
- 同一员工同一天同一类型（如PRODUCTION）**只有一条记录**
- 如果求解器输出多个操作在同一天（例如日班操作+夜班操作），它们会被**合并**到同一条班次记录

## 影响的文件

- **修改：** `/Users/zhengfengyi/ccaps22/backend/src/services/autoSchedulingService.ts`
  - 函数：`aggregateShiftPlans` (第779-829行)
  
## 后续建议

1. **清理现有数据**：对于已存在的重复记录，可以运行数据清理脚本
2. **添加数据库约束**：考虑在 `employee_shift_plans` 表上添加唯一约束：
   ```sql
   UNIQUE KEY uk_employee_date_category (employee_id, plan_date, plan_category)
   ```
3. **监控**：定期运行 `check_duplicate_shifts.ts` 监控是否有新的重复记录

## 诊断脚本

创建的诊断工具：
- [check_multiple_shifts.ts](file:///Users/zhengfengyi/ccaps22/backend/check_multiple_shifts.ts) - 检查多个班次类型
- [check_duplicate_shifts.ts](file:///Users/zhengfengyi/ccaps22/backend/check_duplicate_shifts.ts) - 检查重复记录
