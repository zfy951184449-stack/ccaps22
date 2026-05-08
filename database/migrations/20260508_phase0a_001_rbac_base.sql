-- Phase 0A-1 RBAC base schema.
-- Do not run this file directly in shared environments.
-- Use scripts/phase0a/run_phase0a_migrations.ts, which preflights and skips existing objects.

CREATE TABLE IF NOT EXISTS users (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_role_assignments (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_employee_links (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO roles (role_code, role_name, role_scope)
VALUES
  ('APS_PLANNER', 'APS Planner', 'APS'),
  ('APS_APPROVER', 'APS Approver', 'APS'),
  ('MASTER_DATA_STEWARD', 'Master Data Steward', 'MASTER_DATA'),
  ('GOVERNANCE_ADMIN', 'Governance Admin', 'GOVERNANCE');

INSERT IGNORE INTO permissions
(permission_code, permission_name, permission_domain, action_code, resource_code)
VALUES
  ('APS_SCENARIO_READ', 'Read APS scenarios', 'APS', 'READ', 'APS_SCENARIO'),
  ('APS_SCENARIO_WRITE', 'Create or update APS scenarios', 'APS', 'WRITE', 'APS_SCENARIO'),
  ('APS_SCENARIO_APPROVE', 'Approve APS scenarios', 'APS', 'APPROVE', 'APS_SCENARIO'),
  ('MASTER_RECIPE_WRITE', 'Create recipe versions', 'MASTER_DATA', 'WRITE', 'RECIPE_VERSION'),
  ('CONSTRAINT_CATALOG_WRITE', 'Maintain constraint catalog', 'APS', 'WRITE', 'CONSTRAINT_DEFINITION');
