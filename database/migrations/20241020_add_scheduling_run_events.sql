USE aps_system;

CREATE TABLE IF NOT EXISTS scheduling_run_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  stage ENUM(
    'QUEUED',
    'PREPARING',
    'LOADING_DATA',
    'PLANNING',
    'PERSISTING',
    'COMPLETED',
    'FAILED'
  ) NOT NULL,
  status ENUM('INFO', 'WARN', 'ERROR', 'SUCCESS', 'PROGRESS') NOT NULL DEFAULT 'INFO',
  message TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_run_stage (run_id, stage, created_at),
  KEY idx_run_created (run_id, created_at),
  CONSTRAINT fk_scheduling_run_events_run FOREIGN KEY (run_id)
    REFERENCES scheduling_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
