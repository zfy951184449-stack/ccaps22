# Role: APS Backend Expert & Database Guardian

**Description**: This rule ensures strict adherence to the APS database schema guidelines, preventing common errors related to redundant fields (like `shift_code` vs `shift_plan_id`), ambiguous status fields, and critical data types (`BigInt` handling). It enforces a "Single Source of Truth" policy for all database operations.

## 🚨 CRITICAL: Single Source of Truth Rules

### 1. Shift Information (The "Triangle Deadlock")
**Scenario**: `batch_personnel_assignments` table contains both `shift_code` (Redundant) and `shift_plan_id` (Source of Truth).
**RULE**:
- **ALWAYS** join `employee_shift_plans` via `shift_plan_id` to get accurate shift information.
- **NEVER** rely on `batch_personnel_assignments.shift_code` for business logic, as it may be stale.
- **WRITE**:
  ```typescript
  // CORRECT
  const assignment = await prisma.batch_personnel_assignments.findUnique({
    where: { id: 1 },
    include: {
      employee_shift_plans: {
        include: { shift_definitions: true } // Truth lives here
      }
    }
  });
  ```
- **AVOID**: Using `assignment.shift_code` directly.

### 2. Personnel Status (The "Status Mask")
**Scenario**: Multiple status fields exist across related tables.
**RULE**:
- `production_batch_plans.plan_status`: Lifecycle of the **Batch** (e.g., PLANNED, COMPLETED).
- `employee_shift_plans.plan_state`: State of the **Shift** (e.g., PLANNED, LOCKED).
- `scheduling_results.result_state`: State of the **Solver Run** (e.g., DRAFT, PUBLISHED).
- **ACTION**: When asked for "plan status", clarify which entity (Batch, Shift, or Run) is being referred to. Do not mix them up.

---

## ⚠️ Ambiguity Resolution (Clarifications)

### 1. `scheduling_runs` Table
- **`status` Field**: 
  - **Type**: `String` (NOT Enum in DB, but treated as Enum in code).
  - **Valid Values**: "QUEUED", "PREPARING", "PLANNING", "COMPLETED", "FAILED".
  - **Action**: Always treat this as a case-sensitive string.
- **Time Ranges**:
  - `period_start` / `period_end`: The wall-time range covered by this scheduling run (e.g., "Schedule for Next Week").
  - `window_start` / `window_end`: (Deprecated/Internal) The optimization window used by the solver algorithm.
  - **Action**: Use `period_start/end` for user-facing queries.

### 2. `shift_definitions` Table
- **`nominal_hours`**:
  - **Meaning**: The "Paid Hours" or "Standard Hours" for accounting.
  - **Warning**: This is **NOT** necessarily `end_time - start_time`. It accounts for unpaid breaks.
  - **Action**: Use this field for cost/salary calculations. Use `start_time` and `end_time` for timeline rendering.

### 3. `employee_shift_plans` Table
- **`shift_nominal_hours`**:
  - **Meaning**: A **Snapshot** of `shift_definitions.nominal_hours` at the time of plan creation.
  - **Action**: Use this for **historical accuracy**. If the global shift definition changes later, this field preserves the original value used for that specific day's pay.

---

## 🛠️ Code Generation Best Practices

1.  **Enums vs Magic Numbers**:
    - **`batch_operation_constraints.constraint_type`**: This is an `Intermediate` field with Integer values.
      - 0: Start-Start
      - 1: Finish-Start (Default)
      - 2: Start-Finish
      - 3: Finish-Finish
    - **Action**: Define explicit constants or an Enum helper in code immediately when using this field. Do not leave raw numbers like `where: { constraint_type: 1 }` without comment.

2.  **ID Types**:
    - `scheduling_runs.id` is `BigInt`.
    - `batch_personnel_assignments.id` is `Int`.
    - **Action**: When joining these tables, ensure type casting is handled correctly in the application layer (e.g., converting BigInt to String for JSON responses).

---

## 🔍 Quick-Check Checklist (Before Outputting Code)

- [ ] Did I use `shift_plan_id` instead of `shift_code`?
- [ ] Did I distinguish between `Batch Status`, `Shift State`, and `Run State`?
- [ ] Did I handle `BigInt` serialization for `scheduling_runs`?
- [ ] Did I use `period_start` for scheduling ranges?
