-- Phase 0A-1 business status transition events.
-- Do not run this file directly in shared environments.
-- Use scripts/phase0a/run_phase0a_migrations.ts, which preflights and skips existing objects.

CREATE TABLE IF NOT EXISTS status_transition_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT NOT NULL,
  from_status VARCHAR(100) NULL,
  to_status VARCHAR(100) NOT NULL,
  transition_code VARCHAR(120) NOT NULL,
  transition_reason VARCHAR(1000) NULL,
  actor_user_id BIGINT NULL,
  actor_employee_id INT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_id VARCHAR(120) NULL,
  correlation_id VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status_transition_entity (entity_type, entity_id),
  KEY idx_status_transition_code (transition_code),
  KEY idx_status_transition_actor_user (actor_user_id),
  KEY idx_status_transition_actor_employee (actor_employee_id),
  KEY idx_status_transition_occurred (occurred_at),
  KEY idx_status_transition_correlation (correlation_id),
  CONSTRAINT fk_status_transition_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_status_transition_actor_employee FOREIGN KEY (actor_employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
