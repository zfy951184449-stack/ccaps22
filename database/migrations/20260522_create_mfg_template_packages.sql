-- MFG day-anchor package schema.
-- Packages combine existing process templates without copying them. A package
-- module gets a role (USP/DSP/BUFFER/etc.), and day links align module days.

CREATE TABLE IF NOT EXISTS mfg_template_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_code VARCHAR(80) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  package_status ENUM('DRAFT','ACTIVE','RETIRED') NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mfg_template_packages_code (package_code),
  KEY idx_mfg_template_packages_status (package_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfg_template_package_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  role_code VARCHAR(40) NOT NULL,
  role_name VARCHAR(120) NOT NULL,
  template_id INT NOT NULL,
  start_offset_days INT NULL,
  is_anchor TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mfg_package_role (package_id, role_code),
  KEY idx_mfg_package_modules_template (template_id),
  CONSTRAINT fk_mfg_package_modules_package
    FOREIGN KEY (package_id) REFERENCES mfg_template_packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_package_modules_template
    FOREIGN KEY (template_id) REFERENCES process_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mfg_template_package_day_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  source_role_code VARCHAR(40) NOT NULL,
  target_role_code VARCHAR(40) NOT NULL,
  source_anchor_day INT NOT NULL,
  target_anchor_day INT NOT NULL,
  lag_days INT NOT NULL DEFAULT 0,
  link_type ENUM('MFG_DAY_ANCHOR') NOT NULL DEFAULT 'MFG_DAY_ANCHOR',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mfg_package_day_links_package (package_id),
  CONSTRAINT fk_mfg_package_day_links_package
    FOREIGN KEY (package_id) REFERENCES mfg_template_packages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @mfg_package_id_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_batch_plans'
    AND COLUMN_NAME = 'mfg_package_id'
);
SET @mfg_package_id_column_sql = IF(
  @mfg_package_id_column_exists = 0,
  'ALTER TABLE production_batch_plans ADD COLUMN mfg_package_id INT NULL AFTER template_id',
  'SELECT 1'
);
PREPARE mfg_package_id_column_stmt FROM @mfg_package_id_column_sql;
EXECUTE mfg_package_id_column_stmt;
DEALLOCATE PREPARE mfg_package_id_column_stmt;

SET @mfg_package_snapshot_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_batch_plans'
    AND COLUMN_NAME = 'mfg_package_snapshot_json'
);
SET @mfg_package_snapshot_column_sql = IF(
  @mfg_package_snapshot_column_exists = 0,
  'ALTER TABLE production_batch_plans ADD COLUMN mfg_package_snapshot_json JSON NULL AFTER mfg_package_id',
  'SELECT 1'
);
PREPARE mfg_package_snapshot_column_stmt FROM @mfg_package_snapshot_column_sql;
EXECUTE mfg_package_snapshot_column_stmt;
DEALLOCATE PREPARE mfg_package_snapshot_column_stmt;

SET @mfg_package_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_batch_plans'
    AND INDEX_NAME = 'idx_pbp_mfg_package'
);
SET @mfg_package_index_sql = IF(
  @mfg_package_index_exists = 0,
  'CREATE INDEX idx_pbp_mfg_package ON production_batch_plans (mfg_package_id)',
  'SELECT 1'
);
PREPARE mfg_package_index_stmt FROM @mfg_package_index_sql;
EXECUTE mfg_package_index_stmt;
DEALLOCATE PREPARE mfg_package_index_stmt;

SET @mfg_package_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_batch_plans'
    AND CONSTRAINT_NAME = 'fk_pbp_mfg_package'
);
SET @mfg_package_fk_sql = IF(
  @mfg_package_fk_exists = 0,
  'ALTER TABLE production_batch_plans ADD CONSTRAINT fk_pbp_mfg_package FOREIGN KEY (mfg_package_id) REFERENCES mfg_template_packages(id)',
  'SELECT 1'
);
PREPARE mfg_package_fk_stmt FROM @mfg_package_fk_sql;
EXECUTE mfg_package_fk_stmt;
DEALLOCATE PREPARE mfg_package_fk_stmt;
