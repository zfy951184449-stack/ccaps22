-- Migration: Add Share Group Copy to Batch Instantiation
-- Date: 2024-12-16
-- Description: Update generate_batch_operation_plans to copy share groups from template
-- =====================================================
USE aps_system;
-- Drop existing procedure
DROP PROCEDURE IF EXISTS generate_batch_operation_plans;
DELIMITER $$ CREATE PROCEDURE generate_batch_operation_plans(IN p_batch_plan_id INT) BEGIN
DECLARE v_batch_start_date DATE;
DECLARE v_template_id INT;
DECLARE v_min_day INT;
-- Get batch info
SELECT planned_start_date,
    template_id INTO v_batch_start_date,
    v_template_id
FROM production_batch_plans
WHERE id = p_batch_plan_id;
-- Get earliest day in template
SELECT MIN(ps.start_day + sos.operation_day) INTO v_min_day
FROM process_stages ps
    JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
WHERE ps.template_id = v_template_id;
-- Step 1: Clear existing data
DELETE FROM batch_operation_plans
WHERE batch_plan_id = p_batch_plan_id;
DELETE FROM batch_operation_constraints
WHERE batch_plan_id = p_batch_plan_id;
DELETE FROM batch_share_groups
WHERE batch_plan_id = p_batch_plan_id;
-- Step 2: Generate operation plans
INSERT INTO batch_operation_plans (
        batch_plan_id,
        template_schedule_id,
        operation_id,
        planned_start_datetime,
        planned_end_datetime,
        planned_duration,
        window_start_datetime,
        window_end_datetime,
        required_people
    )
SELECT p_batch_plan_id,
    sos.id,
    sos.operation_id,
    ADDTIME(
        DATE_ADD(
            v_batch_start_date,
            INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY
        ),
        SEC_TO_TIME(sos.recommended_time * 3600)
    ),
    ADDTIME(
        ADDTIME(
            DATE_ADD(
                v_batch_start_date,
                INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY
            ),
            SEC_TO_TIME(sos.recommended_time * 3600)
        ),
        SEC_TO_TIME(o.standard_time * 3600)
    ),
    o.standard_time,
    ADDTIME(
        DATE_ADD(
            v_batch_start_date,
            INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY
        ),
        SEC_TO_TIME(sos.window_start_time * 3600)
    ),
    ADDTIME(
        DATE_ADD(
            v_batch_start_date,
            INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY
        ),
        SEC_TO_TIME(sos.window_end_time * 3600)
    ),
    o.required_people
FROM stage_operation_schedules sos
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN operations o ON sos.operation_id = o.id
WHERE ps.template_id = v_template_id;
-- Step 3: Generate constraints
INSERT INTO batch_operation_constraints (
        batch_plan_id,
        batch_operation_plan_id,
        predecessor_batch_operation_plan_id,
        constraint_type,
        time_lag,
        lag_type,
        lag_min,
        lag_max,
        constraint_level,
        share_personnel,
        constraint_name,
        description
    )
SELECT p_batch_plan_id,
    bop_current.id,
    bop_predecessor.id,
    oc.constraint_type,
    oc.time_lag,
    COALESCE(oc.lag_type, 'FIXED'),
    COALESCE(oc.lag_min, 0),
    oc.lag_max,
    oc.constraint_level,
    oc.share_personnel,
    oc.constraint_name,
    oc.description
FROM operation_constraints oc
    JOIN stage_operation_schedules sos_current ON oc.schedule_id = sos_current.id
    JOIN stage_operation_schedules sos_predecessor ON oc.predecessor_schedule_id = sos_predecessor.id
    JOIN process_stages ps_current ON sos_current.stage_id = ps_current.id
    JOIN process_stages ps_predecessor ON sos_predecessor.stage_id = ps_predecessor.id
    JOIN batch_operation_plans bop_current ON bop_current.batch_plan_id = p_batch_plan_id
    AND bop_current.template_schedule_id = sos_current.id
    JOIN batch_operation_plans bop_predecessor ON bop_predecessor.batch_plan_id = p_batch_plan_id
    AND bop_predecessor.template_schedule_id = sos_predecessor.id
WHERE ps_current.template_id = v_template_id
    AND ps_predecessor.template_id = v_template_id;
-- Step 4: Copy share groups from template
INSERT INTO batch_share_groups (
        batch_plan_id,
        template_group_id,
        group_code,
        group_name,
        share_mode
    )
SELECT p_batch_plan_id,
    psg.id,
    psg.group_code,
    psg.group_name,
    psg.share_mode
FROM personnel_share_groups psg
WHERE psg.template_id = v_template_id;
-- Step 5: Copy share group members (map schedule_id to batch_operation_plan_id)
INSERT INTO batch_share_group_members (group_id, batch_operation_plan_id)
SELECT bsg.id,
    bop.id
FROM personnel_share_group_members psgm
    JOIN personnel_share_groups psg ON psgm.group_id = psg.id
    JOIN batch_share_groups bsg ON bsg.batch_plan_id = p_batch_plan_id
    AND bsg.template_group_id = psg.id
    JOIN batch_operation_plans bop ON bop.batch_plan_id = p_batch_plan_id
    AND bop.template_schedule_id = psgm.schedule_id
WHERE psg.template_id = v_template_id;
SELECT ROW_COUNT() AS generated_operations;
END $$ DELIMITER;