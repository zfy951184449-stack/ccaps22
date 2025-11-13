-- 批次计划系统数据库表创建脚本
-- 基于 batch_planning_system_design.md
-- 版本: v1.0
-- 创建日期: 2024-09-20

USE aps_system;

-- ====================================
-- 1. 生产批次计划表 (production_batch_plans)
-- ====================================
DROP TABLE IF EXISTS production_batch_plans;

CREATE TABLE production_batch_plans (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '批次计划ID',
    batch_code VARCHAR(50) NOT NULL UNIQUE COMMENT '批次编号',
    batch_name VARCHAR(100) NOT NULL COMMENT '批次名称',
    template_id INT NOT NULL COMMENT '工艺模版ID',
    project_code VARCHAR(50) COMMENT '项目代码',
    
    -- 纯计划时间（只需输入开始日期，结束日期自动计算）
    planned_start_date DATE NOT NULL COMMENT '计划开始日期（用户输入）',
    planned_end_date DATE COMMENT '计划结束日期（将通过触发器计算）',
    
    -- 工期信息（将通过触发器计算）
    template_duration_days INT COMMENT '模版标准工期（天）',
    
    -- 纯计划状态
    plan_status ENUM('DRAFT', 'PLANNED', 'APPROVED', 'CANCELLED') DEFAULT 'DRAFT' COMMENT '计划状态',
    
    -- 描述信息
    description TEXT COMMENT '批次描述',
    notes TEXT COMMENT '备注信息',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id),
    
    INDEX idx_batch_code (batch_code),
    INDEX idx_template_id (template_id),
    INDEX idx_project_code (project_code),
    INDEX idx_planned_start_date (planned_start_date),
    INDEX idx_plan_status (plan_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产批次计划表';

-- ====================================
-- 2. 批次操作计划表 (batch_operation_plans)
-- ====================================
DROP TABLE IF EXISTS batch_operation_plans;

CREATE TABLE batch_operation_plans (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '操作计划ID',
    batch_plan_id INT NOT NULL COMMENT '批次计划ID',
    template_schedule_id INT NOT NULL COMMENT '模版操作安排ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    
    -- 纯计划时间
    planned_start_datetime DATETIME NOT NULL COMMENT '计划开始时间',
    planned_end_datetime DATETIME NOT NULL COMMENT '计划结束时间',
    planned_duration DECIMAL(5,2) NOT NULL COMMENT '计划持续时间(小时)',
    window_start_datetime DATETIME NULL COMMENT '允许最早开始时间',
    window_end_datetime DATETIME NULL COMMENT '允许最晚完成时间',

    -- 资源计划
    required_people INT NOT NULL COMMENT '计划需要人数',
    
    -- 计划备注
    notes TEXT COMMENT '计划备注',
    is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否锁定',
    locked_by INT DEFAULT NULL COMMENT '锁定人ID',
    locked_at DATETIME DEFAULT NULL COMMENT '锁定时间',
    lock_reason VARCHAR(255) DEFAULT NULL COMMENT '锁定原因',
    
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (template_schedule_id) REFERENCES stage_operation_schedules(id),
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    FOREIGN KEY (locked_by) REFERENCES employees(id),
    
    INDEX idx_batch_plan_id (batch_plan_id),
    INDEX idx_planned_start_datetime (planned_start_datetime),
    INDEX idx_window_start_datetime (window_start_datetime),
    INDEX idx_window_end_datetime (window_end_datetime),
    INDEX idx_operation_id (operation_id),
    UNIQUE KEY uk_batch_template_schedule (batch_plan_id, template_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次操作计划表';

-- ====================================
-- 2a. 批次操作约束表 (batch_operation_constraints)
-- ====================================
DROP TABLE IF EXISTS batch_operation_constraints;

CREATE TABLE batch_operation_constraints (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '批次约束ID',
    batch_plan_id INT NOT NULL COMMENT '批次计划ID',
    batch_operation_plan_id INT NOT NULL COMMENT '当前批次操作计划ID',
    predecessor_batch_operation_plan_id INT NOT NULL COMMENT '前置批次操作计划ID',
    constraint_type TINYINT DEFAULT 1 COMMENT '约束类型：1-FS,2-SS,3-FF,4-SF',
    time_lag DECIMAL(4,1) DEFAULT 0 COMMENT '时间滞后（小时，可为负数）',
    constraint_level TINYINT DEFAULT 1 COMMENT '约束级别：1-强制，2-优选，3-建议',
    share_personnel TINYINT(1) DEFAULT 0 COMMENT '是否共享人员',
    constraint_name VARCHAR(100) COMMENT '约束名称',
    description TEXT COMMENT '约束说明',

    FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (predecessor_batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
    INDEX idx_batch_plan_id (batch_plan_id),
    INDEX idx_batch_operation_plan_id (batch_operation_plan_id),
    INDEX idx_predecessor_batch_operation_plan_id (predecessor_batch_operation_plan_id),
    INDEX idx_constraint_type (constraint_type),
    UNIQUE KEY uk_batch_op_constraint (batch_operation_plan_id, predecessor_batch_operation_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次操作约束表';

-- ====================================
-- 3. 批次人员安排表 (batch_personnel_assignments)
-- ====================================
DROP TABLE IF EXISTS batch_personnel_assignments;

CREATE TABLE batch_personnel_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '人员安排ID',
    batch_operation_plan_id INT NOT NULL COMMENT '批次操作计划ID',
    employee_id INT NOT NULL COMMENT '员工ID',
    
    -- 计划角色
    role ENUM('OPERATOR', 'SUPERVISOR', 'QC_INSPECTOR', 'ASSISTANT') DEFAULT 'OPERATOR' COMMENT '计划操作角色',
    is_primary BOOLEAN DEFAULT FALSE COMMENT '是否主要负责人',
    
    -- 资质匹配信息
    qualification_level INT COMMENT '员工相关资质等级',
    qualification_match_score DECIMAL(3,1) COMMENT '资质匹配度评分(0-10)',
    
    -- 安排状态
    assignment_status ENUM('PLANNED', 'CONFIRMED', 'CANCELLED') DEFAULT 'PLANNED' COMMENT '安排状态',
    
    -- 安排时间和备注
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL COMMENT '确认时间',
    notes TEXT COMMENT '安排备注',
    
    FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    
    INDEX idx_batch_operation_plan_id (batch_operation_plan_id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_assignment_status (assignment_status),
    UNIQUE KEY uk_batch_operation_employee (batch_operation_plan_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次人员安排表';

-- ====================================
-- 4. 创建工期计算函数
-- ====================================
DELIMITER //

DROP FUNCTION IF EXISTS calculate_template_duration//

CREATE FUNCTION calculate_template_duration(p_template_id INT) 
RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_min_day INT DEFAULT 0;
    DECLARE v_max_day INT DEFAULT 0;
    DECLARE v_duration INT DEFAULT 0;
    
    -- 计算模版中操作的最早和最晚天数
    SELECT 
        IFNULL(MIN(ps.start_day + sos.operation_day), 0),
        IFNULL(MAX(ps.start_day + sos.operation_day), 0)
    INTO v_min_day, v_max_day
    FROM process_stages ps
    JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
    WHERE ps.template_id = p_template_id;
    
    -- 如果找不到操作，返回1天
    IF v_max_day = 0 AND v_min_day = 0 THEN
        RETURN 1;
    END IF;
    
    -- 工期 = 最晚天 - 最早天 + 1
    SET v_duration = (v_max_day - v_min_day) + 1;
    
    RETURN v_duration;
END//

DELIMITER ;

-- ====================================
-- 5. 创建批次计划触发器
-- ====================================
DELIMITER //

-- 插入批次时自动计算结束日期和工期
DROP TRIGGER IF EXISTS before_insert_batch_plan//

CREATE TRIGGER before_insert_batch_plan
BEFORE INSERT ON production_batch_plans
FOR EACH ROW
BEGIN
    DECLARE v_duration INT;
    
    -- 计算模版工期
    SET v_duration = calculate_template_duration(NEW.template_id);
    
    -- 设置工期
    SET NEW.template_duration_days = v_duration;
    
    -- 计算结束日期
    SET NEW.planned_end_date = DATE_ADD(NEW.planned_start_date, INTERVAL (v_duration - 1) DAY);
END//

-- 更新批次时重新计算结束日期
DROP TRIGGER IF EXISTS before_update_batch_plan//

CREATE TRIGGER before_update_batch_plan
BEFORE UPDATE ON production_batch_plans
FOR EACH ROW
BEGIN
    DECLARE v_duration INT;
    
    -- 如果开始日期或模版改变，重新计算
    IF NEW.planned_start_date != OLD.planned_start_date OR NEW.template_id != OLD.template_id THEN
        -- 计算模版工期
        SET v_duration = calculate_template_duration(NEW.template_id);
        
        -- 更新工期
        SET NEW.template_duration_days = v_duration;
        
        -- 重新计算结束日期
        SET NEW.planned_end_date = DATE_ADD(NEW.planned_start_date, INTERVAL (v_duration - 1) DAY);
    END IF;
END//

DELIMITER ;

-- ====================================
-- 6. 创建批次操作生成存储过程
-- ====================================
DELIMITER //

DROP PROCEDURE IF EXISTS generate_batch_operation_plans//

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
        ),
        -- 计算结束时间：开始时间 + 操作时长（小时）
        ADDTIME(
            ADDTIME(
                DATE_ADD(v_batch_start_date, INTERVAL ((ps.start_day + sos.operation_day) - v_min_day) DAY),
                SEC_TO_TIME(sos.recommended_time * 3600)
            ),
            SEC_TO_TIME(o.standard_time * 3600)  -- standard_time是小时，转换为秒
        ),
        -- 持续时间（小时）
        o.standard_time,  -- 已经是小时
        -- 最早/最晚时间窗口
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

-- ====================================
-- 7. 创建批次视图
-- ====================================

-- 批次计划概览视图
CREATE OR REPLACE VIEW v_batch_plan_overview AS
SELECT 
    pbp.id AS batch_plan_id,
    pbp.batch_code,
    pbp.batch_name,
    pbp.project_code,
    pbp.template_id,
    pt.template_name,
    pbp.planned_start_date,
    pbp.planned_end_date,
    pbp.template_duration_days,
    pbp.plan_status,
    pbp.description,
    pbp.notes,
    pbp.created_at,
    pbp.updated_at,
    -- 统计信息
    (SELECT COUNT(*) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS operation_count,
    (SELECT SUM(required_people) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS total_required_people,
    (SELECT COUNT(DISTINCT employee_id) 
     FROM batch_personnel_assignments bpa
     JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
     WHERE bop.batch_plan_id = pbp.id AND bpa.assignment_status != 'CANCELLED') AS assigned_people_count
FROM production_batch_plans pbp
LEFT JOIN process_templates pt ON pbp.template_id = pt.id;

-- 批次操作时间线视图
CREATE OR REPLACE VIEW v_batch_operation_timeline AS
SELECT 
    pbp.id AS batch_plan_id,
    pbp.batch_code,
    pbp.batch_name,
    bop.id AS operation_plan_id,
    o.operation_code,
    o.operation_name,
    o.standard_time AS duration_minutes,
    bop.required_people,
    bop.planned_start_datetime,
    bop.planned_end_datetime,
    bop.planned_duration AS duration_hours,
    bop.window_start_datetime,
    bop.window_end_datetime,
    DATE(bop.planned_start_datetime) AS operation_date,
    TIME(bop.planned_start_datetime) AS start_time,
    TIME(bop.planned_end_datetime) AS end_time,
    ps.stage_name,
    -- 资质要求
    (SELECT GROUP_CONCAT(CONCAT(q.qualification_name, '(≥', oqr.required_level, '级)'))
     FROM operation_qualification_requirements oqr
     JOIN qualifications q ON oqr.qualification_id = q.id
     WHERE oqr.operation_id = bop.operation_id) AS qualification_requirements
FROM production_batch_plans pbp
JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
JOIN operations o ON bop.operation_id = o.id
JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
JOIN process_stages ps ON sos.stage_id = ps.id
ORDER BY bop.planned_start_datetime;

-- ====================================
-- 8. 插入测试数据
-- ====================================

-- 样例数据创建逻辑已移除，如需测试请在应用层创建批次后调用存储过程。
