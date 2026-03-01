CREATE TABLE IF NOT EXISTS resources (
  id INT NOT NULL AUTO_INCREMENT,
  resource_code VARCHAR(64) NOT NULL,
  resource_name VARCHAR(120) NOT NULL,
  resource_type ENUM('ROOM', 'EQUIPMENT', 'VESSEL_CONTAINER', 'TOOLING', 'STERILIZATION_RESOURCE') NOT NULL,
  department_code ENUM('USP', 'DSP', 'SPI', 'MAINT') NOT NULL,
  owner_org_unit_id INT DEFAULT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
  capacity INT NOT NULL DEFAULT 1,
  location VARCHAR(120) DEFAULT NULL,
  clean_level VARCHAR(64) DEFAULT NULL,
  is_shared TINYINT(1) NOT NULL DEFAULT 0,
  is_schedulable TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_resources_code (resource_code),
  KEY idx_resources_department (department_code),
  KEY idx_resources_type (resource_type),
  KEY idx_resources_owner_unit (owner_org_unit_id),
  CONSTRAINT fk_resources_owner_unit FOREIGN KEY (owner_org_unit_id) REFERENCES organization_units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS resource_calendars (
  id INT NOT NULL AUTO_INCREMENT,
  resource_id INT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  event_type ENUM('OCCUPIED', 'MAINTENANCE', 'CHANGEOVER', 'LOCKED', 'UNAVAILABLE') NOT NULL,
  source_type ENUM('SCHEDULING', 'MANUAL', 'MAINTENANCE') NOT NULL DEFAULT 'MANUAL',
  source_id INT DEFAULT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resource_calendar_resource (resource_id),
  KEY idx_resource_calendar_window (start_datetime, end_datetime),
  CONSTRAINT fk_resource_calendars_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_resource_requirements (
  id INT NOT NULL AUTO_INCREMENT,
  operation_id INT NOT NULL,
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
  KEY idx_operation_resource_operation (operation_id),
  KEY idx_operation_resource_type (resource_type),
  CONSTRAINT fk_operation_resource_requirements_operation FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_resource_candidates (
  id INT NOT NULL AUTO_INCREMENT,
  requirement_id INT NOT NULL,
  resource_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_operation_resource_candidate (requirement_id, resource_id),
  KEY idx_operation_resource_candidate_resource (resource_id),
  CONSTRAINT fk_operation_resource_candidates_requirement FOREIGN KEY (requirement_id) REFERENCES operation_resource_requirements(id) ON DELETE CASCADE,
  CONSTRAINT fk_operation_resource_candidates_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id INT NOT NULL AUTO_INCREMENT,
  resource_id INT NOT NULL,
  window_type ENUM('PM', 'BREAKDOWN', 'CALIBRATION', 'CLEANING') NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  is_hard_block TINYINT(1) NOT NULL DEFAULT 1,
  owner_dept_code ENUM('MAINT') NOT NULL DEFAULT 'MAINT',
  notes VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_maintenance_windows_resource (resource_id),
  KEY idx_maintenance_windows_window (start_datetime, end_datetime),
  CONSTRAINT fk_maintenance_windows_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_plans (
  id INT NOT NULL AUTO_INCREMENT,
  project_code VARCHAR(64) NOT NULL,
  project_name VARCHAR(120) NOT NULL,
  department_code ENUM('USP', 'DSP', 'SPI', 'MAINT') DEFAULT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  planned_start_date DATE DEFAULT NULL,
  planned_end_date DATE DEFAULT NULL,
  description TEXT DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_plans_code (project_code)
);

CREATE TABLE IF NOT EXISTS project_batch_relations (
  id INT NOT NULL AUTO_INCREMENT,
  project_plan_id INT NOT NULL,
  batch_plan_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_batch_relation (project_plan_id, batch_plan_id),
  KEY idx_project_batch_relations_batch (batch_plan_id),
  CONSTRAINT fk_project_batch_relations_project FOREIGN KEY (project_plan_id) REFERENCES project_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_batch_relations_batch FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  resource_id INT NOT NULL,
  batch_operation_plan_id INT DEFAULT NULL,
  standalone_task_id INT DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  assignment_status ENUM('PLANNED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
  notes VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resource_assignments_resource (resource_id),
  KEY idx_resource_assignments_operation (batch_operation_plan_id),
  KEY idx_resource_assignments_task (standalone_task_id),
  KEY idx_resource_assignments_window (start_datetime, end_datetime),
  CONSTRAINT fk_resource_assignments_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_assignments_operation FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_assignments_task FOREIGN KEY (standalone_task_id) REFERENCES standalone_tasks(id) ON DELETE CASCADE
);
