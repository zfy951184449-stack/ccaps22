-- ============================================================
-- 批次甘特「右键新增独立操作」所需的 schema 收尾
-- 执行时间: 2026-06-22
--
-- 背景:
--   add_independent_operations.sql (2025-12-11) 已为独立操作松绑了
--   production_batch_plans.template_id / batch_operation_plans.template_schedule_id，
--   并加了 is_independent / generation_group_id —— 但只建了「读」的一半:
--     1) 删唯一键 uk_batch_template_schedule 那步当时被注释成「需手动执行」;
--     2) 独立操作没有列承载它落在哪个阶段 / 哪台设备 —— hierarchy 查询靠
--        template_schedule_id 反查 stage / resource，独立操作必然落到「General
--        Operations」泳道，无法「在哪点就在哪加」。
--
--   本迁移补齐上述两点，并对 add_independent_operations.sql 的列做幂等保护
--   （本地 dev 库可能尚未跑过那份）。全部为新增 NULL 列 + 删一个唯一键，可回退。
--
-- 幂等: 重复执行安全（每步先查 information_schema 再决定是否变更）。
-- ============================================================

-- ---- 0. template_schedule_id 允许为空（独立操作无模版来源）----
-- MODIFY 重复执行无副作用，直接跑。
ALTER TABLE batch_operation_plans
  MODIFY COLUMN template_schedule_id INT NULL COMMENT '模版操作安排ID，独立操作为NULL';

-- ---- 1. is_independent（独立操作标记）----
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND COLUMN_NAME = 'is_independent');
SET @sql := IF(@col = 0,
  'ALTER TABLE batch_operation_plans ADD COLUMN is_independent TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否为独立操作（模版外手工新增）''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 2. generation_group_id（批量生成组，预留）----
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND COLUMN_NAME = 'generation_group_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE batch_operation_plans ADD COLUMN generation_group_id VARCHAR(36) NULL COMMENT ''批量生成组ID''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 3. stage_id（独立操作所属阶段；模版操作仍经 template_schedule_id 反查）----
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND COLUMN_NAME = 'stage_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE batch_operation_plans ADD COLUMN stage_id INT NULL COMMENT ''独立操作所属阶段ID（落点泳道），模版操作为NULL''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 4. resource_node_id（独立操作落点设备；可空=未绑定设备）----
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND COLUMN_NAME = 'resource_node_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE batch_operation_plans ADD COLUMN resource_node_id INT NULL COMMENT ''独立操作落点设备节点ID，未绑定为NULL''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 5. 删唯一键 uk_batch_template_schedule ----
-- 该键 = (batch_plan_id, template_schedule_id)。独立操作 template_schedule_id=NULL，
-- MySQL 把多个 NULL 视为不同值，暂不会挡多条独立操作；但保留它语义已不成立
-- （独立操作不该受「每批次每模版操作唯一」约束）。安全删除。
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND INDEX_NAME = 'uk_batch_template_schedule');
SET @sql := IF(@idx > 0,
  'ALTER TABLE batch_operation_plans DROP INDEX uk_batch_template_schedule',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 6. 索引（hierarchy 查询会按 stage_id / resource_node_id LEFT JOIN）----
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND INDEX_NAME = 'idx_bop_independent_stage');
SET @sql := IF(@idx = 0,
  'CREATE INDEX idx_bop_independent_stage ON batch_operation_plans(stage_id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'batch_operation_plans' AND INDEX_NAME = 'idx_bop_independent_resource');
SET @sql := IF(@idx = 0,
  'CREATE INDEX idx_bop_independent_resource ON batch_operation_plans(resource_node_id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT '20260622_independent_gantt_operations 完成' AS status;
