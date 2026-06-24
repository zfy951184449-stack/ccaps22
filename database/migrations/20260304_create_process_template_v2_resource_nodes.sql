CREATE TABLE IF NOT EXISTS resource_nodes (
  id INT NOT NULL AUTO_INCREMENT,
  node_code VARCHAR(64) NOT NULL,
  node_name VARCHAR(120) NOT NULL,
  node_class ENUM('SUITE', 'ROOM', 'EQUIPMENT', 'COMPONENT', 'GROUP') NOT NULL,
  parent_id INT DEFAULT NULL,
  department_code ENUM('USP', 'DSP', 'SPI', 'MAINT') NOT NULL,
  owner_org_unit_id INT DEFAULT NULL,
  bound_resource_id INT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_resource_nodes_code (node_code),
  UNIQUE KEY uk_resource_nodes_bound_resource (bound_resource_id),
  KEY idx_resource_nodes_parent (parent_id),
  KEY idx_resource_nodes_department (department_code),
  KEY idx_resource_nodes_owner_unit (owner_org_unit_id),
  KEY idx_resource_nodes_sort (parent_id, sort_order),
  CONSTRAINT fk_resource_nodes_parent
    FOREIGN KEY (parent_id) REFERENCES resource_nodes(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_resource_nodes_owner_unit
    FOREIGN KEY (owner_org_unit_id) REFERENCES organization_units(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_resource_nodes_bound_resource
    FOREIGN KEY (bound_resource_id) REFERENCES resources(id)
    ON DELETE SET NULL
);

-- 一个操作可绑定多台设备(候选池/任选其一):
--   1 条 binding_role='PRIMARY'(优选,下游排产只认它) + 0..N 条 'AUXILIARY'(备选,仅模版层存储/展示)。
-- 唯一性为复合键 (template_schedule_id, resource_node_id):同一操作同一设备不重复,但允许多行。
CREATE TABLE IF NOT EXISTS template_stage_operation_resource_bindings (
  id INT NOT NULL AUTO_INCREMENT,
  template_schedule_id INT NOT NULL,
  resource_node_id INT NOT NULL,
  binding_mode ENUM('DEFAULT') NOT NULL DEFAULT 'DEFAULT',
  binding_role ENUM('PRIMARY', 'AUXILIARY') NOT NULL DEFAULT 'PRIMARY',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_schedule_node (template_schedule_id, resource_node_id),
  KEY idx_tsorb_resource_node (resource_node_id),
  CONSTRAINT fk_tsorb_schedule
    FOREIGN KEY (template_schedule_id) REFERENCES stage_operation_schedules(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tsorb_resource_node
    FOREIGN KEY (resource_node_id) REFERENCES resource_nodes(id)
    ON DELETE RESTRICT
);
