-- Add comprehensive work-time system fields to employee_shift_limits table
-- This migration adds support for comprehensive work-time system configuration

USE aps_system;

-- Add comprehensive work-time system fields to employee_shift_limits table
ALTER TABLE employee_shift_limits
  ADD COLUMN IF NOT EXISTS work_time_system_type ENUM('STANDARD', 'COMPREHENSIVE', 'FLEXIBLE') 
    NOT NULL DEFAULT 'STANDARD' 
    COMMENT '工时制类型：STANDARD=标准工时制，COMPREHENSIVE=综合计算工时制，FLEXIBLE=不定时工作制'
    AFTER max_weekly_hours,
  ADD COLUMN IF NOT EXISTS comprehensive_period ENUM('WEEK', 'MONTH', 'QUARTER', 'YEAR') 
    DEFAULT NULL 
    COMMENT '综合工时制周期类型（仅当work_time_system_type=COMPREHENSIVE时有效）'
    AFTER work_time_system_type,
  ADD COLUMN IF NOT EXISTS comprehensive_target_hours DECIMAL(6,2) 
    DEFAULT NULL 
    COMMENT '综合工时制目标工时（仅当work_time_system_type=COMPREHENSIVE时有效）'
    AFTER comprehensive_period;

-- Add index for querying comprehensive work-time employees
CREATE INDEX IF NOT EXISTS idx_employee_shift_limits_work_time_system 
  ON employee_shift_limits(work_time_system_type, comprehensive_period);

-- Update comments
ALTER TABLE employee_shift_limits 
  COMMENT = '员工班次/工时限制（支持标准工时制、综合计算工时制、不定时工作制）';

