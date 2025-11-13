-- =====================================================
-- 综合工时制字段迁移脚本（安全版本）
-- 说明：此脚本会检查字段是否存在，避免重复执行
-- 执行方式：mysql -u root -p aps_system < database/add_comprehensive_work_time_fields_safe.sql
-- =====================================================

USE aps_system;

-- 开始事务以确保原子性
START TRANSACTION;

-- 1. 检查并添加 work_time_system_type 字段
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employee_shift_limits' 
    AND COLUMN_NAME = 'work_time_system_type'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE employee_shift_limits 
   ADD COLUMN work_time_system_type ENUM(''STANDARD'', ''COMPREHENSIVE'', ''FLEXIBLE'') 
     NOT NULL DEFAULT ''STANDARD'' 
     COMMENT ''工时制类型：STANDARD=标准工时制，COMPREHENSIVE=综合计算工时制，FLEXIBLE=不定时工作制''
     AFTER max_weekly_hours',
  'SELECT ''Column work_time_system_type already exists, skipping...'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 检查并添加 comprehensive_period 字段
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employee_shift_limits' 
    AND COLUMN_NAME = 'comprehensive_period'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE employee_shift_limits 
   ADD COLUMN comprehensive_period ENUM(''WEEK'', ''MONTH'', ''QUARTER'', ''YEAR'') 
     DEFAULT NULL 
     COMMENT ''综合工时制周期类型（仅当work_time_system_type=COMPREHENSIVE时有效）''
     AFTER work_time_system_type',
  'SELECT ''Column comprehensive_period already exists, skipping...'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 检查并添加 comprehensive_target_hours 字段
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employee_shift_limits' 
    AND COLUMN_NAME = 'comprehensive_target_hours'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE employee_shift_limits 
   ADD COLUMN comprehensive_target_hours DECIMAL(6,2) 
     DEFAULT NULL 
     COMMENT ''综合工时制目标工时（仅当work_time_system_type=COMPREHENSIVE时有效）''
     AFTER comprehensive_period',
  'SELECT ''Column comprehensive_target_hours already exists, skipping...'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 检查并添加索引
SET @index_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employee_shift_limits' 
    AND INDEX_NAME = 'idx_employee_shift_limits_work_time_system'
);

SET @sql = IF(@index_exists = 0,
  'CREATE INDEX idx_employee_shift_limits_work_time_system 
   ON employee_shift_limits(work_time_system_type, comprehensive_period)',
  'SELECT ''Index idx_employee_shift_limits_work_time_system already exists, skipping...'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 更新表注释（可安全重复执行）
ALTER TABLE employee_shift_limits 
  COMMENT = '员工班次/工时限制（支持标准工时制、综合计算工时制、不定时工作制）';

-- 提交事务
COMMIT;

-- 6. 验证迁移结果
SELECT 
  'Migration completed successfully!' AS status,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'employee_shift_limits' 
  AND COLUMN_NAME IN ('work_time_system_type', 'comprehensive_period', 'comprehensive_target_hours')
ORDER BY ORDINAL_POSITION;

-- 7. 显示现有数据统计（验证不影响现有数据）
SELECT 
  'Data verification' AS check_type,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN work_time_system_type = 'STANDARD' THEN 1 END) AS standard_count,
  COUNT(CASE WHEN work_time_system_type = 'COMPREHENSIVE' THEN 1 END) AS comprehensive_count,
  COUNT(CASE WHEN work_time_system_type = 'FLEXIBLE' THEN 1 END) AS flexible_count
FROM employee_shift_limits;
