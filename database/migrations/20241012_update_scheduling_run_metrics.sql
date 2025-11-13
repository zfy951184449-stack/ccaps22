USE aps_system;

ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS metrics_summary_json JSON NULL AFTER warnings_json,
  ADD COLUMN IF NOT EXISTS heuristic_summary_json JSON NULL AFTER metrics_summary_json;

ALTER TABLE scheduling_results
  ADD COLUMN IF NOT EXISTS metrics_payload JSON NULL AFTER coverage_payload,
  ADD COLUMN IF NOT EXISTS hotspots_payload JSON NULL AFTER metrics_payload;
