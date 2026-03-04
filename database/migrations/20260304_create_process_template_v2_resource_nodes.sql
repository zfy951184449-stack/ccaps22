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

CREATE TABLE IF NOT EXISTS template_stage_operation_resource_bindings (
  id INT NOT NULL AUTO_INCREMENT,
  template_schedule_id INT NOT NULL,
  resource_node_id INT NOT NULL,
  binding_mode ENUM('DEFAULT') NOT NULL DEFAULT 'DEFAULT',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_template_schedule_default_node (template_schedule_id),
  KEY idx_tsorb_resource_node (resource_node_id),
  CONSTRAINT fk_tsorb_schedule
    FOREIGN KEY (template_schedule_id) REFERENCES stage_operation_schedules(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tsorb_resource_node
    FOREIGN KEY (resource_node_id) REFERENCES resource_nodes(id)
    ON DELETE RESTRICT
);
