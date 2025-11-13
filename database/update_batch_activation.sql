-- 更新批次计划表，支持激活状态
USE aps_system;

-- 1. 修改批次状态枚举，添加 ACTIVATED 和 COMPLETED 状态
ALTER TABLE production_batch_plans 
MODIFY COLUMN plan_status ENUM('DRAFT', 'PLANNED', 'APPROVED', 'ACTIVATED', 'COMPLETED', 'CANCELLED') 
DEFAULT 'DRAFT' COMMENT '计划状态';

-- 2. 添加激活和完成时间字段
ALTER TABLE production_batch_plans 
ADD COLUMN activated_at TIMESTAMP NULL COMMENT '激活时间',
ADD COLUMN activated_by INT NULL COMMENT '激活操作人',
ADD COLUMN completed_at TIMESTAMP NULL COMMENT '完成时间',
ADD COLUMN batch_color VARCHAR(7) NULL COMMENT '批次显示颜色(用于日历区分)';

-- 3. 添加索引
ALTER TABLE production_batch_plans
ADD INDEX idx_activated_at (activated_at),
ADD INDEX idx_plan_status_activated (plan_status, activated_at);

-- 4. 创建视图：获取激活批次的操作日历
CREATE OR REPLACE VIEW v_calendar_operations AS
SELECT 
    bop.id AS operation_plan_id,
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

-- 5. 创建存储过程：激活批次
DELIMITER //

DROP PROCEDURE IF EXISTS activate_batch_plan//

CREATE PROCEDURE activate_batch_plan(
    IN p_batch_plan_id INT,
    IN p_activated_by INT,
    IN p_batch_color VARCHAR(7)
)
BEGIN
    DECLARE v_current_status VARCHAR(20);
    
    -- 获取当前状态
    SELECT plan_status INTO v_current_status
    FROM production_batch_plans
    WHERE id = p_batch_plan_id;
    
    -- 检查状态是否允许激活
    IF v_current_status != 'APPROVED' THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = '只有已批准的批次才能激活';
    END IF;
    
    -- 更新批次状态
    UPDATE production_batch_plans
    SET plan_status = 'ACTIVATED',
        activated_at = NOW(),
        activated_by = p_activated_by,
        batch_color = IFNULL(p_batch_color, CONCAT('#', LPAD(HEX(FLOOR(RAND() * 16777215)), 6, '0')))
    WHERE id = p_batch_plan_id;
    
    SELECT 'Batch plan activated successfully' AS message;
END//

DELIMITER ;

-- 5b. 创建存储过程：撤销批次激活
DELIMITER //

DROP PROCEDURE IF EXISTS deactivate_batch_plan//

CREATE PROCEDURE deactivate_batch_plan(
    IN p_batch_plan_id INT
)
BEGIN
    DECLARE v_current_status VARCHAR(20);

    -- 锁定并读取当前状态
    SELECT plan_status INTO v_current_status
    FROM production_batch_plans
    WHERE id = p_batch_plan_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '批次计划不存在';
    END IF;

    -- 仅允许已激活的批次撤销
    IF v_current_status != 'ACTIVATED' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '只有已激活的批次才能撤销激活';
    END IF;

    -- 清除所有人员安排记录
    DELETE bpa FROM batch_personnel_assignments bpa
    JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
    WHERE bop.batch_plan_id = p_batch_plan_id;

    -- 回退批次状态和激活信息
    UPDATE production_batch_plans
    SET plan_status = 'APPROVED',
        activated_at = NULL,
        activated_by = NULL,
        batch_color = NULL,
        updated_at = NOW()
    WHERE id = p_batch_plan_id;

    SELECT 'Batch plan deactivated successfully' AS message;
END//

DELIMITER ;

-- 6. 创建视图：按日期获取操作
CREATE OR REPLACE VIEW v_daily_operations AS
SELECT 
    DATE(planned_start_datetime) AS operation_date,
    COUNT(DISTINCT bop.id) AS total_operations,
    COUNT(DISTINCT pbp.id) AS active_batches,
    SUM(bop.required_people) AS total_required_people,
    SUM(CASE 
        WHEN (SELECT COUNT(DISTINCT employee_id) 
              FROM batch_personnel_assignments 
              WHERE batch_operation_plan_id = bop.id 
              AND assignment_status IN ('PLANNED', 'CONFIRMED')) >= bop.required_people 
        THEN 1 ELSE 0 
    END) AS completed_assignments,
    GROUP_CONCAT(DISTINCT pbp.batch_code) AS batch_codes
FROM production_batch_plans pbp
JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
WHERE pbp.plan_status = 'ACTIVATED'
GROUP BY DATE(planned_start_datetime);

-- 7. 添加一些示例颜色到现有批次
UPDATE production_batch_plans 
SET batch_color = CASE 
    WHEN id = 1 THEN '#1890ff'  -- 蓝色
    WHEN id = 2 THEN '#52c41a'  -- 绿色
    WHEN id = 3 THEN '#fa8c16'  -- 橙色
    ELSE CONCAT('#', LPAD(HEX(FLOOR(RAND() * 16777215)), 6, '0'))
END;

-- 测试：将第一个批次激活（如果是已批准状态）
-- UPDATE production_batch_plans SET plan_status = 'APPROVED' WHERE id = 1;
-- CALL activate_batch_plan(1, 1, '#1890ff');
