-- =====================================================
-- 排班系统 V2 表结构修复迁移
-- 创建日期：2024-12-03
-- 描述：为新的模块化排班系统添加必要的列（兼容性版本）
-- =====================================================

USE aps_system;

-- 检查并添加 run_code 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'run_code'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN run_code VARCHAR(64) NULL AFTER run_key',
  'SELECT "run_code already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 stage 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'stage'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT "PREPARING" AFTER status',
  'SELECT "stage already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 window_start 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'window_start'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN window_start DATE NULL',
  'SELECT "window_start already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 window_end 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'window_end'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN window_end DATE NULL AFTER window_start',
  'SELECT "window_end already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 target_batch_ids 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'target_batch_ids'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN target_batch_ids JSON NULL',
  'SELECT "target_batch_ids already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 result_summary 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'result_summary'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN result_summary JSON NULL',
  'SELECT "result_summary already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 error_message 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'scheduling_runs' 
    AND COLUMN_NAME = 'error_message'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE scheduling_runs ADD COLUMN error_message TEXT NULL',
  'SELECT "error_message already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（忽略已存在的错误）
-- CREATE INDEX idx_run_code ON scheduling_runs(run_code);
-- CREATE INDEX idx_stage ON scheduling_runs(stage);

-- 确保 batch_personnel_assignments 表有 is_locked 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'batch_personnel_assignments' 
    AND COLUMN_NAME = 'is_locked'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE batch_personnel_assignments ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "is_locked already exists in batch_personnel_assignments"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 确保 employee_shift_plans 表有 is_locked 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'employee_shift_plans' 
    AND COLUMN_NAME = 'is_locked'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE employee_shift_plans ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "is_locked already exists in employee_shift_plans"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 确保 employee_shift_plans 表有 is_buffer 列
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'employee_shift_plans' 
    AND COLUMN_NAME = 'is_buffer'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE employee_shift_plans ADD COLUMN is_buffer TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "is_buffer already exists in employee_shift_plans"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Scheduling V2 migration completed' AS message;

