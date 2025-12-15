-- Migration: Convert share_personnel constraints to personnel_share_groups
-- Date: 2024-12-15
-- Description: Migrates legacy share_personnel=1 constraints to the new group-based architecture
-- =====================================================
USE aps_system;
-- Step 1: Create share groups from existing share_personnel constraints
-- Each constraint with share_personnel=1 becomes a share group containing both operations
INSERT INTO personnel_share_groups (template_id, group_code, group_name, share_mode)
SELECT DISTINCT ps.template_id,
    CONCAT('LEGACY_', oc.id),
    CONCAT(
        SUBSTRING(op1.operation_name, 1, 15),
        ' ↔ ',
        SUBSTRING(op2.operation_name, 1, 15)
    ),
    'SAME_TEAM'
FROM operation_constraints oc
    JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
    JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
    JOIN operations op1 ON sos1.operation_id = op1.id
    JOIN operations op2 ON sos2.operation_id = op2.id
    JOIN process_stages ps ON sos1.stage_id = ps.id
WHERE oc.share_personnel = 1 ON DUPLICATE KEY
UPDATE group_name =
VALUES(group_name);
-- Step 2: Add the 'from' operation (schedule_id) as a member
INSERT INTO personnel_share_group_members (group_id, schedule_id)
SELECT psg.id,
    oc.schedule_id
FROM operation_constraints oc
    JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN personnel_share_groups psg ON psg.group_code = CONCAT('LEGACY_', oc.id)
    AND psg.template_id = ps.template_id
WHERE oc.share_personnel = 1 ON DUPLICATE KEY
UPDATE schedule_id =
VALUES(schedule_id);
-- Step 3: Add the 'to' operation (predecessor_schedule_id) as a member
INSERT INTO personnel_share_group_members (group_id, schedule_id)
SELECT psg.id,
    oc.predecessor_schedule_id
FROM operation_constraints oc
    JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN personnel_share_groups psg ON psg.group_code = CONCAT('LEGACY_', oc.id)
    AND psg.template_id = ps.template_id
WHERE oc.share_personnel = 1
    AND oc.predecessor_schedule_id IS NOT NULL ON DUPLICATE KEY
UPDATE schedule_id =
VALUES(schedule_id);
-- Step 4: Clear the old share_personnel flag (optional, for cleanup)
-- UPDATE operation_constraints SET share_personnel = 0 WHERE share_personnel = 1;
-- =====================================================
-- Verification queries
-- =====================================================
SELECT '--- 迁移完成验证 ---' as info;
SELECT 'personnel_share_groups (LEGACY)' as table_name,
    COUNT(*) as row_count
FROM personnel_share_groups
WHERE group_code LIKE 'LEGACY_%'
UNION ALL
SELECT 'personnel_share_group_members',
    COUNT(*)
FROM personnel_share_group_members;
-- Show sample of migrated groups
SELECT psg.id,
    psg.template_id,
    pt.template_name,
    psg.group_code,
    psg.group_name,
    psg.share_mode
FROM personnel_share_groups psg
    JOIN process_templates pt ON psg.template_id = pt.id
WHERE psg.group_code LIKE 'LEGACY_%'
LIMIT 10;