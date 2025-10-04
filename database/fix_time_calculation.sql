-- 修复批次操作时间计算问题
-- standard_time 字段单位是分钟，不是小时

USE aps_system;

-- 删除旧的存储过程
DROP PROCEDURE IF EXISTS generate_batch_operation_plans;

-- 创建修正后的存储过程
DELIMITER //

CREATE PROCEDURE generate_batch_operation_plans(
    IN p_batch_plan_id INT
)
BEGIN
    DECLARE v_batch_start_date DATE;
    DECLARE v_template_id INT;
    DECLARE v_min_day INT;
    
    -- 获取批次信息
    SELECT planned_start_date, template_id
    INTO v_batch_start_date, v_template_id
    FROM production_batch_plans
    WHERE id = p_batch_plan_id;
    
    -- 获取模版最早开始天
    SELECT MIN(ps.start_day + sos.operation_day)
    INTO v_min_day
    FROM process_stages ps
    JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
    WHERE ps.template_id = v_template_id;
    
    -- 清除现有的操作计划与约束
    DELETE FROM batch_operation_plans WHERE batch_plan_id = p_batch_plan_id;
    DELETE FROM batch_operation_constraints WHERE batch_plan_id = p_batch_plan_id;
    
    -- 生成新的操作计划
    -- 注意：o.standard_time 是分钟数
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
    SELECT 
        p_batch_plan_id,
        sos.id,
        sos.operation_id,
        -- 计算开始时间（考虑负数天的偏移）
        ADDTIME(
            DATE_ADD(v_batch_start_date, INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY),
            SEC_TO_TIME(sos.recommended_time * 3600)
        ) AS start_time,
        -- 计算结束时间：开始时间 + 操作时长（分钟）
        ADDTIME(
            ADDTIME(
                DATE_ADD(v_batch_start_date, INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY),
                SEC_TO_TIME(sos.recommended_time * 3600)
            ),
            SEC_TO_TIME(o.standard_time * 60)  -- standard_time是分钟，转换为秒
        ) AS end_time,
        -- 持续时间（小时）
        o.standard_time / 60.0,  -- 分钟转小时
        -- 时间窗口
        ADDTIME(
            DATE_ADD(v_batch_start_date, INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY),
            SEC_TO_TIME(sos.window_start_time * 3600)
        ),
        ADDTIME(
            DATE_ADD(v_batch_start_date, INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY),
            SEC_TO_TIME(sos.window_end_time * 3600)
        ),
        -- 需要人数
        o.required_people
    FROM stage_operation_schedules sos
    JOIN process_stages ps ON sos.stage_id = ps.id
    JOIN operations o ON sos.operation_id = o.id
    WHERE ps.template_id = v_template_id;

    -- 生成批次操作约束
    INSERT INTO batch_operation_constraints (
        batch_plan_id,
        batch_operation_plan_id,
        predecessor_batch_operation_plan_id,
        constraint_type,
        time_lag,
        constraint_level,
        share_personnel,
        constraint_name,
        description
    )
    SELECT
        p_batch_plan_id,
        bop_current.id,
        bop_predecessor.id,
        oc.constraint_type,
        oc.time_lag,
        oc.constraint_level,
        oc.share_personnel,
        oc.constraint_name,
        oc.description
    FROM operation_constraints oc
    JOIN stage_operation_schedules sos_current ON oc.schedule_id = sos_current.id
    JOIN stage_operation_schedules sos_predecessor ON oc.predecessor_schedule_id = sos_predecessor.id
    JOIN process_stages ps_current ON sos_current.stage_id = ps_current.id
    JOIN process_stages ps_predecessor ON sos_predecessor.stage_id = ps_predecessor.id
    JOIN batch_operation_plans bop_current ON bop_current.batch_plan_id = p_batch_plan_id AND bop_current.template_schedule_id = sos_current.id
    JOIN batch_operation_plans bop_predecessor ON bop_predecessor.batch_plan_id = p_batch_plan_id AND bop_predecessor.template_schedule_id = sos_predecessor.id
    WHERE ps_current.template_id = v_template_id
      AND ps_predecessor.template_id = v_template_id;
    
    SELECT ROW_COUNT() AS generated_operations;
END//

DELIMITER ;

-- 重新生成现有激活批次的操作计划
-- 先查看当前的错误数据
SELECT 
    bop.id,
    o.operation_name,
    o.standard_time as standard_minutes,
    bop.planned_start_datetime,
    bop.planned_end_datetime,
    bop.planned_duration as duration_hours,
    TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) as actual_minutes
FROM batch_operation_plans bop
JOIN operations o ON bop.operation_id = o.id
WHERE bop.batch_plan_id = 1
LIMIT 5;

-- 重新生成批次1的操作计划
CALL generate_batch_operation_plans(1);

-- 查看修正后的数据
SELECT 
    bop.id,
    o.operation_name,
    o.standard_time as standard_minutes,
    bop.planned_start_datetime,
    bop.planned_end_datetime,
    bop.planned_duration as duration_hours,
    TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) as actual_minutes
FROM batch_operation_plans bop
JOIN operations o ON bop.operation_id = o.id
WHERE bop.batch_plan_id = 1
LIMIT 5;
