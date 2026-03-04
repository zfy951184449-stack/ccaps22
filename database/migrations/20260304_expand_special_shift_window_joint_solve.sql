SET @rule_has_fulfillment_mode := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'special_shift_window_rules'
    AND COLUMN_NAME = 'fulfillment_mode'
);
SET @rule_sql := IF(
  @rule_has_fulfillment_mode = 0,
  "ALTER TABLE special_shift_window_rules ADD COLUMN fulfillment_mode ENUM('HARD', 'SOFT') NOT NULL DEFAULT 'HARD' AFTER plan_category",
  'SELECT 1'
);
PREPARE stmt FROM @rule_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @rule_has_priority_level := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'special_shift_window_rules'
    AND COLUMN_NAME = 'priority_level'
);
SET @rule_priority_sql := IF(
  @rule_has_priority_level = 0,
  "ALTER TABLE special_shift_window_rules ADD COLUMN priority_level ENUM('CRITICAL', 'HIGH', 'NORMAL') NOT NULL DEFAULT 'HIGH' AFTER fulfillment_mode",
  'SELECT 1'
);
PREPARE stmt FROM @rule_priority_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @occ_has_fulfillment_mode := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'special_shift_occurrences'
    AND COLUMN_NAME = 'fulfillment_mode'
);
SET @occ_sql := IF(
  @occ_has_fulfillment_mode = 0,
  "ALTER TABLE special_shift_occurrences ADD COLUMN fulfillment_mode ENUM('HARD', 'SOFT') NOT NULL DEFAULT 'HARD' AFTER plan_category",
  'SELECT 1'
);
PREPARE stmt FROM @occ_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @occ_has_priority_level := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'special_shift_occurrences'
    AND COLUMN_NAME = 'priority_level'
);
SET @occ_priority_sql := IF(
  @occ_has_priority_level = 0,
  "ALTER TABLE special_shift_occurrences ADD COLUMN priority_level ENUM('CRITICAL', 'HIGH', 'NORMAL') NOT NULL DEFAULT 'HIGH' AFTER fulfillment_mode",
  'SELECT 1'
);
PREPARE stmt FROM @occ_priority_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE special_shift_occurrences
  MODIFY COLUMN status ENUM('PENDING', 'SCHEDULED', 'APPLIED', 'PARTIAL', 'CANCELLED', 'INFEASIBLE') NOT NULL DEFAULT 'PENDING';

