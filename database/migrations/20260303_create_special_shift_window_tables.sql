CREATE TABLE IF NOT EXISTS special_shift_windows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  window_code VARCHAR(50) NOT NULL,
  window_name VARCHAR(200) NOT NULL,
  org_unit_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('DRAFT', 'ACTIVE', 'CANCELLED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  lock_after_apply TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_special_shift_window_code UNIQUE (window_code),
  CONSTRAINT chk_special_shift_window_dates CHECK (start_date <= end_date),
  CONSTRAINT fk_special_shift_windows_org_unit
    FOREIGN KEY (org_unit_id) REFERENCES organization_units(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_windows_created_by
    FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_windows_updated_by
    FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  INDEX idx_special_shift_windows_org_unit (org_unit_id),
  INDEX idx_special_shift_windows_status (status),
  INDEX idx_special_shift_windows_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS special_shift_window_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  window_id INT NOT NULL,
  shift_id INT NOT NULL,
  required_people INT NOT NULL,
  plan_category ENUM('BASE', 'OVERTIME') NOT NULL DEFAULT 'BASE',
  qualification_id INT NULL,
  min_level TINYINT NULL,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  days_of_week JSON NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_special_shift_window_rules_required_people CHECK (required_people > 0),
  CONSTRAINT fk_special_shift_window_rules_window
    FOREIGN KEY (window_id) REFERENCES special_shift_windows(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_window_rules_shift
    FOREIGN KEY (shift_id) REFERENCES shift_definitions(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_window_rules_qualification
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  INDEX idx_special_shift_window_rules_window (window_id),
  INDEX idx_special_shift_window_rules_shift (shift_id),
  INDEX idx_special_shift_window_rules_qualification (qualification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS special_shift_window_employee_scopes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  employee_id INT NOT NULL,
  scope_type ENUM('ALLOW', 'DENY') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_special_shift_window_scope UNIQUE (rule_id, employee_id, scope_type),
  CONSTRAINT fk_special_shift_window_employee_scopes_rule
    FOREIGN KEY (rule_id) REFERENCES special_shift_window_rules(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_window_employee_scopes_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  INDEX idx_special_shift_window_employee_scopes_rule (rule_id),
  INDEX idx_special_shift_window_employee_scopes_employee (employee_id),
  INDEX idx_special_shift_window_employee_scopes_type (scope_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS special_shift_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  window_id INT NOT NULL,
  rule_id INT NOT NULL,
  occurrence_date DATE NOT NULL,
  shift_id INT NOT NULL,
  required_people INT NOT NULL,
  plan_category ENUM('BASE', 'OVERTIME') NOT NULL,
  qualification_id INT NULL,
  min_level TINYINT NULL,
  status ENUM('PENDING', 'SCHEDULED', 'APPLIED', 'CANCELLED', 'INFEASIBLE') NOT NULL DEFAULT 'PENDING',
  scheduling_run_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_special_shift_occurrence UNIQUE (window_id, rule_id, occurrence_date),
  CONSTRAINT chk_special_shift_occurrences_required_people CHECK (required_people > 0),
  CONSTRAINT fk_special_shift_occurrences_window
    FOREIGN KEY (window_id) REFERENCES special_shift_windows(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrences_rule
    FOREIGN KEY (rule_id) REFERENCES special_shift_window_rules(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrences_shift
    FOREIGN KEY (shift_id) REFERENCES shift_definitions(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrences_qualification
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrences_run
    FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  INDEX idx_special_shift_occurrences_window_date (window_id, occurrence_date),
  INDEX idx_special_shift_occurrences_status (status),
  INDEX idx_special_shift_occurrences_run (scheduling_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS special_shift_occurrence_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  occurrence_id INT NOT NULL,
  position_number INT NOT NULL,
  employee_id INT NOT NULL,
  shift_plan_id INT NOT NULL,
  scheduling_run_id BIGINT UNSIGNED NULL,
  assignment_status ENUM('PLANNED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_special_shift_occurrence_position UNIQUE (occurrence_id, position_number),
  CONSTRAINT uk_special_shift_occurrence_employee UNIQUE (occurrence_id, employee_id),
  CONSTRAINT fk_special_shift_occurrence_assignments_occurrence
    FOREIGN KEY (occurrence_id) REFERENCES special_shift_occurrences(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrence_assignments_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrence_assignments_shift_plan
    FOREIGN KEY (shift_plan_id) REFERENCES employee_shift_plans(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_special_shift_occurrence_assignments_run
    FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  INDEX idx_special_shift_occurrence_assignments_occurrence (occurrence_id),
  INDEX idx_special_shift_occurrence_assignments_shift_plan (shift_plan_id),
  INDEX idx_special_shift_occurrence_assignments_employee (employee_id),
  INDEX idx_special_shift_occurrence_assignments_run (scheduling_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
