-- Process Template V2 governance scope upgrade
-- Adds node_scope and turns governance into scope-driven optional fields.
-- Scope set: GLOBAL | DEPARTMENT.

SET @node_scope_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_nodes'
    AND column_name = 'node_scope'
);

SET @add_node_scope_sql := IF(
  @node_scope_exists = 0,
  "ALTER TABLE resource_nodes ADD COLUMN node_scope ENUM('GLOBAL','DEPARTMENT') NOT NULL DEFAULT 'DEPARTMENT' AFTER parent_id",
  'SELECT 1'
);
PREPARE stmt_add_node_scope FROM @add_node_scope_sql;
EXECUTE stmt_add_node_scope;
DEALLOCATE PREPARE stmt_add_node_scope;

ALTER TABLE resource_nodes
  MODIFY COLUMN department_code ENUM('USP','DSP','SPI','MAINT') NULL;

SET @backfill_scope_sql := IF(
  @node_scope_exists = 0,
  "UPDATE resource_nodes
   SET node_scope = CASE
     WHEN owner_org_unit_id IS NOT NULL THEN 'DEPARTMENT'
     WHEN department_code IS NOT NULL THEN 'DEPARTMENT'
     ELSE 'GLOBAL'
   END",
  "UPDATE resource_nodes
   SET node_scope = CASE
     WHEN node_scope IS NULL THEN
       CASE
         WHEN owner_org_unit_id IS NOT NULL THEN 'DEPARTMENT'
         WHEN department_code IS NOT NULL THEN 'DEPARTMENT'
         ELSE 'GLOBAL'
       END
     ELSE node_scope
   END"
);
PREPARE stmt_backfill_scope FROM @backfill_scope_sql;
EXECUTE stmt_backfill_scope;
DEALLOCATE PREPARE stmt_backfill_scope;

UPDATE resource_nodes
SET department_code = NULL,
    owner_org_unit_id = NULL
WHERE node_scope = 'GLOBAL';

UPDATE resource_nodes
SET owner_org_unit_id = NULL
WHERE node_scope = 'DEPARTMENT';

SET @scope_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'resource_nodes'
    AND index_name = 'idx_resource_nodes_scope'
);

SET @add_scope_index_sql := IF(
  @scope_index_exists = 0,
  'ALTER TABLE resource_nodes ADD KEY idx_resource_nodes_scope (node_scope)',
  'SELECT 1'
);
PREPARE stmt_add_scope_index FROM @add_scope_index_sql;
EXECUTE stmt_add_scope_index;
DEALLOCATE PREPARE stmt_add_scope_index;
