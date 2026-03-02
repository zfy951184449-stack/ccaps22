CREATE TABLE IF NOT EXISTS template_operation_resource_requirements (
  id INT NOT NULL AUTO_INCREMENT,
  template_schedule_id INT NOT NULL,
  resource_type ENUM('ROOM', 'EQUIPMENT', 'VESSEL_CONTAINER', 'TOOLING', 'STERILIZATION_RESOURCE') NOT NULL,
  required_count INT NOT NULL DEFAULT 1,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  requires_exclusive_use TINYINT(1) NOT NULL DEFAULT 1,
  prep_minutes INT NOT NULL DEFAULT 0,
  changeover_minutes INT NOT NULL DEFAULT 0,
  cleanup_minutes INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_torr_template_schedule (template_schedule_id),
  KEY idx_torr_resource_type (resource_type),
  KEY idx_torr_template_schedule_type (template_schedule_id, resource_type),
  CONSTRAINT fk_torr_template_schedule FOREIGN KEY (template_schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_operation_resource_candidates (
  id INT NOT NULL AUTO_INCREMENT,
  requirement_id INT NOT NULL,
  resource_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_torc_requirement_resource (requirement_id, resource_id),
  KEY idx_torc_resource (resource_id),
  CONSTRAINT fk_torc_requirement FOREIGN KEY (requirement_id) REFERENCES template_operation_resource_requirements(id) ON DELETE CASCADE,
  CONSTRAINT fk_torc_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS batch_operation_resource_requirements (
  id INT NOT NULL AUTO_INCREMENT,
  batch_operation_plan_id INT NOT NULL,
  resource_type ENUM('ROOM', 'EQUIPMENT', 'VESSEL_CONTAINER', 'TOOLING', 'STERILIZATION_RESOURCE') NOT NULL,
  required_count INT NOT NULL DEFAULT 1,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  requires_exclusive_use TINYINT(1) NOT NULL DEFAULT 1,
  prep_minutes INT NOT NULL DEFAULT 0,
  changeover_minutes INT NOT NULL DEFAULT 0,
  cleanup_minutes INT NOT NULL DEFAULT 0,
  source_scope ENUM('GLOBAL_DEFAULT', 'TEMPLATE_OVERRIDE', 'BATCH_OVERRIDE') NOT NULL,
  source_requirement_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_borr_batch_operation (batch_operation_plan_id),
  KEY idx_borr_resource_type (resource_type),
  KEY idx_borr_batch_operation_type (batch_operation_plan_id, resource_type),
  CONSTRAINT fk_borr_batch_operation FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS batch_operation_resource_candidates (
  id INT NOT NULL AUTO_INCREMENT,
  requirement_id INT NOT NULL,
  resource_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_borc_requirement_resource (requirement_id, resource_id),
  KEY idx_borc_resource (resource_id),
  CONSTRAINT fk_borc_requirement FOREIGN KEY (requirement_id) REFERENCES batch_operation_resource_requirements(id) ON DELETE CASCADE,
  CONSTRAINT fk_borc_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

