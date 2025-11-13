-- 修复字符集冲突问题
USE aps_system;

-- 检查并修复production_batch_plans表的字符集
ALTER TABLE production_batch_plans 
CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 检查并修复batch_operation_plans表的字符集
ALTER TABLE batch_operation_plans 
CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 检查并修复batch_personnel_assignments表的字符集
ALTER TABLE batch_personnel_assignments 
CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 重建视图以确保字符集一致
DROP VIEW IF EXISTS v_calendar_operations;

CREATE VIEW v_calendar_operations AS
SELECT 
    bop.id AS operation_plan_id,
    pbp.id AS batch_id,
    pbp.batch_code COLLATE utf8mb4_unicode_ci AS batch_code,
    pbp.batch_name COLLATE utf8mb4_unicode_ci AS batch_name,
    pbp.batch_color COLLATE utf8mb4_unicode_ci AS batch_color,
    pbp.plan_status COLLATE utf8mb4_unicode_ci AS plan_status,
    o.operation_code COLLATE utf8mb4_unicode_ci AS operation_code,
    o.operation_name COLLATE utf8mb4_unicode_ci AS operation_name,
    ps.stage_name COLLATE utf8mb4_unicode_ci AS stage_name,
    bop.planned_start_datetime,
    bop.planned_end_datetime,
    DATE(bop.planned_start_datetime) AS operation_date,
    TIME(bop.planned_start_datetime) AS start_time,
    TIME(bop.planned_end_datetime) AS end_time,
    bop.planned_duration,
    bop.window_start_datetime,
    bop.window_end_datetime,
    bop.required_people,
    -- 计算已分配人数
    (SELECT COUNT(DISTINCT employee_id) 
     FROM batch_personnel_assignments 
     WHERE batch_operation_plan_id = bop.id 
     AND assignment_status IN ('PLANNED', 'CONFIRMED')) AS assigned_people,
    -- 获取资质要求
    (SELECT GROUP_CONCAT(CONCAT(q.qualification_name, '≥', oqr.required_level, '级'))
     FROM operation_qualification_requirements oqr
     JOIN qualifications q ON oqr.qualification_id = q.id
     WHERE oqr.operation_id = bop.operation_id) AS qualification_requirements,
    -- 分配状态
    CASE 
        WHEN (SELECT COUNT(DISTINCT employee_id) 
              FROM batch_personnel_assignments 
              WHERE batch_operation_plan_id = bop.id 
              AND assignment_status IN ('PLANNED', 'CONFIRMED')) >= bop.required_people 
        THEN 'COMPLETE'
        WHEN (SELECT COUNT(DISTINCT employee_id) 
              FROM batch_personnel_assignments 
              WHERE batch_operation_plan_id = bop.id 
              AND assignment_status IN ('PLANNED', 'CONFIRMED')) > 0 
        THEN 'PARTIAL'
        ELSE 'UNASSIGNED'
    END AS assignment_status
FROM production_batch_plans pbp
JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
JOIN operations o ON bop.operation_id = o.id
JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
JOIN process_stages ps ON sos.stage_id = ps.id
WHERE pbp.plan_status IN ('ACTIVATED', 'COMPLETED')
ORDER BY bop.planned_start_datetime;
