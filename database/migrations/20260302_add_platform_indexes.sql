SET @schema_name := DATABASE();

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'production_batch_plans'
      AND index_name = 'idx_platform_project_status_start'
  ),
  'SELECT 1',
  'CREATE INDEX idx_platform_project_status_start ON production_batch_plans (project_code, plan_status, planned_start_date)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'batch_operation_plans'
      AND index_name = 'idx_platform_operation_batch_window'
  ),
  'SELECT 1',
  'CREATE INDEX idx_platform_operation_batch_window ON batch_operation_plans (batch_plan_id, planned_start_datetime, planned_end_datetime)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'operation_resource_requirements'
      AND index_name = 'idx_platform_requirement_operation_type'
  ),
  'SELECT 1',
  'CREATE INDEX idx_platform_requirement_operation_type ON operation_resource_requirements (operation_id, resource_type)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @schema_name
      AND table_name = 'maintenance_windows'
      AND index_name = 'idx_platform_maintenance_resource_window'
  ),
  'SELECT 1',
  'CREATE INDEX idx_platform_maintenance_resource_window ON maintenance_windows (resource_id, start_datetime, end_datetime)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
