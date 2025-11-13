USE aps_system;

ALTER TABLE employee_shift_plans
  DROP INDEX uk_employee_plan,
  ADD UNIQUE INDEX uk_employee_plan (
    employee_id,
    plan_date,
    plan_category,
    (COALESCE(batch_operation_plan_id, -1))
  );
