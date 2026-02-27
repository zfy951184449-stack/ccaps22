-- Resumption migration to finish dropping legacy tables
-- Assumes employee_team_roles FKs (fk_etr_team, fk_etr_shift) are ALREADY DROPPED.
SET FOREIGN_KEY_CHECKS = 0;
-- 1. Finish cleaning employee_team_roles
-- Add index for employee_id to support fk_etr_employee before dropping unique index
ALTER TABLE employee_team_roles
ADD INDEX idx_etr_employee (employee_id);
-- Drop Unique Key using legacy column
ALTER TABLE employee_team_roles DROP INDEX uk_employee_team_role;
-- Drop columns
ALTER TABLE employee_team_roles DROP COLUMN team_id;
ALTER TABLE employee_team_roles DROP COLUMN shift_id;
ALTER TABLE employee_team_roles
MODIFY COLUMN unit_id INT NOT NULL;
-- 2. Clean up employees table
ALTER TABLE employees DROP FOREIGN KEY fk_employees_department;
ALTER TABLE employees DROP FOREIGN KEY fk_employees_primary_team;
ALTER TABLE employees DROP FOREIGN KEY fk_employees_primary_shift;
ALTER TABLE employees DROP COLUMN department_id;
ALTER TABLE employees DROP COLUMN primary_team_id;
ALTER TABLE employees DROP COLUMN primary_shift_id;
-- 3. Drop Legacy Tables
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS shifts;
SET FOREIGN_KEY_CHECKS = 1;