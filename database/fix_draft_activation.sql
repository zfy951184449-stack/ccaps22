-- 更新批次激活/撤销存储过程，支持从 DRAFT 状态激活
USE aps_system;
-- 1. 更新激活存储过程：允许从 DRAFT 状态激活
DELIMITER // DROP PROCEDURE IF EXISTS activate_batch_plan // CREATE PROCEDURE activate_batch_plan(
    IN p_batch_plan_id INT,
    IN p_activated_by INT,
    IN p_batch_color VARCHAR(7)
) BEGIN
DECLARE v_current_status VARCHAR(20);
-- 获取当前状态
SELECT plan_status INTO v_current_status
FROM production_batch_plans
WHERE id = p_batch_plan_id;
-- 检查状态是否允许激活（改为检查 DRAFT 状态）
IF v_current_status != 'DRAFT' THEN SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = '只有草稿状态的批次才能激活';
END IF;
-- 更新批次状态
UPDATE production_batch_plans
SET plan_status = 'ACTIVATED',
    activated_at = NOW(),
    activated_by = p_activated_by,
    batch_color = IFNULL(
        p_batch_color,
        CONCAT('#', LPAD(HEX(FLOOR(RAND() * 16777215)), 6, '0'))
    )
WHERE id = p_batch_plan_id;
SELECT 'Batch plan activated successfully' AS message;
END // DELIMITER;
-- 2. 更新撤销激活存储过程：回退到 DRAFT 状态
DELIMITER // DROP PROCEDURE IF EXISTS deactivate_batch_plan // CREATE PROCEDURE deactivate_batch_plan(IN p_batch_plan_id INT) BEGIN
DECLARE v_current_status VARCHAR(20);
-- 锁定并读取当前状态
SELECT plan_status INTO v_current_status
FROM production_batch_plans
WHERE id = p_batch_plan_id FOR
UPDATE;
IF v_current_status IS NULL THEN SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = '批次计划不存在';
END IF;
-- 仅允许已激活的批次撤销
IF v_current_status != 'ACTIVATED' THEN SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = '只有已激活的批次才能撤销激活';
END IF;
-- 清除所有人员安排记录
DELETE bpa
FROM batch_personnel_assignments bpa
    JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
WHERE bop.batch_plan_id = p_batch_plan_id;
-- 回退批次状态和激活信息（改为回退到 DRAFT）
UPDATE production_batch_plans
SET plan_status = 'DRAFT',
    activated_at = NULL,
    activated_by = NULL,
    batch_color = NULL,
    updated_at = NOW()
WHERE id = p_batch_plan_id;
SELECT 'Batch plan deactivated successfully' AS message;
END // DELIMITER;
-- 3. 更新视图以支持 DRAFT 状态的预览
CREATE OR REPLACE VIEW v_calendar_operations AS
SELECT bop.id AS operation_plan_id,
    pbp.id AS batch_id,
    pbp.batch_code,
    pbp.batch_name,
    pbp.batch_color,
    pbp.plan_status,
    o.operation_code,
    o.operation_name,
    ps.stage_name,
    bop.planned_start_datetime,
    bop.planned_end_datetime,
    bop.window_start_datetime,
    bop.window_end_datetime,
    DATE(bop.planned_start_datetime) AS operation_date,
    TIME(bop.planned_start_datetime) AS start_time,
    TIME(bop.planned_end_datetime) AS end_time,
    bop.planned_duration,
    bop.required_people,
    -- 计算已分配人数
    (
        SELECT COUNT(DISTINCT employee_id)
        FROM batch_personnel_assignments
        WHERE batch_operation_plan_id = bop.id
            AND assignment_status IN ('PLANNED', 'CONFIRMED')
    ) AS assigned_people,
    -- 获取资质要求
    (
        SELECT GROUP_CONCAT(
                CONCAT(
                    q.qualification_name,
                    '≥',
                    oqr.required_level,
                    '级'
                )
            )
        FROM operation_qualification_requirements oqr
            JOIN qualifications q ON oqr.qualification_id = q.id
        WHERE oqr.operation_id = bop.operation_id
    ) AS qualification_requirements,
    -- 分配状态
    CASE
        WHEN (
            SELECT COUNT(DISTINCT employee_id)
            FROM batch_personnel_assignments
            WHERE batch_operation_plan_id = bop.id
                AND assignment_status IN ('PLANNED', 'CONFIRMED')
        ) >= bop.required_people THEN 'COMPLETE'
        WHEN (
            SELECT COUNT(DISTINCT employee_id)
            FROM batch_personnel_assignments
            WHERE batch_operation_plan_id = bop.id
                AND assignment_status IN ('PLANNED', 'CONFIRMED')
        ) > 0 THEN 'PARTIAL'
        ELSE 'UNASSIGNED'
    END AS assignment_status
FROM production_batch_plans pbp
    JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
    JOIN operations o ON bop.operation_id = o.id
    JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
    JOIN process_stages ps ON sos.stage_id = ps.id
WHERE pbp.plan_status IN ('DRAFT', 'ACTIVATED', 'COMPLETED')
ORDER BY bop.planned_start_datetime;
SELECT '存储过程和视图已更新，支持 DRAFT → ACTIVATED 激活流程' AS result;