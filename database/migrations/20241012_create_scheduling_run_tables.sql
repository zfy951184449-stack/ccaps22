-- Stage 1: scheduling run metadata and draft/publish support
USE aps_system;

CREATE TABLE IF NOT EXISTS scheduling_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_key CHAR(36) NOT NULL,
  trigger_type ENUM('AUTO_PLAN', 'RETRY', 'MANUAL') NOT NULL DEFAULT 'AUTO_PLAN',
  status ENUM('DRAFT', 'PENDING_PUBLISH', 'PUBLISHED', 'FAILED', 'ROLLED_BACK', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  options_json JSON NULL,
  summary_json JSON NULL,
  warnings_json JSON NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_run_key (run_key),
  KEY idx_status (status),
  KEY idx_period (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduling_run_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  batch_plan_id INT NOT NULL,
  batch_code VARCHAR(64) NOT NULL,
  window_start DATETIME NULL,
  window_end DATETIME NULL,
  total_operations INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_run_batches_run_id (run_id),
  KEY idx_run_batches_batch (batch_plan_id),
  CONSTRAINT fk_scheduling_run_batches_run FOREIGN KEY (run_id) REFERENCES scheduling_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduling_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  result_state ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  version INT NOT NULL DEFAULT 1,
  assignments_payload JSON NOT NULL,
  coverage_payload JSON NULL,
  logs_payload JSON NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_run_state (run_id, result_state),
  CONSTRAINT fk_scheduling_results_run FOREIGN KEY (run_id) REFERENCES scheduling_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduling_result_diffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  from_state ENUM('DRAFT', 'PUBLISHED', 'ROLLED_BACK') NOT NULL,
  to_state ENUM('DRAFT', 'PUBLISHED', 'ROLLED_BACK') NOT NULL,
  diff_payload JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_result_diffs_run (run_id),
  CONSTRAINT fk_scheduling_result_diffs_run FOREIGN KEY (run_id) REFERENCES scheduling_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE employee_shift_plans
  ADD COLUMN IF NOT EXISTS scheduling_run_id BIGINT UNSIGNED NULL AFTER batch_operation_plan_id,
  ADD KEY idx_esp_run_id (scheduling_run_id);

ALTER TABLE batch_personnel_assignments
  ADD COLUMN IF NOT EXISTS scheduling_run_id BIGINT UNSIGNED NULL AFTER batch_operation_plan_id,
  ADD KEY idx_bpa_run_id (scheduling_run_id);

ALTER TABLE personnel_schedules
  ADD COLUMN IF NOT EXISTS scheduling_run_id BIGINT UNSIGNED NULL AFTER shift_type_id,
  ADD KEY idx_ps_run_id (scheduling_run_id);

ALTER TABLE employee_shift_plans
  ADD CONSTRAINT fk_esp_scheduling_run FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id) ON DELETE SET NULL;

ALTER TABLE batch_personnel_assignments
  ADD CONSTRAINT fk_bpa_scheduling_run FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id) ON DELETE SET NULL;

ALTER TABLE personnel_schedules
  ADD CONSTRAINT fk_ps_scheduling_run FOREIGN KEY (scheduling_run_id) REFERENCES scheduling_runs(id) ON DELETE SET NULL;
