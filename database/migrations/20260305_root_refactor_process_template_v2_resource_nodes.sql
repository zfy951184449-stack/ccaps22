-- Root refactor for Process Template V2 resource nodes (no compatibility mode)
-- Decision: SYSTEM/EQUIPMENT_CLASS/EQUIPMENT_MODEL are removed from node tree.
-- Tree keeps: SITE / LINE / ROOM / EQUIPMENT_UNIT / COMPONENT / UTILITY_STATION.
-- Governance keeps: node_scope GLOBAL | DEPARTMENT.
-- owner_org_unit_id is removed from resource_nodes.

-- 1) Backup current data (best-effort, one-shot snapshots)
CREATE TABLE IF NOT EXISTS backup_20260305_resource_nodes AS
SELECT * FROM resource_nodes;

CREATE TABLE IF NOT EXISTS backup_20260305_template_stage_operation_resource_bindings AS
SELECT * FROM template_stage_operation_resource_bindings;

SET @rel_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'resource_node_relations'
);

SET @backup_rel_sql := IF(
  @rel_table_exists > 0,
  'CREATE TABLE IF NOT EXISTS backup_20260305_resource_node_relations AS SELECT * FROM resource_node_relations',
  'SELECT 1'
);
PREPARE stmt_backup_rel FROM @backup_rel_sql;
EXECUTE stmt_backup_rel;
DEALLOCATE PREPARE stmt_backup_rel;

-- 2) Clear bindings / relations / nodes for manual rebuild mode
DELETE FROM template_stage_operation_resource_bindings;

SET @clear_rel_sql := IF(
  @rel_table_exists > 0,
  'DELETE FROM resource_node_relations',
  'SELECT 1'
);
PREPARE stmt_clear_rel FROM @clear_rel_sql;
EXECUTE stmt_clear_rel;
DEALLOCATE PREPARE stmt_clear_rel;

UPDATE resource_nodes SET parent_id = NULL;
DELETE FROM resource_nodes;

-- 3) Normalize resource_nodes schema to new model
SET @owner_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'owner_org_unit_id'
);

SET @owner_fk_name := (
  SELECT kcu.constraint_name
  FROM information_schema.key_column_usage kcu
  JOIN information_schema.table_constraints tc
    ON tc.constraint_schema = kcu.constraint_schema
   AND tc.table_name = kcu.table_name
   AND tc.constraint_name = kcu.constraint_name
  WHERE kcu.table_schema = DATABASE()
    AND kcu.table_name = 'resource_nodes'
    AND kcu.column_name = 'owner_org_unit_id'
    AND tc.constraint_type = 'FOREIGN KEY'
  LIMIT 1
);

SET @drop_owner_fk_sql := IF(
  @owner_fk_name IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE resource_nodes DROP FOREIGN KEY `', @owner_fk_name, '`')
);
PREPARE stmt_drop_owner_fk FROM @drop_owner_fk_sql;
EXECUTE stmt_drop_owner_fk;
DEALLOCATE PREPARE stmt_drop_owner_fk;

SET @owner_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND index_name = 'idx_resource_nodes_owner_unit'
);
SET @drop_owner_idx_sql := IF(
  @owner_idx_exists > 0,
  'ALTER TABLE resource_nodes DROP INDEX idx_resource_nodes_owner_unit',
  'SELECT 1'
);
PREPARE stmt_drop_owner_idx FROM @drop_owner_idx_sql;
EXECUTE stmt_drop_owner_idx;
DEALLOCATE PREPARE stmt_drop_owner_idx;

SET @drop_owner_col_sql := IF(
  @owner_col_exists > 0,
  'ALTER TABLE resource_nodes DROP COLUMN owner_org_unit_id',
  'SELECT 1'
);
PREPARE stmt_drop_owner_col FROM @drop_owner_col_sql;
EXECUTE stmt_drop_owner_col;
DEALLOCATE PREPARE stmt_drop_owner_col;

SET @node_subtype_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'node_subtype'
);
SET @add_node_subtype_sql := IF(
  @node_subtype_exists = 0,
  'ALTER TABLE resource_nodes ADD COLUMN node_subtype VARCHAR(64) NULL AFTER node_class',
  'SELECT 1'
);
PREPARE stmt_add_node_subtype FROM @add_node_subtype_sql;
EXECUTE stmt_add_node_subtype;
DEALLOCATE PREPARE stmt_add_node_subtype;

SET @node_scope_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'node_scope'
);
SET @add_node_scope_sql := IF(
  @node_scope_exists = 0,
  "ALTER TABLE resource_nodes ADD COLUMN node_scope ENUM('GLOBAL','DEPARTMENT') NOT NULL DEFAULT 'GLOBAL' AFTER parent_id",
  'SELECT 1'
);
PREPARE stmt_add_node_scope FROM @add_node_scope_sql;
EXECUTE stmt_add_node_scope;
DEALLOCATE PREPARE stmt_add_node_scope;

SET @equipment_system_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'equipment_system_type'
);
SET @add_equipment_system_type_sql := IF(
  @equipment_system_type_exists = 0,
  "ALTER TABLE resource_nodes ADD COLUMN equipment_system_type ENUM('SUS','SS') NULL AFTER node_subtype",
  'SELECT 1'
);
PREPARE stmt_add_equipment_system_type FROM @add_equipment_system_type_sql;
EXECUTE stmt_add_equipment_system_type;
DEALLOCATE PREPARE stmt_add_equipment_system_type;

SET @equipment_class_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'equipment_class'
);
SET @add_equipment_class_sql := IF(
  @equipment_class_exists = 0,
  'ALTER TABLE resource_nodes ADD COLUMN equipment_class VARCHAR(64) NULL AFTER equipment_system_type',
  'SELECT 1'
);
PREPARE stmt_add_equipment_class FROM @add_equipment_class_sql;
EXECUTE stmt_add_equipment_class;
DEALLOCATE PREPARE stmt_add_equipment_class;

SET @equipment_model_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND column_name = 'equipment_model'
);
SET @add_equipment_model_sql := IF(
  @equipment_model_exists = 0,
  'ALTER TABLE resource_nodes ADD COLUMN equipment_model VARCHAR(64) NULL AFTER equipment_class',
  'SELECT 1'
);
PREPARE stmt_add_equipment_model FROM @add_equipment_model_sql;
EXECUTE stmt_add_equipment_model;
DEALLOCATE PREPARE stmt_add_equipment_model;

ALTER TABLE resource_nodes
  MODIFY COLUMN node_class ENUM(
    'SITE',
    'LINE',
    'ROOM',
    'EQUIPMENT_UNIT',
    'COMPONENT',
    'UTILITY_STATION'
  ) NOT NULL;

ALTER TABLE resource_nodes
  MODIFY COLUMN node_scope ENUM('GLOBAL', 'DEPARTMENT') NOT NULL DEFAULT 'GLOBAL';

ALTER TABLE resource_nodes
  MODIFY COLUMN department_code ENUM('USP','DSP','SPI','MAINT') NULL;

UPDATE resource_nodes
SET node_scope = 'GLOBAL',
    department_code = NULL
WHERE node_scope = 'GLOBAL';

UPDATE resource_nodes
SET node_scope = 'DEPARTMENT',
    department_code = COALESCE(NULLIF(department_code, ''), 'USP')
WHERE node_scope = 'DEPARTMENT';

-- 4) Rebuild indexes for the new model
SET @idx_class_subtype_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND index_name = 'idx_resource_nodes_class_subtype'
);
SET @drop_idx_class_subtype_sql := IF(
  @idx_class_subtype_exists > 0,
  'ALTER TABLE resource_nodes DROP INDEX idx_resource_nodes_class_subtype',
  'SELECT 1'
);
PREPARE stmt_drop_idx_class_subtype FROM @drop_idx_class_subtype_sql;
EXECUTE stmt_drop_idx_class_subtype;
DEALLOCATE PREPARE stmt_drop_idx_class_subtype;
ALTER TABLE resource_nodes ADD INDEX idx_resource_nodes_class_subtype (node_class, node_subtype);

SET @idx_scope_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND index_name = 'idx_resource_nodes_scope'
);
SET @drop_idx_scope_sql := IF(
  @idx_scope_exists > 0,
  'ALTER TABLE resource_nodes DROP INDEX idx_resource_nodes_scope',
  'SELECT 1'
);
PREPARE stmt_drop_idx_scope FROM @drop_idx_scope_sql;
EXECUTE stmt_drop_idx_scope;
DEALLOCATE PREPARE stmt_drop_idx_scope;
ALTER TABLE resource_nodes ADD INDEX idx_resource_nodes_scope (node_scope);

SET @idx_parent_sort_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND index_name = 'idx_resource_nodes_parent_sort'
);
SET @drop_idx_parent_sort_sql := IF(
  @idx_parent_sort_exists > 0,
  'ALTER TABLE resource_nodes DROP INDEX idx_resource_nodes_parent_sort',
  'SELECT 1'
);
PREPARE stmt_drop_idx_parent_sort FROM @drop_idx_parent_sort_sql;
EXECUTE stmt_drop_idx_parent_sort;
DEALLOCATE PREPARE stmt_drop_idx_parent_sort;

SET @idx_sort_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'resource_nodes' AND index_name = 'idx_resource_nodes_sort'
);
SET @drop_idx_sort_sql := IF(
  @idx_sort_exists > 0,
  'ALTER TABLE resource_nodes DROP INDEX idx_resource_nodes_sort',
  'SELECT 1'
);
PREPARE stmt_drop_idx_sort FROM @drop_idx_sort_sql;
EXECUTE stmt_drop_idx_sort;
DEALLOCATE PREPARE stmt_drop_idx_sort;

ALTER TABLE resource_nodes ADD INDEX idx_resource_nodes_parent_sort (parent_id, sort_order);

-- 5) CIP relation table (required, no fallback)
CREATE TABLE IF NOT EXISTS resource_node_relations (
  id INT NOT NULL AUTO_INCREMENT,
  source_node_id INT NOT NULL,
  target_node_id INT NOT NULL,
  relation_type ENUM('CIP_CLEANABLE') NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_resource_node_relation (source_node_id, target_node_id, relation_type),
  KEY idx_resource_node_rel_type_source (relation_type, source_node_id),
  KEY idx_resource_node_rel_type_target (relation_type, target_node_id),
  CONSTRAINT fk_resource_node_rel_source FOREIGN KEY (source_node_id) REFERENCES resource_nodes(id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_node_rel_target FOREIGN KEY (target_node_id) REFERENCES resource_nodes(id) ON DELETE CASCADE
);
