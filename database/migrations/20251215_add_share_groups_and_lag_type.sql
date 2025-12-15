-- Migration: Process Modeling Optimization - Share Groups and Lag Type
-- Date: 2024-12-15
-- Description: Create personnel share group tables and add lag_type fields
-- =====================================================
-- Part 1: Personnel Share Groups (Template Level)
-- =====================================================
CREATE TABLE IF NOT EXISTS personnel_share_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    template_id INT NOT NULL,
    group_code VARCHAR(20) NOT NULL,
    group_name VARCHAR(50),
    share_mode ENUM('SAME_TEAM', 'DIFFERENT') DEFAULT 'SAME_TEAM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    UNIQUE KEY uk_template_code (template_id, group_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS personnel_share_group_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT NOT NULL,
    schedule_id INT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES personnel_share_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    UNIQUE KEY uk_group_schedule (group_id, schedule_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;
-- =====================================================
-- Part 2: Batch Share Groups (Batch Level)
-- =====================================================
CREATE TABLE IF NOT EXISTS batch_share_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_plan_id INT NOT NULL,
    template_group_id INT,
    group_code VARCHAR(20) NOT NULL,
    group_name VARCHAR(50),
    share_mode ENUM('SAME_TEAM', 'DIFFERENT') DEFAULT 'SAME_TEAM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_plan_id) REFERENCES batch_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (template_group_id) REFERENCES personnel_share_groups(id) ON DELETE
    SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS batch_share_group_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT NOT NULL,
    batch_operation_plan_id INT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES batch_share_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
    UNIQUE KEY uk_batch_group_operation (group_id, batch_operation_plan_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci;
-- =====================================================
-- Part 3: Migrate existing share_personnel data
-- =====================================================
-- Step 1: Create share groups from existing share_personnel constraints
INSERT IGNORE INTO personnel_share_groups (template_id, group_code, group_name, share_mode)
SELECT DISTINCT ps.template_id,
    CONCAT('LEGACY_', oc.id),
    CONCAT('迁移自约束#', oc.id),
    'SAME_TEAM'
FROM operation_constraints oc
    JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
WHERE oc.share_personnel = 1;
-- Step 2: Add members (both schedule_id and predecessor_schedule_id)
INSERT IGNORE INTO personnel_share_group_members (group_id, schedule_id)
SELECT psg.id,
    oc.schedule_id
FROM operation_constraints oc
    JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN personnel_share_groups psg ON psg.group_code = CONCAT('LEGACY_', oc.id)
WHERE oc.share_personnel = 1;
INSERT IGNORE INTO personnel_share_group_members (group_id, schedule_id)
SELECT psg.id,
    oc.predecessor_schedule_id
FROM operation_constraints oc
    JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN personnel_share_groups psg ON psg.group_code = CONCAT('LEGACY_', oc.id)
WHERE oc.share_personnel = 1
    AND oc.predecessor_schedule_id IS NOT NULL;
-- =====================================================
-- Part 4: Add lag_type fields
-- =====================================================
-- Add to operation_constraints (template level)
ALTER TABLE operation_constraints
ADD COLUMN IF NOT EXISTS lag_type ENUM(
        'ASAP',
        'FIXED',
        'WINDOW',
        'NEXT_DAY',
        'NEXT_SHIFT',
        'COOLING',
        'BATCH_END'
    ) DEFAULT 'FIXED'
AFTER time_lag,
    ADD COLUMN IF NOT EXISTS lag_min DECIMAL(5, 1) DEFAULT 0
AFTER lag_type,
    ADD COLUMN IF NOT EXISTS lag_max DECIMAL(5, 1) DEFAULT NULL
AFTER lag_min;
-- Add to batch_operation_constraints (batch level)
ALTER TABLE batch_operation_constraints
ADD COLUMN IF NOT EXISTS lag_type ENUM(
        'ASAP',
        'FIXED',
        'WINDOW',
        'NEXT_DAY',
        'NEXT_SHIFT',
        'COOLING',
        'BATCH_END'
    ) DEFAULT 'FIXED'
AFTER time_lag,
    ADD COLUMN IF NOT EXISTS lag_min DECIMAL(5, 1) DEFAULT 0
AFTER lag_type,
    ADD COLUMN IF NOT EXISTS lag_max DECIMAL(5, 1) DEFAULT NULL
AFTER lag_min;
-- Migrate existing lag_time to new format
UPDATE operation_constraints
SET lag_type = 'FIXED',
    lag_min = time_lag
WHERE time_lag > 0
    AND lag_type IS NULL;
UPDATE operation_constraints
SET lag_type = 'ASAP'
WHERE time_lag = 0
    AND lag_type IS NULL;
UPDATE batch_operation_constraints
SET lag_type = 'FIXED',
    lag_min = time_lag
WHERE time_lag > 0
    AND lag_type IS NULL;
UPDATE batch_operation_constraints
SET lag_type = 'ASAP'
WHERE time_lag = 0
    AND lag_type IS NULL;
-- =====================================================
-- Verification queries (run after migration)
-- =====================================================
-- SELECT 'personnel_share_groups' as table_name, COUNT(*) as count FROM personnel_share_groups;
-- SELECT 'personnel_share_group_members' as table_name, COUNT(*) as count FROM personnel_share_group_members;
-- SELECT 'batch_share_groups' as table_name, COUNT(*) as count FROM batch_share_groups;
-- SELECT 'batch_share_group_members' as table_name, COUNT(*) as count FROM batch_share_group_members;