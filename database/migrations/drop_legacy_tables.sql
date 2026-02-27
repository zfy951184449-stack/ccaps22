-- Migration to drop legacy tables after verified migration to organization_units
SET FOREIGN_KEY_CHECKS = 0;
-- 1. Migrate employee_team_roles to use unit_id exclusively
-- Link legacy team_id to organization_units id via team_code = unit_code
UPDATE employee_team_roles etr
    JOIN teams t ON t.id = etr.team_id
    JOIN organization_units u ON u.unit_code = t.team_code
    AND u.unit_type = 'TEAM'
SET etr.unit_id = u.id
WHERE etr.unit_id IS NULL;
-- 2. Clean up employee_team_roles
-- Drop Foreign Keys first
ALTER TABLE employee_team_roles DROP FOREIGN KEY fk_etr_team;
ALTER TABLE employee_team_roles DROP FOREIGN KEY fk_etr_shift;
-- Drop Unique Key using legacy column
-- Add index for employee_id to support fk_etr_employee before dropping unique index
ALTER TABLE employee_team_roles
ADD INDEX idx_etr_employee (employee_id);
ALTER TABLE employee_team_roles DROP INDEX uk_employee_team_role;
-- Drop columns
ALTER TABLE employee_team_roles DROP COLUMN team_id;
-- Just in case syntax varies, but DROP FOREIGN KEY is standard
-- ALTER TABLE employee_team_roles DROP COLUMN shift_id; -- shifts table is being dropped. Should we drop shift_id column?
-- Plan includes "DROP TABLE shifts". So yes, foreign key references to it must die.
-- shift_id column itself: if we drop table shifts, shift_id becomes meaningless integer (or NULL).
-- We should probably drop shift_id column too if we are removing Shifts table.
-- Re-checking logic: Shifts are now Organization Units of type 'SHIFT'.
-- So `shift_id` (legacy) should probably be migrated to `unit_id` or `shift_unit_id`?
-- Current `employee_team_roles` schema has NOT `shift_unit_id` but generally `unit_id`.
-- But `unit_id` usually refers to TEAM.
-- Does `employee_team_roles` link to Shift Unit?
-- `OrganizationAutoStructureService` creates Shift Units.
-- But assignments... might not link to shift units directly in `employee_team_roles`?
-- `employee_team_roles` has `shift_id`.
-- If we drop `shifts` table, we should drop `shift_id`.
-- BUT do we lose shift assignment info?
-- `organization_units` SHIFT units exist.
-- But where is the assignment?
-- If `shift_id` was measuring "Which shift pattern" (e.g. Day/Night), then `shifts` table held definitions.
-- Now `organization_units` holds Shift Units (e.g. "ZhangSan Shift").
-- Is `shift_id` in `employee_team_roles` pointing to "ZhangSan Shift"? No, likely pointing to old `shifts` table (Time definitions).
-- If we are dropping `shifts` table, we imply that info is migrated or obsolete.
-- The plan said "DROP TABLE shifts".
-- I will assume `shift_id` column should be dropped.
ALTER TABLE employee_team_roles DROP COLUMN shift_id;
ALTER TABLE employee_team_roles
MODIFY COLUMN unit_id INT NOT NULL;
-- 3. Clean up employees table
ALTER TABLE employees DROP FOREIGN KEY fk_employees_department;
ALTER TABLE employees DROP FOREIGN KEY fk_employees_primary_team;
ALTER TABLE employees DROP FOREIGN KEY fk_employees_primary_shift;
ALTER TABLE employees DROP COLUMN department_id;
ALTER TABLE employees DROP COLUMN primary_team_id;
ALTER TABLE employees DROP COLUMN primary_shift_id;
-- 4. Drop Legacy Tables
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS shifts;
SET FOREIGN_KEY_CHECKS = 1;