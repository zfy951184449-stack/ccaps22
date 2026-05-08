import pool from '../../backend/src/config/database';
import { columnExists, foreignKeyExists, indexExists, runPreflight, tableExists } from './preflight_schema_check';

type StepKind = 'table' | 'column' | 'index' | 'foreignKey' | 'seed';

interface MigrationStep {
  name: string;
  kind: StepKind;
  tableName?: string;
  objectName?: string;
  sql: string;
}

const tableStep = (tableName: string, sql: string): MigrationStep => ({
  name: `create-table:${tableName}`,
  kind: 'table',
  tableName,
  objectName: tableName,
  sql,
});

const columnStep = (tableName: string, columnName: string, sql: string): MigrationStep => ({
  name: `add-column:${tableName}.${columnName}`,
  kind: 'column',
  tableName,
  objectName: columnName,
  sql,
});

const indexStep = (tableName: string, indexName: string, sql: string): MigrationStep => ({
  name: `create-index:${tableName}.${indexName}`,
  kind: 'index',
  tableName,
  objectName: indexName,
  sql,
});

const foreignKeyStep = (tableName: string, constraintName: string, sql: string): MigrationStep => ({
  name: `add-fk:${tableName}.${constraintName}`,
  kind: 'foreignKey',
  tableName,
  objectName: constraintName,
  sql,
});

const seedStep = (name: string, sql: string): MigrationStep => ({
  name,
  kind: 'seed',
  sql,
});

const STEPS: MigrationStep[] = [
  tableStep('users', `
    CREATE TABLE users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      display_name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NULL,
      auth_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_PLACEHOLDER',
      external_subject VARCHAR(255) NULL,
      user_status ENUM('ACTIVE','INACTIVE','LOCKED','RETIRED') NOT NULL DEFAULT 'ACTIVE',
      mfa_required TINYINT(1) NOT NULL DEFAULT 0,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_users_username (username),
      UNIQUE KEY uk_users_email (email),
      KEY idx_users_status (user_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('roles', `
    CREATE TABLE roles (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      role_code VARCHAR(100) NOT NULL,
      role_name VARCHAR(200) NOT NULL,
      role_scope ENUM('SYSTEM','APS','ROSTER','MASTER_DATA','GOVERNANCE','INTEGRATION') NOT NULL DEFAULT 'SYSTEM',
      role_status ENUM('ACTIVE','INACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
      description TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_roles_code (role_code),
      KEY idx_roles_scope_status (role_scope, role_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('permissions', `
    CREATE TABLE permissions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      permission_code VARCHAR(150) NOT NULL,
      permission_name VARCHAR(200) NOT NULL,
      permission_domain ENUM('APS','ROSTER','MASTER_DATA','GOVERNANCE','INTEGRATION','SYSTEM') NOT NULL,
      action_code VARCHAR(80) NOT NULL,
      resource_code VARCHAR(120) NOT NULL,
      permission_status ENUM('ACTIVE','INACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_permissions_code (permission_code),
      KEY idx_permissions_domain (permission_domain, action_code, resource_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('user_role_assignments', `
    CREATE TABLE user_role_assignments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      role_id BIGINT NOT NULL,
      effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to DATETIME NULL,
      assignment_status ENUM('ACTIVE','EXPIRED','REVOKED') NOT NULL DEFAULT 'ACTIVE',
      assigned_by BIGINT NULL,
      assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reason_text VARCHAR(500) NULL,
      UNIQUE KEY uk_user_role_effective_from (user_id, role_id, effective_from),
      KEY idx_user_role_user (user_id),
      KEY idx_user_role_role (role_id),
      CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES roles(id),
      CONSTRAINT fk_user_role_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('role_permissions', `
    CREATE TABLE role_permissions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      role_id BIGINT NOT NULL,
      permission_id BIGINT NOT NULL,
      grant_status ENUM('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
      granted_by BIGINT NULL,
      granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_role_permission (role_id, permission_id),
      KEY idx_role_permissions_role (role_id),
      KEY idx_role_permissions_permission (permission_id),
      CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
      CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id),
      CONSTRAINT fk_role_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('user_employee_links', `
    CREATE TABLE user_employee_links (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      employee_id INT NOT NULL,
      link_status ENUM('ACTIVE','INACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
      effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to DATETIME NULL,
      linked_by BIGINT NULL,
      linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_employee_effective_from (user_id, employee_id, effective_from),
      KEY idx_user_employee_user (user_id),
      KEY idx_user_employee_employee (employee_id),
      CONSTRAINT fk_user_employee_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_user_employee_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
      CONSTRAINT fk_user_employee_linked_by FOREIGN KEY (linked_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  seedStep('seed-governance-roles', `
    INSERT IGNORE INTO roles (role_code, role_name, role_scope)
    VALUES
      ('APS_PLANNER', 'APS Planner', 'APS'),
      ('APS_APPROVER', 'APS Approver', 'APS'),
      ('MASTER_DATA_STEWARD', 'Master Data Steward', 'MASTER_DATA'),
      ('GOVERNANCE_ADMIN', 'Governance Admin', 'GOVERNANCE')
  `),
  seedStep('seed-phase0a-permissions', `
    INSERT IGNORE INTO permissions
      (permission_code, permission_name, permission_domain, action_code, resource_code)
    VALUES
      ('APS_SCENARIO_READ', 'Read APS scenarios', 'APS', 'READ', 'APS_SCENARIO'),
      ('APS_SCENARIO_WRITE', 'Create or update APS scenarios', 'APS', 'WRITE', 'APS_SCENARIO'),
      ('APS_SCENARIO_APPROVE', 'Approve APS scenarios', 'APS', 'APPROVE', 'APS_SCENARIO'),
      ('MASTER_RECIPE_WRITE', 'Create planning recipe versions', 'MASTER_DATA', 'WRITE', 'RECIPE_VERSION'),
      ('CONSTRAINT_CATALOG_WRITE', 'Maintain planning constraint catalog', 'APS', 'WRITE', 'CONSTRAINT_DEFINITION')
  `),
  tableStep('aps_scenarios', `
    CREATE TABLE aps_scenarios (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  columnStep('scheduling_runs', 'scenario_id', `ALTER TABLE scheduling_runs ADD COLUMN scenario_id BIGINT NULL`),
  columnStep('scheduling_runs', 'run_context', `ALTER TABLE scheduling_runs ADD COLUMN run_context ENUM('LEGACY','APS','ROSTER') NOT NULL DEFAULT 'LEGACY'`),
  indexStep('scheduling_runs', 'idx_scheduling_runs_scenario', `CREATE INDEX idx_scheduling_runs_scenario ON scheduling_runs (scenario_id)`),
  indexStep('scheduling_runs', 'idx_scheduling_runs_context_status', `CREATE INDEX idx_scheduling_runs_context_status ON scheduling_runs (run_context, status)`),
  foreignKeyStep('scheduling_runs', 'fk_scheduling_runs_scenario', `ALTER TABLE scheduling_runs ADD CONSTRAINT fk_scheduling_runs_scenario FOREIGN KEY (scenario_id) REFERENCES aps_scenarios(id)`),
  columnStep('scheduling_results', 'scenario_id', `ALTER TABLE scheduling_results ADD COLUMN scenario_id BIGINT NULL`),
  columnStep('scheduling_results', 'result_context', `ALTER TABLE scheduling_results ADD COLUMN result_context ENUM('LEGACY','APS','ROSTER') NOT NULL DEFAULT 'LEGACY'`),
  indexStep('scheduling_results', 'idx_scheduling_results_scenario', `CREATE INDEX idx_scheduling_results_scenario ON scheduling_results (scenario_id)`),
  indexStep('scheduling_results', 'idx_scheduling_results_context_state', `CREATE INDEX idx_scheduling_results_context_state ON scheduling_results (result_context, result_state)`),
  foreignKeyStep('scheduling_results', 'fk_scheduling_results_scenario', `ALTER TABLE scheduling_results ADD CONSTRAINT fk_scheduling_results_scenario FOREIGN KEY (scenario_id) REFERENCES aps_scenarios(id)`),
  tableStep('constraint_definitions', `
    CREATE TABLE constraint_definitions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      constraint_code VARCHAR(100) NOT NULL,
      constraint_name VARCHAR(255) NOT NULL,
      category ENUM('FLOW_WINDOW','QUALITY_GATE','EQUIPMENT_STATE','UTILITY_CAPACITY','SPACE_SEGREGATION','WORKFORCE_COVERAGE','ROSTER_QUALIFICATION','ROSTER_HANDOVER','ROSTER_TRANSITION','ROSTER_REST') NOT NULL,
      hard_or_soft_default ENUM('hard','soft') NOT NULL DEFAULT 'hard',
      default_severity ENUM('info','warning','critical') NOT NULL DEFAULT 'critical',
      violation_message_template VARCHAR(1000) NOT NULL,
      suggested_action_template VARCHAR(1000) NULL,
      owner_domain ENUM('APS','ROSTER','MASTER_DATA','GOVERNANCE','INTEGRATION') NOT NULL DEFAULT 'APS',
      lifecycle_status ENUM('DRAFT','ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
      effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to DATETIME NULL,
      planning_criticality ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'HIGH',
      quality_relevant TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_constraint_definitions_code (constraint_code),
      KEY idx_constraint_definitions_category (category),
      KEY idx_constraint_definitions_status (lifecycle_status, effective_from, effective_to),
      CONSTRAINT fk_constraint_definitions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('aps_conflicts', `
    CREATE TABLE aps_conflicts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      scenario_id BIGINT NOT NULL,
      constraint_code VARCHAR(100) NOT NULL,
      severity ENUM('info','warning','critical') NOT NULL,
      hard_or_soft ENUM('hard','soft') NOT NULL,
      entity_type VARCHAR(100) NULL,
      entity_id BIGINT NULL,
      batch_plan_id INT NULL,
      batch_operation_plan_id INT NULL,
      resource_id INT NULL,
      material_lot_id BIGINT NULL,
      time_window_start DATETIME NULL,
      time_window_end DATETIME NULL,
      violation_reason VARCHAR(2000) NOT NULL,
      suggested_action VARCHAR(2000) NULL,
      conflict_status ENUM('OPEN','ACKNOWLEDGED','WAIVED','RESOLVED','SUPERSEDED') NOT NULL DEFAULT 'OPEN',
      detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      detected_by_run_id BIGINT UNSIGNED NULL,
      resolved_at DATETIME NULL,
      resolved_by BIGINT NULL,
      resolution_reason VARCHAR(1000) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_aps_conflicts_scenario_status (scenario_id, conflict_status),
      KEY idx_aps_conflicts_constraint (constraint_code),
      KEY idx_aps_conflicts_entity (entity_type, entity_id),
      KEY idx_aps_conflicts_batch (batch_plan_id, batch_operation_plan_id),
      KEY idx_aps_conflicts_resource (resource_id),
      KEY idx_aps_conflicts_time (time_window_start, time_window_end),
      KEY idx_aps_conflicts_run (detected_by_run_id),
      CONSTRAINT fk_aps_conflicts_scenario FOREIGN KEY (scenario_id) REFERENCES aps_scenarios(id),
      CONSTRAINT fk_aps_conflicts_constraint FOREIGN KEY (constraint_code) REFERENCES constraint_definitions(constraint_code),
      CONSTRAINT fk_aps_conflicts_batch_plan FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id),
      CONSTRAINT fk_aps_conflicts_batch_operation FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id),
      CONSTRAINT fk_aps_conflicts_resource FOREIGN KEY (resource_id) REFERENCES resources(id),
      CONSTRAINT fk_aps_conflicts_run FOREIGN KEY (detected_by_run_id) REFERENCES scheduling_runs(id),
      CONSTRAINT fk_aps_conflicts_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  seedStep('seed-phase0a-constraint-catalog', `
    INSERT IGNORE INTO constraint_definitions
      (constraint_code, constraint_name, category, hard_or_soft_default, default_severity,
       violation_message_template, suggested_action_template, owner_domain, lifecycle_status, planning_criticality, quality_relevant)
    VALUES
      ('FLOW_OPERATION_DEPENDENCY', 'Operation dependency violation', 'FLOW_WINDOW', 'hard', 'critical',
       'Operation {successor} violates dependency from {predecessor}; expected window {expected_window}, actual {actual_window}.',
       'Adjust scenario timing or mark scenario infeasible; do not auto-shift silently.', 'APS', 'ACTIVE', 'HIGH', 0),
      ('FLOW_MAX_HOLD_EXCEEDED', 'Maximum hold time exceeded', 'FLOW_WINDOW', 'hard', 'critical',
       'Hold time between {from_operation} and {to_operation} exceeds {max_hold}.',
       'Review batch timing, material/equipment hold state, or mark infeasible.', 'APS', 'ACTIVE', 'HIGH', 0),
      ('QUALITY_QC_EXTERNAL_STATUS_NOT_READY', 'QC/QA external status not ready', 'QUALITY_GATE', 'hard', 'critical',
       'Downstream operation {operation} has planning risk because external QC/QA status reference {gate} is not ready.',
       'Review external status reference or revise the planning scenario.', 'APS', 'ACTIVE', 'HIGH', 1),
      ('EQUIPMENT_NO_OVERLAP', 'Equipment no-overlap violation', 'EQUIPMENT_STATE', 'hard', 'critical',
       'Resource {resource} is assigned to overlapping operations in scenario {scenario}.',
       'Select another resource or revise operation timing.', 'APS', 'ACTIVE', 'HIGH', 0),
      ('SPACE_SUITE_NO_OVERLAP', 'Suite no-overlap violation', 'SPACE_SEGREGATION', 'hard', 'critical',
       'Suite {suite} has overlapping occupancy in scenario {scenario}.',
       'Resolve suite occupancy or split scenario.', 'APS', 'ACTIVE', 'HIGH', 0),
      ('WORKFORCE_SKILL_DEMAND_NOT_COVERED', 'Skill demand not covered', 'WORKFORCE_COVERAGE', 'hard', 'critical',
       'Skill demand {skill} requires {required_count}; roster capacity is {available_count}.',
       'Request roster replan or revise APS scenario.', 'APS', 'ACTIVE', 'HIGH', 0)
  `),
  tableStep('products', `
    CREATE TABLE products (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_code VARCHAR(100) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      molecule_name VARCHAR(255) NULL,
      product_family VARCHAR(120) NULL,
      modality VARCHAR(120) NULL,
      default_scale_liters DECIMAL(12,2) NULL,
      status ENUM('ACTIVE','INACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_products_code (product_code),
      KEY idx_products_status (status),
      CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('recipe_versions', `
    CREATE TABLE recipe_versions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT NOT NULL,
      recipe_code VARCHAR(100) NOT NULL,
      recipe_name VARCHAR(255) NOT NULL,
      version_no VARCHAR(50) NOT NULL,
      scale_liters DECIMAL(12,2) NULL,
      lifecycle_status ENUM('DRAFT','APPROVED','EFFECTIVE','RETIRED') NOT NULL DEFAULT 'DRAFT',
      effective_from DATETIME NULL,
      effective_to DATETIME NULL,
      source_template_id INT NULL,
      approved_by BIGINT NULL,
      approved_at DATETIME NULL,
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_recipe_versions_code_version (recipe_code, version_no),
      KEY idx_recipe_versions_product_status (product_id, lifecycle_status),
      KEY idx_recipe_versions_template (source_template_id),
      CONSTRAINT fk_recipe_versions_product FOREIGN KEY (product_id) REFERENCES products(id),
      CONSTRAINT fk_recipe_versions_source_template FOREIGN KEY (source_template_id) REFERENCES process_templates(id),
      CONSTRAINT fk_recipe_versions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
      CONSTRAINT fk_recipe_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('recipe_unit_operations', `
    CREATE TABLE recipe_unit_operations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      recipe_version_id BIGINT NOT NULL,
      unit_op_code VARCHAR(100) NOT NULL,
      unit_op_name VARCHAR(255) NOT NULL,
      sequence_no INT NOT NULL,
      process_area ENUM('USP','DSP','SPI','QC','QA','WAREHOUSE','ENGINEERING','ANCILLARY') NOT NULL,
      semantic_type VARCHAR(100) NULL,
      default_duration_minutes INT NULL,
      min_duration_minutes INT NULL,
      max_duration_minutes INT NULL,
      earliest_offset_minutes INT NULL,
      latest_offset_minutes INT NULL,
      hold_time_limit_minutes INT NULL,
      requires_qc_status_ready TINYINT(1) NOT NULL DEFAULT 0,
      is_continuous TINYINT(1) NOT NULL DEFAULT 0,
      is_biological_fixed_duration TINYINT(1) NOT NULL DEFAULT 0,
      required_people INT NULL,
      source_stage_operation_id INT NULL,
      operation_status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_recipe_unit_operations_code (recipe_version_id, unit_op_code),
      KEY idx_recipe_unit_operations_sequence (recipe_version_id, sequence_no),
      KEY idx_recipe_unit_operations_area (process_area),
      KEY idx_recipe_unit_operations_source (source_stage_operation_id),
      CONSTRAINT fk_recipe_unit_operations_recipe FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
      CONSTRAINT fk_recipe_unit_operations_source FOREIGN KEY (source_stage_operation_id) REFERENCES stage_operation_schedules(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('operation_dependencies', `
    CREATE TABLE operation_dependencies (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      recipe_version_id BIGINT NOT NULL,
      predecessor_unit_op_id BIGINT NOT NULL,
      successor_unit_op_id BIGINT NOT NULL,
      dependency_type ENUM('FS','SS','FF','SF') NOT NULL DEFAULT 'FS',
      lag_type ENUM('ASAP','FIXED','WINDOW','NEXT_DAY','NEXT_SHIFT','COOLING','BATCH_END','MAX_HOLD','ZERO_WAIT') NOT NULL DEFAULT 'ASAP',
      lag_min_minutes INT NULL,
      lag_max_minutes INT NULL,
      constraint_code VARCHAR(100) NOT NULL DEFAULT 'FLOW_OPERATION_DEPENDENCY',
      hard_or_soft ENUM('hard','soft') NOT NULL DEFAULT 'hard',
      severity ENUM('info','warning','critical') NOT NULL DEFAULT 'critical',
      dependency_status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      source_operation_constraint_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_operation_dependencies_recipe (recipe_version_id),
      KEY idx_operation_dependencies_pred (predecessor_unit_op_id),
      KEY idx_operation_dependencies_succ (successor_unit_op_id),
      KEY idx_operation_dependencies_constraint (constraint_code),
      CONSTRAINT fk_operation_dependencies_recipe FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
      CONSTRAINT fk_operation_dependencies_pred FOREIGN KEY (predecessor_unit_op_id) REFERENCES recipe_unit_operations(id),
      CONSTRAINT fk_operation_dependencies_succ FOREIGN KEY (successor_unit_op_id) REFERENCES recipe_unit_operations(id),
      CONSTRAINT fk_operation_dependencies_constraint FOREIGN KEY (constraint_code) REFERENCES constraint_definitions(constraint_code),
      CONSTRAINT fk_operation_dependencies_source FOREIGN KEY (source_operation_constraint_id) REFERENCES operation_constraints(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('recipe_operation_skill_requirements', `
    CREATE TABLE recipe_operation_skill_requirements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      recipe_version_id BIGINT NOT NULL,
      recipe_unit_operation_id BIGINT NOT NULL,
      qualification_id INT NULL,
      skill_code VARCHAR(120) NOT NULL,
      required_count INT NOT NULL DEFAULT 1,
      min_level INT NULL,
      area_code VARCHAR(80) NULL,
      product_scope VARCHAR(120) NULL,
      criticality ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'HIGH',
      requires_supervisor TINYINT(1) NOT NULL DEFAULT 0,
      requires_qa_on_floor TINYINT(1) NOT NULL DEFAULT 0,
      requires_two_person_verification TINYINT(1) NOT NULL DEFAULT 0,
      handover_overlap_minutes INT NOT NULL DEFAULT 0,
      gowning_minutes INT NOT NULL DEFAULT 0,
      requirement_status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
      source_operation_qualification_requirement_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_recipe_skill_recipe (recipe_version_id),
      KEY idx_recipe_skill_operation (recipe_unit_operation_id),
      KEY idx_recipe_skill_qualification (qualification_id),
      KEY idx_recipe_skill_code (skill_code),
      CONSTRAINT fk_recipe_skill_recipe FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
      CONSTRAINT fk_recipe_skill_operation FOREIGN KEY (recipe_unit_operation_id) REFERENCES recipe_unit_operations(id),
      CONSTRAINT fk_recipe_skill_qualification FOREIGN KEY (qualification_id) REFERENCES qualifications(id),
      CONSTRAINT fk_recipe_skill_source FOREIGN KEY (source_operation_qualification_requirement_id) REFERENCES operation_qualification_requirements(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('campaigns', `
    CREATE TABLE campaigns (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      campaign_code VARCHAR(100) NOT NULL,
      campaign_name VARCHAR(255) NOT NULL,
      product_id BIGINT NOT NULL,
      recipe_version_id BIGINT NOT NULL,
      site_code VARCHAR(80) NULL,
      building_code VARCHAR(80) NULL,
      suite_group_code VARCHAR(80) NULL,
      target_batch_count INT NULL,
      planned_start DATETIME NOT NULL,
      planned_end DATETIME NOT NULL,
      campaign_status ENUM('DRAFT','APPROVED','SCHEDULED','PUBLISHED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
      changeover_policy VARCHAR(120) NULL,
      created_by BIGINT NULL,
      approved_by BIGINT NULL,
      published_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME NULL,
      published_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_campaigns_code (campaign_code),
      KEY idx_campaigns_product_start (product_id, planned_start),
      KEY idx_campaigns_recipe (recipe_version_id),
      KEY idx_campaigns_status (campaign_status),
      CONSTRAINT fk_campaigns_product FOREIGN KEY (product_id) REFERENCES products(id),
      CONSTRAINT fk_campaigns_recipe FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
      CONSTRAINT fk_campaigns_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      CONSTRAINT fk_campaigns_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
      CONSTRAINT fk_campaigns_published_by FOREIGN KEY (published_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('batch_recipe_snapshots', `
    CREATE TABLE batch_recipe_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      batch_plan_id INT NOT NULL,
      recipe_version_id BIGINT NOT NULL,
      recipe_version_no VARCHAR(50) NOT NULL,
      snapshot_version INT NOT NULL DEFAULT 1,
      snapshot_json JSON NOT NULL,
      unit_operations_json JSON NOT NULL,
      dependencies_json JSON NOT NULL,
      bom_snapshot_json JSON NULL,
      snapshot_status ENUM('ACTIVE','SUPERSEDED') NOT NULL DEFAULT 'ACTIVE',
      snapshotted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      snapshotted_by BIGINT NULL,
      UNIQUE KEY uk_batch_recipe_snapshot_version (batch_plan_id, snapshot_version),
      KEY idx_batch_recipe_snapshots_batch (batch_plan_id),
      KEY idx_batch_recipe_snapshots_recipe (recipe_version_id),
      CONSTRAINT fk_batch_recipe_snapshots_batch FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id),
      CONSTRAINT fk_batch_recipe_snapshots_recipe FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
      CONSTRAINT fk_batch_recipe_snapshots_by FOREIGN KEY (snapshotted_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('campaign_batches', `
    CREATE TABLE campaign_batches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      campaign_id BIGINT NOT NULL,
      batch_plan_id INT NOT NULL,
      batch_sequence_no INT NOT NULL,
      batch_code VARCHAR(100) NOT NULL,
      planned_scale_liters DECIMAL(12,2) NULL,
      recipe_snapshot_id BIGINT NULL,
      batch_status ENUM('PLANNED','SCHEDULED','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_campaign_batches_sequence (campaign_id, batch_sequence_no),
      UNIQUE KEY uk_campaign_batches_batch_plan (batch_plan_id),
      KEY idx_campaign_batches_campaign (campaign_id),
      KEY idx_campaign_batches_snapshot (recipe_snapshot_id),
      CONSTRAINT fk_campaign_batches_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      CONSTRAINT fk_campaign_batches_batch FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id),
      CONSTRAINT fk_campaign_batches_snapshot FOREIGN KEY (recipe_snapshot_id) REFERENCES batch_recipe_snapshots(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  tableStep('status_transition_events', `
    CREATE TABLE status_transition_events (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `),
  columnStep('production_batch_plans', 'product_id', `ALTER TABLE production_batch_plans ADD COLUMN product_id BIGINT NULL`),
  columnStep('production_batch_plans', 'recipe_version_id', `ALTER TABLE production_batch_plans ADD COLUMN recipe_version_id BIGINT NULL`),
  columnStep('production_batch_plans', 'campaign_id', `ALTER TABLE production_batch_plans ADD COLUMN campaign_id BIGINT NULL`),
  columnStep('production_batch_plans', 'recipe_snapshot_id', `ALTER TABLE production_batch_plans ADD COLUMN recipe_snapshot_id BIGINT NULL`),
  columnStep('production_batch_plans', 'planning_status', `ALTER TABLE production_batch_plans ADD COLUMN planning_status ENUM('DRAFT','SCHEDULED','CHECKED','APPROVED','PUBLISHED','ARCHIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT'`),
  indexStep('production_batch_plans', 'idx_pbp_product', `CREATE INDEX idx_pbp_product ON production_batch_plans (product_id)`),
  indexStep('production_batch_plans', 'idx_pbp_recipe_version', `CREATE INDEX idx_pbp_recipe_version ON production_batch_plans (recipe_version_id)`),
  indexStep('production_batch_plans', 'idx_pbp_campaign', `CREATE INDEX idx_pbp_campaign ON production_batch_plans (campaign_id)`),
  indexStep('production_batch_plans', 'idx_pbp_recipe_snapshot', `CREATE INDEX idx_pbp_recipe_snapshot ON production_batch_plans (recipe_snapshot_id)`),
  foreignKeyStep('production_batch_plans', 'fk_pbp_product', `ALTER TABLE production_batch_plans ADD CONSTRAINT fk_pbp_product FOREIGN KEY (product_id) REFERENCES products(id)`),
  foreignKeyStep('production_batch_plans', 'fk_pbp_recipe_version', `ALTER TABLE production_batch_plans ADD CONSTRAINT fk_pbp_recipe_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id)`),
  foreignKeyStep('production_batch_plans', 'fk_pbp_campaign', `ALTER TABLE production_batch_plans ADD CONSTRAINT fk_pbp_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id)`),
  foreignKeyStep('production_batch_plans', 'fk_pbp_recipe_snapshot', `ALTER TABLE production_batch_plans ADD CONSTRAINT fk_pbp_recipe_snapshot FOREIGN KEY (recipe_snapshot_id) REFERENCES batch_recipe_snapshots(id)`),
  columnStep('batch_operation_plans', 'recipe_unit_operation_id', `ALTER TABLE batch_operation_plans ADD COLUMN recipe_unit_operation_id BIGINT NULL`),
  columnStep('batch_operation_plans', 'operation_planning_status', `ALTER TABLE batch_operation_plans ADD COLUMN operation_planning_status ENUM('draft','scheduled','running','completed','blocked','infeasible') NOT NULL DEFAULT 'draft'`),
  indexStep('batch_operation_plans', 'idx_bop_recipe_unit_operation', `CREATE INDEX idx_bop_recipe_unit_operation ON batch_operation_plans (recipe_unit_operation_id)`),
  indexStep('batch_operation_plans', 'idx_bop_operation_planning_status', `CREATE INDEX idx_bop_operation_planning_status ON batch_operation_plans (operation_planning_status)`),
  foreignKeyStep('batch_operation_plans', 'fk_bop_recipe_unit_operation', `ALTER TABLE batch_operation_plans ADD CONSTRAINT fk_bop_recipe_unit_operation FOREIGN KEY (recipe_unit_operation_id) REFERENCES recipe_unit_operations(id)`),
  columnStep('process_templates', 'migrated_recipe_version_id', `ALTER TABLE process_templates ADD COLUMN migrated_recipe_version_id BIGINT NULL`),
  indexStep('process_templates', 'idx_process_templates_migrated_recipe', `CREATE INDEX idx_process_templates_migrated_recipe ON process_templates (migrated_recipe_version_id)`),
  foreignKeyStep('process_templates', 'fk_process_templates_migrated_recipe', `ALTER TABLE process_templates ADD CONSTRAINT fk_process_templates_migrated_recipe FOREIGN KEY (migrated_recipe_version_id) REFERENCES recipe_versions(id)`),
  columnStep('stage_operation_schedules', 'migrated_recipe_unit_operation_id', `ALTER TABLE stage_operation_schedules ADD COLUMN migrated_recipe_unit_operation_id BIGINT NULL`),
  indexStep('stage_operation_schedules', 'idx_sos_migrated_unit_operation', `CREATE INDEX idx_sos_migrated_unit_operation ON stage_operation_schedules (migrated_recipe_unit_operation_id)`),
  foreignKeyStep('stage_operation_schedules', 'fk_sos_migrated_unit_operation', `ALTER TABLE stage_operation_schedules ADD CONSTRAINT fk_sos_migrated_unit_operation FOREIGN KEY (migrated_recipe_unit_operation_id) REFERENCES recipe_unit_operations(id)`),
  columnStep('operation_constraints', 'migrated_operation_dependency_id', `ALTER TABLE operation_constraints ADD COLUMN migrated_operation_dependency_id BIGINT NULL`),
  indexStep('operation_constraints', 'idx_operation_constraints_migrated_dependency', `CREATE INDEX idx_operation_constraints_migrated_dependency ON operation_constraints (migrated_operation_dependency_id)`),
  foreignKeyStep('operation_constraints', 'fk_operation_constraints_migrated_dependency', `ALTER TABLE operation_constraints ADD CONSTRAINT fk_operation_constraints_migrated_dependency FOREIGN KEY (migrated_operation_dependency_id) REFERENCES operation_dependencies(id)`),
  columnStep('batch_operation_constraints', 'source_operation_dependency_id', `ALTER TABLE batch_operation_constraints ADD COLUMN source_operation_dependency_id BIGINT NULL`),
  indexStep('batch_operation_constraints', 'idx_batch_constraints_source_dependency', `CREATE INDEX idx_batch_constraints_source_dependency ON batch_operation_constraints (source_operation_dependency_id)`),
  foreignKeyStep('batch_operation_constraints', 'fk_batch_constraints_source_dependency', `ALTER TABLE batch_operation_constraints ADD CONSTRAINT fk_batch_constraints_source_dependency FOREIGN KEY (source_operation_dependency_id) REFERENCES operation_dependencies(id)`),
];

const shouldSkipStep = async (step: MigrationStep): Promise<boolean> => {
  if (step.kind === 'seed') return false;
  if (!step.tableName || !step.objectName) return false;
  if (step.kind === 'table') return tableExists(step.tableName);
  if (step.kind === 'column') return columnExists(step.tableName, step.objectName);
  if (step.kind === 'index') return indexExists(step.tableName, step.objectName);
  if (step.kind === 'foreignKey') return foreignKeyExists(step.tableName, step.objectName);
  return false;
};

export async function runPhase0aMigrations(): Promise<void> {
  const preflight = await runPreflight();
  console.log(`[phase0a] preflight ${preflight.status}`);
  if (preflight.blockers.length > 0) {
    console.error(JSON.stringify(preflight, null, 2));
    throw new Error('PHASE0A_PREFLIGHT_FAILED');
  }

  for (const step of STEPS) {
    try {
      if (await shouldSkipStep(step)) {
        console.log(`[phase0a] skip ${step.name}`);
        continue;
      }
      console.log(`[phase0a] execute ${step.name}`);
      await pool.query(step.sql);
    } catch (error) {
      console.error(`[phase0a] failed step: ${step.name}`);
      throw error;
    }
  }
}

if (require.main === module) {
  runPhase0aMigrations()
    .then(() => {
      console.log('[phase0a] migrations complete');
      return pool.end().then(() => process.exit(0));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      pool.end().finally(() => process.exit(1));
    });
}
