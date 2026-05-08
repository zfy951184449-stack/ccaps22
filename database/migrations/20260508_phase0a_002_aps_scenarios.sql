-- Phase 0A-1 APS scenarios.
-- Do not run this file directly in shared environments.
-- Use scripts/phase0a/run_phase0a_migrations.ts, which preflights and skips existing objects.

CREATE TABLE IF NOT EXISTS aps_scenarios (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scenario_code VARCHAR(100) NOT NULL,
  scenario_name VARCHAR(255) NOT NULL,
  scenario_type ENUM('BASELINE','WHAT_IF','RECOVERY','RELEASE_CANDIDATE') NOT NULL,
  source_scenario_id BIGINT NULL,
  planning_horizon_start DATETIME NOT NULL,
  planning_horizon_end DATETIME NOT NULL,
  scenario_status ENUM('DRAFT','CHECKED','APPROVED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  reason_code VARCHAR(100) NULL,
  reason_text VARCHAR(1000) NULL,
  created_by BIGINT NULL,
  approved_by BIGINT NULL,
  published_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  published_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_aps_scenarios_code (scenario_code),
  KEY idx_aps_scenarios_type_status (scenario_type, scenario_status),
  KEY idx_aps_scenarios_horizon (planning_horizon_start, planning_horizon_end),
  KEY idx_aps_scenarios_source (source_scenario_id),
  CONSTRAINT fk_aps_scenarios_source FOREIGN KEY (source_scenario_id) REFERENCES aps_scenarios(id),
  CONSTRAINT fk_aps_scenarios_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_aps_scenarios_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT fk_aps_scenarios_published_by FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MySQL >= 8.0.16 may enforce CHECK constraints. The hardened runner applies this conditionally.
-- ALTER TABLE aps_scenarios ADD CONSTRAINT chk_aps_scenarios_horizon CHECK (planning_horizon_start < planning_horizon_end);

ALTER TABLE scheduling_runs
  ADD COLUMN scenario_id BIGINT NULL,
  ADD COLUMN run_context ENUM('LEGACY','APS','ROSTER') NOT NULL DEFAULT 'LEGACY';

CREATE INDEX idx_scheduling_runs_scenario ON scheduling_runs (scenario_id);
CREATE INDEX idx_scheduling_runs_context_status ON scheduling_runs (run_context, status);

ALTER TABLE scheduling_runs
  ADD CONSTRAINT fk_scheduling_runs_scenario
  FOREIGN KEY (scenario_id) REFERENCES aps_scenarios(id);

ALTER TABLE scheduling_results
  ADD COLUMN scenario_id BIGINT NULL,
  ADD COLUMN result_context ENUM('LEGACY','APS','ROSTER') NOT NULL DEFAULT 'LEGACY';

CREATE INDEX idx_scheduling_results_scenario ON scheduling_results (scenario_id);
CREATE INDEX idx_scheduling_results_context_state ON scheduling_results (result_context, result_state);

ALTER TABLE scheduling_results
  ADD CONSTRAINT fk_scheduling_results_scenario
  FOREIGN KEY (scenario_id) REFERENCES aps_scenarios(id);
