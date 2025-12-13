# 排班求解器 API V2 文档

## 概述

本文档描述了模块化排班求解器的 API 接口规范。

### 架构

```
Frontend ──HTTP──> Backend ──HTTP──> Solver (Python)
                     │
                     └──> Database
```

### 基础信息

| 项目 | 值 |
|------|-----|
| 后端基础URL | `http://localhost:3001` |
| 求解器URL | `http://localhost:5001` |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

---

## 后端 API

### 1. 创建排班任务

创建一个新的排班任务，准备数据并调用求解器。

```
POST /api/v2/scheduling/solve
```

#### 请求体

```json
{
  "batchIds": [1, 2, 3],
  "window": {
    "start_date": "2025-01-01",
    "end_date": "2025-02-28"
  },
  "config": {
    "monthly_hours_lower_bound": 16,
    "monthly_hours_upper_bound": 16,
    "max_consecutive_workdays": 6,
    "night_shift_rest_days": 2,
    "solver_time_limit_seconds": 60,
    "prefer_shorter_shift": true
  }
}
```

#### 响应

```json
{
  "success": true,
  "data": {
    "runId": 123,
    "runCode": "SCH-2025-001",
    "status": "QUEUED",
    "message": "排班任务已创建，正在准备数据..."
  }
}
```

---

### 2. 查询排班任务状态

```
GET /api/v2/scheduling/runs/:runId
```

#### 响应

```json
{
  "success": true,
  "data": {
    "id": 123,
    "run_code": "SCH-2025-001",
    "status": "COMPLETED",
    "stage": "COMPLETED",
    "window_start": "2025-01-01",
    "window_end": "2025-02-28",
    "target_batch_ids": [1, 2, 3],
    "created_at": "2025-01-15T10:00:00Z",
    "completed_at": "2025-01-15T10:01:30Z",
    "result_summary": {
      "total_operations": 150,
      "assigned_operations": 148,
      "shift_plans_created": 1200
    }
  }
}
```

---

### 3. 应用排班结果

将求解结果写入生产表。

```
POST /api/v2/scheduling/runs/:runId/apply
```

#### 响应

```json
{
  "success": true,
  "data": {
    "assignments_inserted": 148,
    "shift_plans_inserted": 1200,
    "message": "排班结果已成功应用"
  }
}
```

---

### 4. 查询排班结果详情

```
GET /api/v2/scheduling/runs/:runId/result
```

#### 响应

```json
{
  "success": true,
  "data": {
    "assignments": [
      {
        "operation_plan_id": 101,
        "employee_id": 1
      }
    ],
    "shift_plans": [
      {
        "employee_id": 1,
        "date": "2025-01-15",
        "plan_type": "PRODUCTION",
        "plan_hours": 8.0,
        "shift_code": "NORMAL_DAY",
        "shift_name": "常日班",
        "operations": [
          {
            "operation_plan_id": 101,
            "planned_start": "2025-01-15T09:00:00",
            "planned_end": "2025-01-15T11:00:00",
            "duration_minutes": 120
          }
        ],
        "workshop_minutes": 120
      }
    ],
    "hours_summaries": [
      {
        "employee_id": 1,
        "month": "2025-01",
        "scheduled_hours": 168,
        "standard_hours": 176,
        "hours_deviation": -8,
        "workshop_hours": 40,
        "is_within_bounds": true
      }
    ]
  }
}
```

---

## 求解器 API

### 1. 执行求解

```
POST /api/v2/solve
```

#### 请求体 (SolverRequest)

```json
{
  "request_id": "run-123-1704067200000",
  "window": {
    "start_date": "2025-01-01",
    "end_date": "2025-02-28"
  },
  "operation_demands": [
    {
      "operation_plan_id": 101,
      "batch_id": 1,
      "batch_code": "B001",
      "operation_id": 10,
      "operation_code": "OP001",
      "operation_name": "操作A",
      "stage_id": 1,
      "stage_name": "阶段1",
      "planned_start": "2025-01-15T09:00:00",
      "planned_end": "2025-01-15T11:00:00",
      "planned_duration_minutes": 120,
      "required_people": 2,
      "qualifications": [
        {
          "qualification_id": 1,
          "min_level": 2
        }
      ],
      "is_locked": false
    }
  ],
  "employee_profiles": [
    {
      "employee_id": 1,
      "employee_code": "E001",
      "employee_name": "张三",
      "org_role": "FRONTLINE",
      "department_id": 1,
      "team_id": 1,
      "qualifications": [
        {
          "qualification_id": 1,
          "qualification_code": "Q001",
          "qualification_name": "资质A",
          "level": 3
        }
      ]
    }
  ],
  "calendar": [
    {
      "date": "2025-01-15",
      "is_workday": true,
      "is_triple_salary": false,
      "standard_hours": 8.0
    }
  ],
  "shift_definitions": [
    {
      "shift_id": 1,
      "shift_code": "NORMAL_DAY",
      "shift_name": "常日班",
      "start_time": "08:30",
      "end_time": "17:00",
      "nominal_hours": 8.0,
      "is_cross_day": false,
      "is_night_shift": false,
      "priority": 1
    }
  ],
  "config": {
    "monthly_hours_lower_bound": 16,
    "monthly_hours_upper_bound": 16,
    "enforce_monthly_hours": true,
    "enforce_quarter_hours": true,
    "max_consecutive_workdays": 6,
    "enforce_consecutive_limit": true,
    "night_shift_rest_days": 2,
    "night_shift_rest_day1_hard": true,
    "enforce_night_rest": true,
    "triple_holiday_min_headcount": 1,
    "minimize_triple_holiday_staff": true,
    "prefer_shorter_shift": true,
    "shift_matching_tolerance_minutes": 30,
    "solver_time_limit_seconds": 60,
    "solver_improvement_timeout": 30,
    "enforce_employee_unavailability": true
  },
  "shared_preferences": [],
  "locked_operations": [],
  "locked_shifts": [],
  "employee_unavailability": [],
  "target_batch_ids": [1]
}
```

#### 响应体 (SolverResponse)

```json
{
  "request_id": "run-123-1704067200000",
  "status": "OPTIMAL",
  "summary": "求解成功，分配了 148/150 个操作",
  "assignments": [
    {
      "operation_plan_id": 101,
      "employee_id": 1
    }
  ],
  "shift_plans": [
    {
      "employee_id": 1,
      "date": "2025-01-15",
      "plan_type": "PRODUCTION",
      "plan_hours": 8.0,
      "shift_id": 1,
      "shift_code": "NORMAL_DAY",
      "shift_name": "常日班",
      "shift_nominal_hours": 8.0,
      "is_night_shift": false,
      "operations": [
        {
          "operation_plan_id": 101,
          "planned_start": "2025-01-15T09:00:00",
          "planned_end": "2025-01-15T11:00:00",
          "duration_minutes": 120
        }
      ],
      "workshop_minutes": 120,
      "is_overtime": false
    }
  ],
  "hours_summaries": [
    {
      "employee_id": 1,
      "month": "2025-01",
      "scheduled_hours": 168,
      "standard_hours": 176,
      "hours_deviation": -8,
      "workshop_hours": 40,
      "overtime_hours": 0,
      "production_days": 15,
      "base_days": 6,
      "rest_days": 10,
      "is_within_bounds": true
    }
  ],
  "warnings": [],
  "diagnostics": {
    "total_operations": 150,
    "total_employees": 50,
    "total_days": 59,
    "assigned_operations": 148,
    "skipped_operations": 2,
    "shift_plans_created": 1200,
    "solve_time_seconds": 45.3,
    "solutions_found": 5,
    "objective_value": 1250.0,
    "monthly_hours_violations": 0,
    "consecutive_work_violations": 0,
    "night_rest_violations": 0,
    "employee_utilization_rate": 0.85,
    "operation_fulfillment_rate": 0.987
  }
}
```

---

### 2. 健康检查

```
GET /api/health
```

#### 响应

```json
{
  "status": "ok",
  "version": "2.0.0",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

---

## 数据字典

### 求解状态 (SolverStatus)

| 值 | 说明 |
|----|------|
| `OPTIMAL` | 找到最优解 |
| `FEASIBLE` | 找到可行解（可能不是最优） |
| `INFEASIBLE` | 无可行解 |
| `TIMEOUT` | 求解超时 |
| `ERROR` | 发生错误 |

### 班次类别 (PlanCategory)

| 值 | 说明 |
|----|------|
| `PRODUCTION` | 生产班（有操作任务） |
| `BASE` | 基础班（无操作任务，用于补足工时） |
| `REST` | 休息 |

### 组织角色 (OrgRole)

| 值 | 说明 |
|----|------|
| `FRONTLINE` | 一线员工 |
| `TEAM_LEADER` | 班组长 |
| `GROUP_LEADER` | 组长 |
| `MANAGER` | 主管 |

### 警告类型 (WarningType)

| 值 | 说明 |
|----|------|
| `OPERATION_SKIPPED` | 操作被跳过（无候选人） |
| `INSUFFICIENT_CANDIDATES` | 候选人不足 |
| `SHIFT_MISMATCH` | 班次不匹配 |
| `QUALIFICATION_MISMATCH` | 资质不匹配 |
| `CAPACITY_WARNING` | 产能警告 |
| `CONSTRAINT_RELAXED` | 约束被放松 |

---

## 约束说明

### 硬约束（必须满足）

1. **资质匹配**：员工必须具有操作所需的资质和最低等级
2. **人员唯一性**：同一时间同一员工不能执行多个非共享操作
3. **连续工作限制**：不得连续工作超过 `max_consecutive_workdays` 天
4. **夜班后休息**：夜班后第1天必须休息（当 `night_shift_rest_day1_hard=true`）
5. **月度工时约束**：月度排班工时必须在 `标准工时 ± 上下限` 范围内
6. **季度工时约束**：季度排班工时必须 ≥ 标准工时（仅当覆盖完整季度）

### 软约束（尽可能满足）

1. **夜班后休息第2天**：夜班后第2天尽可能休息
2. **班次优先级**：优先选择较短/较优的班次
3. **共享人员**：共享组内尽可能使用相同人员
4. **最小化三倍工资日人数**：尽可能减少三倍工资日的排班人数

---

## 错误码

| HTTP 状态码 | 错误描述 |
|-------------|----------|
| 400 | 请求参数无效 |
| 404 | 资源不存在 |
| 409 | 状态冲突（如任务已完成） |
| 500 | 服务器内部错误 |
| 503 | 求解器服务不可用 |

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 2.0.0 | 2025-12-03 | 模块化重构版本 |

