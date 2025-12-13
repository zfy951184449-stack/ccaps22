ALTER TABLE employee_shift_plans
ADD COLUMN shift_nominal_hours DECIMAL(4,2) DEFAULT NULL AFTER plan_hours;
