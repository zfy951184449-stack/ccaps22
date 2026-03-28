CREATE DATABASE IF NOT EXISTS aps_system_v3
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE aps_system_v3;

CREATE TABLE IF NOT EXISTS v3_templates (
  id INT NOT NULL AUTO_INCREMENT,
  template_code VARCHAR(64) NOT NULL,
  template_name VARCHAR(160) NOT NULL,
  domain_code ENUM('USP', 'DSP', 'SPI') NOT NULL,
  equipment_mode_scope ENUM('MIXED', 'SS', 'SUS') NOT NULL DEFAULT 'MIXED',
  description TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_templates_code (template_code),
  KEY idx_v3_templates_domain (domain_code)
);

CREATE TABLE IF NOT EXISTS v3_main_flow_nodes (
  id INT NOT NULL AUTO_INCREMENT,
  template_id INT NOT NULL,
  node_key VARCHAR(64) NOT NULL,
  semantic_key VARCHAR(64) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  phase_code ENUM('USP', 'DSP', 'SPI') NOT NULL,
  equipment_mode ENUM('SS', 'SUS', 'ANY') NOT NULL DEFAULT 'ANY',
  default_duration_minutes INT NOT NULL DEFAULT 0,
  sequence_order INT NOT NULL,
  default_equipment_code VARCHAR(64) DEFAULT NULL,
  default_material_code VARCHAR(64) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_main_flow_node_key (template_id, node_key),
  UNIQUE KEY uk_v3_main_flow_sequence (template_id, sequence_order),
  KEY idx_v3_main_flow_template (template_id),
  CONSTRAINT fk_v3_main_flow_template
    FOREIGN KEY (template_id) REFERENCES v3_templates(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v3_main_flow_edges (
  id INT NOT NULL AUTO_INCREMENT,
  template_id INT NOT NULL,
  predecessor_node_id INT NOT NULL,
  successor_node_id INT NOT NULL,
  relationship_type ENUM('FINISH_START', 'START_START', 'STATE_GATE') NOT NULL DEFAULT 'FINISH_START',
  min_offset_minutes INT NOT NULL DEFAULT 0,
  max_offset_minutes INT DEFAULT NULL,
  trigger_condition JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_main_flow_edge (predecessor_node_id, successor_node_id),
  KEY idx_v3_main_flow_edges_template (template_id),
  CONSTRAINT fk_v3_edge_template
    FOREIGN KEY (template_id) REFERENCES v3_templates(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v3_edge_predecessor
    FOREIGN KEY (predecessor_node_id) REFERENCES v3_main_flow_nodes(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v3_edge_successor
    FOREIGN KEY (successor_node_id) REFERENCES v3_main_flow_nodes(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v3_operation_packages (
  id INT NOT NULL AUTO_INCREMENT,
  template_id INT DEFAULT NULL,
  package_code VARCHAR(64) NOT NULL,
  package_name VARCHAR(160) NOT NULL,
  package_type ENUM('SETUP', 'MEDIA_FILL', 'CIP_SIP', 'CHANGEOVER', 'MATERIAL_PREP') NOT NULL,
  target_entity_type ENUM('EQUIPMENT', 'MATERIAL') NOT NULL,
  equipment_mode ENUM('SS', 'SUS', 'ANY') NOT NULL DEFAULT 'ANY',
  description TEXT DEFAULT NULL,
  is_reusable TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_operation_package_code (package_code),
  KEY idx_v3_operation_packages_template (template_id),
  CONSTRAINT fk_v3_operation_packages_template
    FOREIGN KEY (template_id) REFERENCES v3_templates(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v3_operation_package_members (
  id INT NOT NULL AUTO_INCREMENT,
  package_id INT NOT NULL,
  member_code VARCHAR(64) NOT NULL,
  operation_code VARCHAR(64) NOT NULL,
  operation_name VARCHAR(160) NOT NULL,
  member_order INT NOT NULL,
  relative_day_offset INT NOT NULL DEFAULT 0,
  relative_minute_offset INT NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 0,
  predecessor_member_id INT DEFAULT NULL,
  target_equipment_state ENUM(
    'setup',
    'media_holding',
    'processing',
    'dirty_hold',
    'cleaning_cip',
    'sterilizing_sip',
    'clean_hold',
    'changeover',
    'maintenance'
  ) DEFAULT NULL,
  target_material_state ENUM(
    'prepared',
    'in_hold',
    'expired',
    'consumed',
    'quarantined'
  ) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_package_member_code (package_id, member_code),
  UNIQUE KEY uk_v3_package_member_order (package_id, member_order),
  KEY idx_v3_package_members_package (package_id),
  KEY idx_v3_package_members_predecessor (predecessor_member_id),
  CONSTRAINT fk_v3_package_members_package
    FOREIGN KEY (package_id) REFERENCES v3_operation_packages(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v3_package_members_predecessor
    FOREIGN KEY (predecessor_member_id) REFERENCES v3_operation_package_members(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v3_trigger_rules (
  id INT NOT NULL AUTO_INCREMENT,
  template_id INT NOT NULL,
  rule_code VARCHAR(64) NOT NULL,
  target_node_id INT DEFAULT NULL,
  anchor_mode ENUM('NODE_START', 'NODE_END', 'RULE_END', 'PACKAGE_END') NOT NULL,
  anchor_ref_code VARCHAR(64) DEFAULT NULL,
  trigger_mode ENUM('PACKAGE_BEFORE_START', 'WINDOW', 'RECURRING_WINDOW', 'FOLLOW_DEPENDENCY', 'STATE_GATE') NOT NULL,
  operation_code VARCHAR(64) DEFAULT NULL,
  operation_name VARCHAR(160) DEFAULT NULL,
  operation_role ENUM('AUXILIARY') NOT NULL DEFAULT 'AUXILIARY',
  default_duration_minutes INT NOT NULL DEFAULT 0,
  earliest_offset_minutes INT DEFAULT NULL,
  recommended_offset_minutes INT DEFAULT NULL,
  latest_offset_minutes INT DEFAULT NULL,
  repeat_every_minutes INT DEFAULT NULL,
  repeat_until_node_id INT DEFAULT NULL,
  dependency_rule_code VARCHAR(64) DEFAULT NULL,
  generator_package_id INT DEFAULT NULL,
  target_equipment_state ENUM(
    'setup',
    'media_holding',
    'processing',
    'dirty_hold',
    'cleaning_cip',
    'sterilizing_sip',
    'clean_hold',
    'changeover',
    'maintenance'
  ) DEFAULT NULL,
  target_material_state ENUM(
    'prepared',
    'in_hold',
    'expired',
    'consumed',
    'quarantined'
  ) DEFAULT NULL,
  is_blocking TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_trigger_rule_code (template_id, rule_code),
  KEY idx_v3_trigger_rules_template (template_id),
  KEY idx_v3_trigger_rules_target_node (target_node_id),
  KEY idx_v3_trigger_rules_repeat_until (repeat_until_node_id),
  KEY idx_v3_trigger_rules_package (generator_package_id),
  CONSTRAINT fk_v3_trigger_rules_template
    FOREIGN KEY (template_id) REFERENCES v3_templates(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v3_trigger_rules_target_node
    FOREIGN KEY (target_node_id) REFERENCES v3_main_flow_nodes(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v3_trigger_rules_repeat_until
    FOREIGN KEY (repeat_until_node_id) REFERENCES v3_main_flow_nodes(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_v3_trigger_rules_package
    FOREIGN KEY (generator_package_id) REFERENCES v3_operation_packages(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v3_equipment_state_events (
  id INT NOT NULL AUTO_INCREMENT,
  resource_code VARCHAR(64) NOT NULL,
  resource_name VARCHAR(160) DEFAULT NULL,
  equipment_mode ENUM('SS', 'SUS', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  state_code ENUM(
    'setup',
    'media_holding',
    'processing',
    'dirty_hold',
    'cleaning_cip',
    'sterilizing_sip',
    'clean_hold',
    'changeover',
    'maintenance'
  ) NOT NULL,
  source_mode ENUM('SYNC', 'MANUAL', 'PROJECTION', 'RULE', 'PACKAGE') NOT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  effective_datetime DATETIME NOT NULL,
  end_datetime DATETIME DEFAULT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_v3_equipment_state_events_resource (resource_code, effective_datetime)
);

CREATE TABLE IF NOT EXISTS v3_equipment_state_segments (
  id INT NOT NULL AUTO_INCREMENT,
  resource_code VARCHAR(64) NOT NULL,
  resource_name VARCHAR(160) DEFAULT NULL,
  equipment_mode ENUM('SS', 'SUS', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  state_code ENUM(
    'setup',
    'media_holding',
    'processing',
    'dirty_hold',
    'cleaning_cip',
    'sterilizing_sip',
    'clean_hold',
    'changeover',
    'maintenance'
  ) NOT NULL,
  source_mode ENUM('SYNC', 'MANUAL', 'PROJECTION', 'RULE', 'PACKAGE') NOT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  confidence ENUM('CONFIRMED', 'PLANNED', 'PREDICTED') NOT NULL DEFAULT 'CONFIRMED',
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_v3_equipment_state_segments_resource (resource_code, start_datetime, end_datetime)
);

CREATE TABLE IF NOT EXISTS v3_material_state_events (
  id INT NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(64) NOT NULL,
  material_name VARCHAR(160) DEFAULT NULL,
  state_code ENUM('prepared', 'in_hold', 'expired', 'consumed', 'quarantined') NOT NULL,
  source_mode ENUM('SYNC', 'MANUAL', 'PROJECTION', 'RULE', 'PACKAGE') NOT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  effective_datetime DATETIME NOT NULL,
  end_datetime DATETIME DEFAULT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_v3_material_state_events_material (material_code, effective_datetime)
);

CREATE TABLE IF NOT EXISTS v3_material_state_segments (
  id INT NOT NULL AUTO_INCREMENT,
  material_code VARCHAR(64) NOT NULL,
  material_name VARCHAR(160) DEFAULT NULL,
  state_code ENUM('prepared', 'in_hold', 'expired', 'consumed', 'quarantined') NOT NULL,
  source_mode ENUM('SYNC', 'MANUAL', 'PROJECTION', 'RULE', 'PACKAGE') NOT NULL,
  source_ref VARCHAR(64) DEFAULT NULL,
  confidence ENUM('CONFIRMED', 'PLANNED', 'PREDICTED') NOT NULL DEFAULT 'CONFIRMED',
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_v3_material_state_segments_material (material_code, start_datetime, end_datetime)
);

CREATE TABLE IF NOT EXISTS v3_projection_runs (
  id INT NOT NULL AUTO_INCREMENT,
  template_id INT NOT NULL,
  template_code VARCHAR(64) NOT NULL,
  run_mode ENUM('PREVIEW') NOT NULL DEFAULT 'PREVIEW',
  status ENUM('READY', 'FAILED') NOT NULL DEFAULT 'READY',
  planned_start_datetime DATETIME NOT NULL,
  horizon_end_datetime DATETIME NOT NULL,
  requested_equipment_codes JSON DEFAULT NULL,
  warnings JSON DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_v3_projection_runs_template (template_id, created_at),
  CONSTRAINT fk_v3_projection_runs_template
    FOREIGN KEY (template_id) REFERENCES v3_templates(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v3_projection_operations (
  id INT NOT NULL AUTO_INCREMENT,
  run_id INT NOT NULL,
  template_id INT NOT NULL,
  node_id INT DEFAULT NULL,
  rule_id INT DEFAULT NULL,
  package_id INT DEFAULT NULL,
  operation_key VARCHAR(128) NOT NULL,
  operation_code VARCHAR(64) NOT NULL,
  operation_name VARCHAR(160) NOT NULL,
  role ENUM('MAIN', 'AUXILIARY') NOT NULL,
  source ENUM('EXISTING_BATCH', 'TEMPLATE_PROJECTION', 'SYSTEM_DERIVED', 'PACKAGE_MEMBER') NOT NULL,
  equipment_code VARCHAR(64) DEFAULT NULL,
  equipment_name VARCHAR(160) DEFAULT NULL,
  equipment_mode ENUM('SS', 'SUS', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  material_state_ref VARCHAR(64) DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  window_start_datetime DATETIME DEFAULT NULL,
  window_end_datetime DATETIME DEFAULT NULL,
  display_lane ENUM('MAIN', 'AUXILIARY') NOT NULL DEFAULT 'MAIN',
  is_user_adjusted TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_projection_operation_key (run_id, operation_key),
  KEY idx_v3_projection_operations_run (run_id, start_datetime),
  KEY idx_v3_projection_operations_equipment (equipment_code, start_datetime, end_datetime),
  CONSTRAINT fk_v3_projection_operations_run
    FOREIGN KEY (run_id) REFERENCES v3_projection_runs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v3_projection_risks (
  id INT NOT NULL AUTO_INCREMENT,
  run_id INT NOT NULL,
  template_id INT NOT NULL,
  risk_code VARCHAR(128) NOT NULL,
  risk_type ENUM(
    'UNBOUND_RESOURCE',
    'MISSING_MIRROR_RESOURCE',
    'MAINTENANCE_CONFLICT',
    'ASSIGNMENT_CONFLICT',
    'STATE_GAP',
    'WINDOW_VIOLATION',
    'MATERIAL_HOLD_RISK'
  ) NOT NULL,
  severity ENUM('INFO', 'WARNING', 'BLOCKING') NOT NULL DEFAULT 'WARNING',
  equipment_code VARCHAR(64) DEFAULT NULL,
  material_code VARCHAR(64) DEFAULT NULL,
  operation_key VARCHAR(128) DEFAULT NULL,
  trigger_ref_code VARCHAR(64) DEFAULT NULL,
  window_start_datetime DATETIME DEFAULT NULL,
  window_end_datetime DATETIME DEFAULT NULL,
  message VARCHAR(255) NOT NULL,
  is_blocking TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_projection_risk_code (run_id, risk_code),
  KEY idx_v3_projection_risks_run (run_id, severity),
  CONSTRAINT fk_v3_projection_risks_run
    FOREIGN KEY (run_id) REFERENCES v3_projection_runs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v3_master_sync_runs (
  id INT NOT NULL AUTO_INCREMENT,
  status ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'RUNNING',
  source_db_name VARCHAR(64) NOT NULL,
  target_db_name VARCHAR(64) NOT NULL,
  summary JSON DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_v3_master_sync_runs_started (started_at)
);

CREATE TABLE IF NOT EXISTS v3_master_organization_units (
  id INT NOT NULL AUTO_INCREMENT,
  source_unit_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'organization_units',
  sync_run_id INT NOT NULL,
  parent_source_unit_id INT DEFAULT NULL,
  unit_type VARCHAR(32) NOT NULL,
  unit_code VARCHAR(64) DEFAULT NULL,
  unit_name VARCHAR(160) NOT NULL,
  default_shift_code VARCHAR(64) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_org_source (source_unit_id),
  KEY idx_v3_master_org_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_resources (
  id INT NOT NULL AUTO_INCREMENT,
  source_resource_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'resources',
  sync_run_id INT NOT NULL,
  resource_code VARCHAR(64) NOT NULL,
  resource_name VARCHAR(160) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  department_code VARCHAR(16) DEFAULT NULL,
  owner_org_unit_id INT DEFAULT NULL,
  status VARCHAR(32) NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  location VARCHAR(160) DEFAULT NULL,
  clean_level VARCHAR(64) DEFAULT NULL,
  is_shared TINYINT(1) NOT NULL DEFAULT 0,
  is_schedulable TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_resource_code (resource_code),
  UNIQUE KEY uk_v3_master_resource_source (source_resource_id),
  KEY idx_v3_master_resources_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_resource_nodes (
  id INT NOT NULL AUTO_INCREMENT,
  source_node_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'resource_nodes',
  sync_run_id INT NOT NULL,
  node_code VARCHAR(64) NOT NULL,
  node_name VARCHAR(160) NOT NULL,
  node_class VARCHAR(32) NOT NULL,
  parent_source_node_id INT DEFAULT NULL,
  department_code VARCHAR(16) DEFAULT NULL,
  owner_org_unit_id INT DEFAULT NULL,
  bound_resource_id INT DEFAULT NULL,
  bound_resource_code VARCHAR(64) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_resource_node_code (node_code),
  UNIQUE KEY uk_v3_master_resource_node_source (source_node_id),
  KEY idx_v3_master_resource_nodes_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_maintenance_windows (
  id INT NOT NULL AUTO_INCREMENT,
  source_window_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'maintenance_windows',
  sync_run_id INT NOT NULL,
  resource_id INT DEFAULT NULL,
  resource_code VARCHAR(64) NOT NULL,
  window_type VARCHAR(32) NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  is_hard_block TINYINT(1) NOT NULL DEFAULT 1,
  owner_dept_code VARCHAR(16) DEFAULT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_maintenance_source (source_window_id),
  KEY idx_v3_master_maintenance_resource (resource_code, start_datetime, end_datetime),
  KEY idx_v3_master_maintenance_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_resource_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  source_assignment_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'resource_assignments',
  sync_run_id INT NOT NULL,
  resource_id INT DEFAULT NULL,
  resource_code VARCHAR(64) NOT NULL,
  batch_operation_plan_id INT DEFAULT NULL,
  standalone_task_id INT DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  assignment_status VARCHAR(32) NOT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_assignment_source (source_assignment_id),
  KEY idx_v3_master_assignment_resource (resource_code, start_datetime, end_datetime),
  KEY idx_v3_master_assignment_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_template_binding_summaries (
  id INT NOT NULL AUTO_INCREMENT,
  source_binding_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'template_stage_operation_resource_bindings',
  sync_run_id INT NOT NULL,
  template_id INT DEFAULT NULL,
  template_code VARCHAR(64) DEFAULT NULL,
  template_name VARCHAR(160) DEFAULT NULL,
  stage_id INT DEFAULT NULL,
  stage_code VARCHAR(64) DEFAULT NULL,
  stage_name VARCHAR(160) DEFAULT NULL,
  schedule_id INT DEFAULT NULL,
  operation_id INT DEFAULT NULL,
  operation_code VARCHAR(64) DEFAULT NULL,
  operation_name VARCHAR(160) DEFAULT NULL,
  resource_node_id INT DEFAULT NULL,
  resource_node_code VARCHAR(64) DEFAULT NULL,
  resource_code VARCHAR(64) DEFAULT NULL,
  binding_mode VARCHAR(32) NOT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_template_binding_source (source_binding_id),
  KEY idx_v3_master_template_binding_template (template_code),
  KEY idx_v3_master_template_binding_run (sync_run_id)
);

CREATE TABLE IF NOT EXISTS v3_master_resource_rule_summaries (
  id INT NOT NULL AUTO_INCREMENT,
  source_requirement_id INT NOT NULL,
  source_db_name VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL DEFAULT 'operation_resource_requirements',
  sync_run_id INT NOT NULL,
  operation_id INT DEFAULT NULL,
  operation_code VARCHAR(64) DEFAULT NULL,
  operation_name VARCHAR(160) DEFAULT NULL,
  resource_type VARCHAR(64) NOT NULL,
  required_count INT NOT NULL DEFAULT 1,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  requires_exclusive_use TINYINT(1) NOT NULL DEFAULT 1,
  prep_minutes INT NOT NULL DEFAULT 0,
  changeover_minutes INT NOT NULL DEFAULT 0,
  cleanup_minutes INT NOT NULL DEFAULT 0,
  candidate_resource_codes JSON DEFAULT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_stale TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_v3_master_resource_rule_source (source_requirement_id),
  KEY idx_v3_master_resource_rule_operation (operation_code),
  KEY idx_v3_master_resource_rule_run (sync_run_id)
);

INSERT IGNORE INTO v3_templates (
  template_code,
  template_name,
  domain_code,
  equipment_mode_scope,
  description,
  metadata
) VALUES
  (
    'USP_UPSTREAM_CULTURE_V3',
    'USP 上游细胞培养 V3 试点',
    'USP',
    'MIXED',
    '从细胞复苏到收获的主工艺流，使用触发规则派生取样、补料、setup 和培养基灌注。',
    JSON_OBJECT('pilot', TRUE, 'focus', JSON_ARRAY('sampling', 'feed', 'setup', 'media_holding'))
  ),
  (
    'DSP_CAPTURE_SS_V3',
    'DSP 层析捕获 V3 试点',
    'DSP',
    'SS',
    '代表性 SS 下游流程，验证 CIP/SIP 包与 clean hold 状态链。',
    JSON_OBJECT('pilot', TRUE, 'focus', JSON_ARRAY('cip_sip', 'clean_hold', 'ss_state_chain'))
  ),
  (
    'SPI_MEDIA_PREP_V3',
    '配液 / 培养基制备 V3 试点',
    'SPI',
    'SS',
    '验证物料态 prepared / in_hold 与设备态 media_holding 的耦合。',
    JSON_OBJECT('pilot', TRUE, 'focus', JSON_ARRAY('material_state', 'media_prep'))
  );

INSERT IGNORE INTO v3_main_flow_nodes (
  template_id,
  node_key,
  semantic_key,
  display_name,
  phase_code,
  equipment_mode,
  default_duration_minutes,
  sequence_order,
  default_equipment_code,
  default_material_code,
  metadata
)
SELECT
  t.id,
  seeded.node_key,
  seeded.semantic_key,
  seeded.display_name,
  seeded.phase_code,
  seeded.equipment_mode,
  seeded.default_duration_minutes,
  seeded.sequence_order,
  seeded.default_equipment_code,
  seeded.default_material_code,
  seeded.metadata
FROM (
  SELECT
    'USP_UPSTREAM_CULTURE_V3' AS template_code,
    'CELL_THAW' AS node_key,
    'CELL_THAW' AS semantic_key,
    '细胞复苏' AS display_name,
    'USP' AS phase_code,
    'SUS' AS equipment_mode,
    60 AS default_duration_minutes,
    1 AS sequence_order,
    'SUS-SEED-01' AS default_equipment_code,
    NULL AS default_material_code,
    JSON_OBJECT('target_equipment_state', 'processing') AS metadata
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'INOCULATION',
    'INOCULATION',
    '接种',
    'USP',
    'SUS',
    120,
    2,
    'SUS-BR-01',
    NULL,
    JSON_OBJECT('target_equipment_state', 'processing')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'CELL_CULTURE',
    'CELL_CULTURE',
    '细胞培养',
    'USP',
    'SUS',
    5760,
    3,
    'SUS-BR-01',
    'MEDIA-A',
    JSON_OBJECT('required_equipment_state', 'processing', 'required_material_state', 'in_hold')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'PASSAGE',
    'PASSAGE',
    '转种',
    'USP',
    'SUS',
    150,
    4,
    'SUS-BR-01',
    NULL,
    JSON_OBJECT('target_equipment_state', 'processing')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'HARVEST',
    'HARVEST',
    '收获',
    'USP',
    'SS',
    180,
    5,
    'SS-HARV-01',
    NULL,
    JSON_OBJECT('target_equipment_state', 'processing')
  UNION ALL
  SELECT
    'DSP_CAPTURE_SS_V3',
    'LOAD_COLUMN',
    'LOAD_COLUMN',
    '上柱',
    'DSP',
    'SS',
    240,
    1,
    'SS-CHROM-01',
    'BUF-EQ-01',
    JSON_OBJECT('required_equipment_state', 'clean_hold')
  UNION ALL
  SELECT
    'DSP_CAPTURE_SS_V3',
    'WASH_COLUMN',
    'WASH_COLUMN',
    '洗柱',
    'DSP',
    'SS',
    60,
    2,
    'SS-CHROM-01',
    'BUF-EQ-01',
    JSON_OBJECT('target_equipment_state', 'processing')
  UNION ALL
  SELECT
    'DSP_CAPTURE_SS_V3',
    'ELUTE_PRODUCT',
    'ELUTE_PRODUCT',
    '洗脱',
    'DSP',
    'SS',
    90,
    3,
    'SS-CHROM-01',
    'BUF-EQ-01',
    JSON_OBJECT('target_equipment_state', 'processing')
  UNION ALL
  SELECT
    'SPI_MEDIA_PREP_V3',
    'MEDIA_PREP',
    'MEDIA_PREP',
    '培养基制备',
    'SPI',
    'SS',
    180,
    1,
    'SS-BUF-01',
    'MEDIA-PREP-01',
    JSON_OBJECT('target_material_state', 'prepared')
  UNION ALL
  SELECT
    'SPI_MEDIA_PREP_V3',
    'MEDIA_RELEASE',
    'MEDIA_RELEASE',
    '培养基放行',
    'SPI',
    'SS',
    30,
    2,
    'SS-BUF-01',
    'MEDIA-PREP-01',
    JSON_OBJECT('required_material_state', 'in_hold')
) AS seeded
JOIN v3_templates t ON t.template_code = seeded.template_code;

INSERT IGNORE INTO v3_main_flow_edges (
  template_id,
  predecessor_node_id,
  successor_node_id,
  relationship_type,
  min_offset_minutes,
  max_offset_minutes,
  trigger_condition
)
SELECT
  t.id,
  predecessor.id,
  successor.id,
  seeded.relationship_type,
  seeded.min_offset_minutes,
  seeded.max_offset_minutes,
  seeded.trigger_condition
FROM (
  SELECT 'USP_UPSTREAM_CULTURE_V3' AS template_code, 'CELL_THAW' AS predecessor_key, 'INOCULATION' AS successor_key, 'FINISH_START' AS relationship_type, 60 AS min_offset_minutes, NULL AS max_offset_minutes, NULL AS trigger_condition
  UNION ALL
  SELECT 'USP_UPSTREAM_CULTURE_V3', 'INOCULATION', 'CELL_CULTURE', 'FINISH_START', 0, NULL, NULL
  UNION ALL
  SELECT 'USP_UPSTREAM_CULTURE_V3', 'CELL_CULTURE', 'PASSAGE', 'FINISH_START', 0, NULL, JSON_OBJECT('until', 'sampling_rules_complete')
  UNION ALL
  SELECT 'USP_UPSTREAM_CULTURE_V3', 'PASSAGE', 'HARVEST', 'FINISH_START', 120, NULL, NULL
  UNION ALL
  SELECT 'DSP_CAPTURE_SS_V3', 'LOAD_COLUMN', 'WASH_COLUMN', 'FINISH_START', 0, NULL, NULL
  UNION ALL
  SELECT 'DSP_CAPTURE_SS_V3', 'WASH_COLUMN', 'ELUTE_PRODUCT', 'FINISH_START', 0, NULL, NULL
  UNION ALL
  SELECT 'SPI_MEDIA_PREP_V3', 'MEDIA_PREP', 'MEDIA_RELEASE', 'FINISH_START', 0, NULL, NULL
) AS seeded
JOIN v3_templates t ON t.template_code = seeded.template_code
JOIN v3_main_flow_nodes predecessor
  ON predecessor.template_id = t.id
 AND predecessor.node_key = seeded.predecessor_key
JOIN v3_main_flow_nodes successor
  ON successor.template_id = t.id
 AND successor.node_key = seeded.successor_key;

INSERT IGNORE INTO v3_operation_packages (
  package_code,
  package_name,
  package_type,
  target_entity_type,
  equipment_mode,
  description,
  metadata
) VALUES
  (
    'SUS_BIOREACTOR_SETUP',
    'SUS 反应器 Setup 包',
    'SETUP',
    'EQUIPMENT',
    'SUS',
    '用于 SUS 生物反应器进入 setup 状态的标准操作包。',
    JSON_OBJECT('state_chain', JSON_ARRAY('setup'))
  ),
  (
    'MEDIA_FILL_PACKAGE',
    '培养基灌注包',
    'MEDIA_FILL',
    'MATERIAL',
    'SUS',
    '使设备进入 media_holding，并使培养基进入 in_hold 状态。',
    JSON_OBJECT('state_chain', JSON_ARRAY('prepared', 'in_hold'))
  ),
  (
    'SS_CIP_SIP_PACKAGE',
    'SS CIP/SIP 包',
    'CIP_SIP',
    'EQUIPMENT',
    'SS',
    '用于 SS 设备进入 clean_hold 的标准清洗灭菌包。',
    JSON_OBJECT('state_chain', JSON_ARRAY('cleaning_cip', 'sterilizing_sip', 'clean_hold'))
  ),
  (
    'BUFFER_TANK_SETUP_PACKAGE',
    '配液罐 Setup 包',
    'SETUP',
    'EQUIPMENT',
    'SS',
    '用于配液罐 / buffer tank 的安装与完整性确认。',
    JSON_OBJECT('state_chain', JSON_ARRAY('setup'))
  );

INSERT IGNORE INTO v3_operation_package_members (
  package_id,
  member_code,
  operation_code,
  operation_name,
  member_order,
  relative_day_offset,
  relative_minute_offset,
  duration_minutes,
  target_equipment_state,
  target_material_state,
  metadata
)
SELECT
  p.id,
  seeded.member_code,
  seeded.operation_code,
  seeded.operation_name,
  seeded.member_order,
  seeded.relative_day_offset,
  seeded.relative_minute_offset,
  seeded.duration_minutes,
  seeded.target_equipment_state,
  seeded.target_material_state,
  seeded.metadata
FROM (
  SELECT
    'SUS_BIOREACTOR_SETUP' AS package_code,
    'BAG_INSTALL' AS member_code,
    'SUS-BAG-INSTALL' AS operation_code,
    '反应袋安装' AS operation_name,
    1 AS member_order,
    -2 AS relative_day_offset,
    540 AS relative_minute_offset,
    120 AS duration_minutes,
    'setup' AS target_equipment_state,
    NULL AS target_material_state,
    JSON_OBJECT('window_label', '培养前第 2 天') AS metadata
  UNION ALL
  SELECT
    'SUS_BIOREACTOR_SETUP',
    'PRESSURE_TEST',
    'SUS-PRESSURE-TEST',
    '保压测试',
    2,
    -1,
    480,
    90,
    'setup',
    NULL,
    JSON_OBJECT('window_label', '培养前第 1 天上午')
  UNION ALL
  SELECT
    'SUS_BIOREACTOR_SETUP',
    'ELECTRODE_INSTALL',
    'SUS-ELECTRODE-INSTALL',
    '电极安装',
    3,
    -1,
    720,
    60,
    'setup',
    NULL,
    JSON_OBJECT('window_label', '保压测试后')
  UNION ALL
  SELECT
    'MEDIA_FILL_PACKAGE',
    'MEDIA_CHARGE',
    'MEDIA-CHARGE',
    '培养基灌注',
    1,
    -1,
    900,
    180,
    'media_holding',
    'prepared',
    JSON_OBJECT('window_label', '接种前完成灌注')
  UNION ALL
  SELECT
    'MEDIA_FILL_PACKAGE',
    'MEDIA_HOLD_RELEASE',
    'MEDIA-HOLD-RELEASE',
    '培养基保温确认',
    2,
    -1,
    1140,
    30,
    'media_holding',
    'in_hold',
    JSON_OBJECT('window_label', '灌注完成后进入 hold')
  UNION ALL
  SELECT
    'SS_CIP_SIP_PACKAGE',
    'PRE_RINSE',
    'SS-PRE-RINSE',
    '预冲洗',
    1,
    -1,
    360,
    60,
    'cleaning_cip',
    NULL,
    JSON_OBJECT('window_label', '批前一天清晨')
  UNION ALL
  SELECT
    'SS_CIP_SIP_PACKAGE',
    'CIP_CYCLE',
    'SS-CIP',
    'CIP',
    2,
    -1,
    450,
    120,
    'cleaning_cip',
    NULL,
    JSON_OBJECT('window_label', '预冲洗后')
  UNION ALL
  SELECT
    'SS_CIP_SIP_PACKAGE',
    'SIP_CYCLE',
    'SS-SIP',
    'SIP',
    3,
    -1,
    600,
    90,
    'sterilizing_sip',
    NULL,
    JSON_OBJECT('window_label', 'CIP 后')
  UNION ALL
  SELECT
    'SS_CIP_SIP_PACKAGE',
    'CLEAN_HOLD_RELEASE',
    'SS-CLEAN-HOLD',
    'clean hold 确认',
    4,
    -1,
    720,
    15,
    'clean_hold',
    NULL,
    JSON_OBJECT('window_label', 'SIP 完成后')
  UNION ALL
  SELECT
    'BUFFER_TANK_SETUP_PACKAGE',
    'TANK_ASSEMBLY',
    'BUF-TANK-ASSEMBLY',
    '配液罐安装',
    1,
    -1,
    480,
    90,
    'setup',
    NULL,
    JSON_OBJECT('window_label', '配液前一天')
  UNION ALL
  SELECT
    'BUFFER_TANK_SETUP_PACKAGE',
    'LINE_INTEGRITY_CHECK',
    'BUF-LINE-CHECK',
    '流路完整性确认',
    2,
    -1,
    660,
    45,
    'setup',
    NULL,
    JSON_OBJECT('window_label', '安装后')
) AS seeded
JOIN v3_operation_packages p ON p.package_code = seeded.package_code;

UPDATE v3_operation_package_members child
JOIN v3_operation_packages pkg ON pkg.id = child.package_id
JOIN v3_operation_package_members predecessor
  ON predecessor.package_id = child.package_id
SET child.predecessor_member_id = predecessor.id
WHERE (
    pkg.package_code = 'SUS_BIOREACTOR_SETUP'
    AND (
      (child.member_code = 'PRESSURE_TEST' AND predecessor.member_code = 'BAG_INSTALL')
      OR (child.member_code = 'ELECTRODE_INSTALL' AND predecessor.member_code = 'PRESSURE_TEST')
    )
  )
  OR (
    pkg.package_code = 'MEDIA_FILL_PACKAGE'
    AND child.member_code = 'MEDIA_HOLD_RELEASE'
    AND predecessor.member_code = 'MEDIA_CHARGE'
  )
  OR (
    pkg.package_code = 'SS_CIP_SIP_PACKAGE'
    AND (
      (child.member_code = 'CIP_CYCLE' AND predecessor.member_code = 'PRE_RINSE')
      OR (child.member_code = 'SIP_CYCLE' AND predecessor.member_code = 'CIP_CYCLE')
      OR (child.member_code = 'CLEAN_HOLD_RELEASE' AND predecessor.member_code = 'SIP_CYCLE')
    )
  )
  OR (
    pkg.package_code = 'BUFFER_TANK_SETUP_PACKAGE'
    AND child.member_code = 'LINE_INTEGRITY_CHECK'
    AND predecessor.member_code = 'TANK_ASSEMBLY'
  );

INSERT IGNORE INTO v3_trigger_rules (
  template_id,
  rule_code,
  target_node_id,
  anchor_mode,
  anchor_ref_code,
  trigger_mode,
  operation_code,
  operation_name,
  default_duration_minutes,
  earliest_offset_minutes,
  recommended_offset_minutes,
  latest_offset_minutes,
  repeat_every_minutes,
  repeat_until_node_id,
  dependency_rule_code,
  generator_package_id,
  target_equipment_state,
  target_material_state,
  is_blocking,
  sort_order,
  metadata
)
SELECT
  t.id,
  seeded.rule_code,
  target_node.id,
  seeded.anchor_mode,
  seeded.anchor_ref_code,
  seeded.trigger_mode,
  seeded.operation_code,
  seeded.operation_name,
  seeded.default_duration_minutes,
  seeded.earliest_offset_minutes,
  seeded.recommended_offset_minutes,
  seeded.latest_offset_minutes,
  seeded.repeat_every_minutes,
  repeat_until_node.id,
  seeded.dependency_rule_code,
  package_ref.id,
  seeded.target_equipment_state,
  seeded.target_material_state,
  seeded.is_blocking,
  seeded.sort_order,
  seeded.metadata
FROM (
  SELECT
    'USP_UPSTREAM_CULTURE_V3' AS template_code,
    'USP_SETUP_BEFORE_CULTURE' AS rule_code,
    'CELL_CULTURE' AS target_node_key,
    'NODE_START' AS anchor_mode,
    NULL AS anchor_ref_code,
    'PACKAGE_BEFORE_START' AS trigger_mode,
    NULL AS operation_code,
    NULL AS operation_name,
    0 AS default_duration_minutes,
    NULL AS earliest_offset_minutes,
    NULL AS recommended_offset_minutes,
    NULL AS latest_offset_minutes,
    NULL AS repeat_every_minutes,
    NULL AS repeat_until_node_key,
    NULL AS dependency_rule_code,
    'SUS_BIOREACTOR_SETUP' AS generator_package_code,
    'setup' AS target_equipment_state,
    NULL AS target_material_state,
    1 AS is_blocking,
    10 AS sort_order,
    JSON_OBJECT('purpose', '达到 setup 状态后才能培养基灌注')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'USP_MEDIA_FILL_BEFORE_CULTURE',
    'CELL_CULTURE',
    'NODE_START',
    NULL,
    'PACKAGE_BEFORE_START',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'MEDIA_FILL_PACKAGE',
    'media_holding',
    'in_hold',
    1,
    20,
    JSON_OBJECT('hold_window_hours', 24, 'purpose', '培养前需处于 media_holding')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'USP_FIRST_SAMPLE',
    'CELL_THAW',
    'NODE_START',
    NULL,
    'WINDOW',
    'USP-SAMPLE-FIRST',
    '首次取样',
    20,
    0,
    60,
    120,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    30,
    JSON_OBJECT('window_label', '复苏开始后 2 小时内')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'USP_DAILY_SAMPLE',
    'INOCULATION',
    'NODE_END',
    NULL,
    'RECURRING_WINDOW',
    'USP-SAMPLE-DAILY',
    '日常取样',
    20,
    960,
    1440,
    1920,
    1440,
    'PASSAGE',
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    40,
    JSON_OBJECT('window_label', '接种完成后每日 ±8h')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'USP_FEED_AFTER_SAMPLE',
    'CELL_CULTURE',
    'RULE_END',
    'USP_DAILY_SAMPLE',
    'FOLLOW_DEPENDENCY',
    'USP-FEED',
    '补料',
    45,
    30,
    60,
    180,
    NULL,
    NULL,
    'USP_DAILY_SAMPLE',
    NULL,
    NULL,
    NULL,
    0,
    50,
    JSON_OBJECT('dependency', 'after_sample')
  UNION ALL
  SELECT
    'USP_UPSTREAM_CULTURE_V3',
    'USP_PROCESSING_GATE',
    'CELL_CULTURE',
    'NODE_START',
    NULL,
    'STATE_GATE',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'processing',
    'in_hold',
    1,
    60,
    JSON_OBJECT('purpose', '进入 processing 前必须满足设备态和物料态')
  UNION ALL
  SELECT
    'DSP_CAPTURE_SS_V3',
    'DSP_CIP_SIP_BEFORE_LOAD',
    'LOAD_COLUMN',
    'NODE_START',
    NULL,
    'PACKAGE_BEFORE_START',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'SS_CIP_SIP_PACKAGE',
    'clean_hold',
    NULL,
    1,
    10,
    JSON_OBJECT('purpose', '上柱前需处于 clean_hold')
  UNION ALL
  SELECT
    'DSP_CAPTURE_SS_V3',
    'DSP_LOAD_QC_SAMPLE',
    'LOAD_COLUMN',
    'NODE_END',
    NULL,
    'WINDOW',
    'DSP-INPROC-SAMPLE',
    '层析中控取样',
    15,
    0,
    30,
    90,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    20,
    JSON_OBJECT('window_label', '上柱后 90 分钟内')
  UNION ALL
  SELECT
    'SPI_MEDIA_PREP_V3',
    'SPI_BUFFER_SETUP_BEFORE_PREP',
    'MEDIA_PREP',
    'NODE_START',
    NULL,
    'PACKAGE_BEFORE_START',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'BUFFER_TANK_SETUP_PACKAGE',
    'setup',
    NULL,
    1,
    10,
    JSON_OBJECT('purpose', '配液前需完成 setup')
  UNION ALL
  SELECT
    'SPI_MEDIA_PREP_V3',
    'SPI_MEDIA_HOLD_GATE',
    'MEDIA_RELEASE',
    'NODE_START',
    NULL,
    'STATE_GATE',
    NULL,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'media_holding',
    'in_hold',
    1,
    20,
    JSON_OBJECT('purpose', '放行前需处于 media_holding / in_hold')
  UNION ALL
  SELECT
    'SPI_MEDIA_PREP_V3',
    'SPI_MEDIA_SAMPLE',
    'MEDIA_PREP',
    'NODE_END',
    NULL,
    'WINDOW',
    'SPI-MEDIA-SAMPLE',
    '培养基取样',
    15,
    0,
    30,
    120,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    30,
    JSON_OBJECT('window_label', '制备完成后 2 小时内')
) AS seeded
JOIN v3_templates t ON t.template_code = seeded.template_code
LEFT JOIN v3_main_flow_nodes target_node
  ON target_node.template_id = t.id
 AND target_node.node_key = seeded.target_node_key
LEFT JOIN v3_main_flow_nodes repeat_until_node
  ON repeat_until_node.template_id = t.id
 AND repeat_until_node.node_key = seeded.repeat_until_node_key
LEFT JOIN v3_operation_packages package_ref
  ON package_ref.package_code = seeded.generator_package_code;
