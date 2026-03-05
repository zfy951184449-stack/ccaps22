-- Process Template V2 resource node semantic upgrade
-- 1) Expand enum to include legacy + target values for safe transition.
-- 2) Add node_subtype.
-- 3) Add node_scope and relax governance fields (GLOBAL/DEPARTMENT).
-- 3) Migrate legacy values into target semantic classes.
-- 4) Narrow enum to target-only set.
-- 5) Add CIP relation table and indexes.

ALTER TABLE resource_nodes
  MODIFY COLUMN node_class ENUM(
    'SUITE', 'ROOM', 'EQUIPMENT', 'COMPONENT', 'GROUP',
    'SITE', 'LINE', 'SYSTEM', 'EQUIPMENT_CLASS', 'EQUIPMENT_MODEL', 'EQUIPMENT_UNIT', 'UTILITY_STATION'
  ) NOT NULL;

ALTER TABLE resource_nodes
  ADD COLUMN node_subtype VARCHAR(64) DEFAULT NULL AFTER node_class;

ALTER TABLE resource_nodes
  ADD COLUMN node_scope ENUM('GLOBAL', 'DEPARTMENT') NOT NULL DEFAULT 'DEPARTMENT' AFTER parent_id;

-- Legacy to semantic mapping (manual rebuild mode still recommended after migration).
UPDATE resource_nodes
SET node_class = 'SITE'
WHERE node_class = 'SUITE';

UPDATE resource_nodes
SET node_class = 'EQUIPMENT_UNIT'
WHERE node_class = 'EQUIPMENT';

UPDATE resource_nodes
SET node_class = 'EQUIPMENT_CLASS',
    node_subtype = COALESCE(NULLIF(TRIM(node_subtype), ''), 'LEGACY_GROUP_CLASS')
WHERE node_class = 'GROUP';

UPDATE resource_nodes
SET node_subtype = COALESCE(NULLIF(TRIM(node_subtype), ''), 'MAIN_PROCESS')
WHERE node_class = 'ROOM';

UPDATE resource_nodes
SET node_subtype = COALESCE(NULLIF(TRIM(node_subtype), ''), 'GENERIC_COMPONENT')
WHERE node_class = 'COMPONENT';

UPDATE resource_nodes
SET node_scope = CASE
  WHEN owner_org_unit_id IS NOT NULL THEN 'DEPARTMENT'
  WHEN department_code IS NOT NULL THEN 'DEPARTMENT'
  ELSE 'GLOBAL'
END;

ALTER TABLE resource_nodes
  MODIFY COLUMN department_code ENUM('USP','DSP','SPI','MAINT') NULL;

UPDATE resource_nodes
SET department_code = NULL,
    owner_org_unit_id = NULL
WHERE node_scope = 'GLOBAL';

UPDATE resource_nodes
SET owner_org_unit_id = NULL
WHERE node_scope = 'DEPARTMENT';

-- Target-only enum.
ALTER TABLE resource_nodes
  MODIFY COLUMN node_class ENUM(
    'SITE', 'LINE', 'ROOM', 'SYSTEM', 'EQUIPMENT_CLASS', 'EQUIPMENT_MODEL', 'EQUIPMENT_UNIT', 'COMPONENT', 'UTILITY_STATION'
  ) NOT NULL;

ALTER TABLE resource_nodes
  ADD KEY idx_resource_nodes_class_subtype (node_class, node_subtype);

ALTER TABLE resource_nodes
  ADD KEY idx_resource_nodes_scope (node_scope);

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
