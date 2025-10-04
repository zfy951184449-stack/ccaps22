-- ====================================
-- 工艺模版约束与人员共享功能扩展 V2
-- 适配现有数据库结构
-- 版本: v2.0
-- 创建日期: 2024-12-21
-- ====================================

USE aps_system;

-- ====================================
-- 1. 创建人员共享组表
-- ====================================
CREATE TABLE IF NOT EXISTS personnel_share_groups (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '共享组ID',
    template_id INT NOT NULL COMMENT '模版ID',
    group_code VARCHAR(50) NOT NULL COMMENT '共享组代码',
    group_name VARCHAR(100) NOT NULL COMMENT '共享组名称',
    description TEXT COMMENT '描述',
    color VARCHAR(7) DEFAULT '#1890ff' COMMENT '显示颜色',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    
    INDEX idx_template_id (template_id),
    UNIQUE KEY uk_template_group_code (template_id, group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员共享组表';

-- ====================================
-- 2. 创建操作与共享组关联表
-- ====================================
CREATE TABLE IF NOT EXISTS operation_share_group_relations (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '关联ID',
    schedule_id INT NOT NULL COMMENT '操作安排ID',
    share_group_id INT NOT NULL COMMENT '共享组ID',
    priority INT DEFAULT 1 COMMENT '优先级（用于排序）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (share_group_id) REFERENCES personnel_share_groups(id) ON DELETE CASCADE,
    
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_share_group_id (share_group_id),
    UNIQUE KEY uk_schedule_group (schedule_id, share_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作与共享组关联表';

-- ====================================
-- 3. 更新operation_constraints表结构
-- ====================================
-- 添加缺失的字段以支持新的约束功能
ALTER TABLE operation_constraints 
ADD COLUMN IF NOT EXISTS lag_time DECIMAL(5,2) DEFAULT 0 COMMENT '延迟时间（小时）',
ADD COLUMN IF NOT EXISTS share_personnel BOOLEAN DEFAULT FALSE COMMENT '是否共享人员',
ADD COLUMN IF NOT EXISTS constraint_name VARCHAR(100) COMMENT '约束名称',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 如果存在旧的time_lag字段，迁移数据到新的lag_time字段
UPDATE operation_constraints SET lag_time = time_lag WHERE lag_time = 0 AND time_lag IS NOT NULL;

-- ====================================
-- 4. 创建约束扩展视图（基于现有表结构）
-- ====================================
CREATE OR REPLACE VIEW v_operation_constraints_extended AS
SELECT 
    oc.id AS constraint_id,
    sos1.stage_id,
    ps.template_id,
    pt.template_name,
    oc.schedule_id AS from_schedule_id,
    sos1.operation_id AS from_operation_id,
    op1.operation_name AS from_operation_name,
    op1.operation_code AS from_operation_code,
    oc.predecessor_schedule_id AS to_schedule_id,
    sos2.operation_id AS to_operation_id,
    op2.operation_name AS to_operation_name,
    op2.operation_code AS to_operation_code,
    CASE oc.constraint_type
        WHEN 1 THEN 'FS'
        WHEN 2 THEN 'SS'
        WHEN 3 THEN 'FF'
        WHEN 4 THEN 'SF'
    END AS constraint_type_name,
    oc.constraint_type,
    CASE oc.constraint_level
        WHEN 1 THEN '硬约束'
        WHEN 2 THEN '软约束'
    END AS constraint_level_name,
    oc.constraint_level,
    oc.lag_time,
    oc.share_personnel,
    oc.constraint_name,
    oc.description
FROM operation_constraints oc
JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
JOIN process_stages ps ON sos1.stage_id = ps.id
JOIN process_templates pt ON ps.template_id = pt.id
JOIN operations op1 ON sos1.operation_id = op1.id
JOIN operations op2 ON sos2.operation_id = op2.id;

-- ====================================
-- 4. 创建人员共享分析视图
-- ====================================
CREATE OR REPLACE VIEW v_personnel_share_analysis AS
SELECT 
    psg.id AS share_group_id,
    psg.template_id,
    pt.template_name,
    psg.group_code,
    psg.group_name,
    psg.description AS group_description,
    psg.color,
    COUNT(DISTINCT osgr.schedule_id) AS operation_count,
    GROUP_CONCAT(DISTINCT op.operation_name ORDER BY osgr.priority) AS operations_list,
    -- 计算共享后的最大人员需求
    MAX(op.required_people) AS max_required_people,
    SUM(op.required_people) AS total_if_independent
FROM personnel_share_groups psg
JOIN process_templates pt ON psg.template_id = pt.id
LEFT JOIN operation_share_group_relations osgr ON psg.id = osgr.share_group_id
LEFT JOIN stage_operation_schedules sos ON osgr.schedule_id = sos.id
LEFT JOIN operations op ON sos.operation_id = op.id
GROUP BY psg.id, psg.template_id, pt.template_name, psg.group_code, 
         psg.group_name, psg.description, psg.color;

-- ====================================
-- 5. 创建获取模板操作约束的存储过程
-- ====================================
DELIMITER //

DROP PROCEDURE IF EXISTS get_template_constraints//
CREATE PROCEDURE get_template_constraints(
    IN p_template_id INT
)
BEGIN
    SELECT 
        oc.id AS constraint_id,
        sos1.id AS from_schedule_id,
        op1.operation_name AS from_operation,
        sos2.id AS to_schedule_id,
        op2.operation_name AS to_operation,
        CASE oc.constraint_type
            WHEN 1 THEN 'FS'
            WHEN 2 THEN 'SS'
            WHEN 3 THEN 'FF'
            WHEN 4 THEN 'SF'
        END AS constraint_type,
        oc.lag_time,
        oc.share_personnel,
        oc.constraint_name,
        ps1.stage_name AS from_stage,
        ps2.stage_name AS to_stage
    FROM operation_constraints oc
    JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
    JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
    JOIN operations op1 ON sos1.operation_id = op1.id
    JOIN operations op2 ON sos2.operation_id = op2.id
    JOIN process_stages ps1 ON sos1.stage_id = ps1.id
    JOIN process_stages ps2 ON sos2.stage_id = ps2.id
    WHERE ps1.template_id = p_template_id
    ORDER BY ps1.stage_order, sos1.operation_order;
END//

-- ====================================
-- 6. 创建添加操作约束的存储过程
-- ====================================
DROP PROCEDURE IF EXISTS add_operation_constraint_v2//
CREATE PROCEDURE add_operation_constraint_v2(
    IN p_from_schedule_id INT,
    IN p_to_schedule_id INT,
    IN p_constraint_type TINYINT,
    IN p_share_personnel BOOLEAN,
    IN p_lag_time DECIMAL(5,2),
    IN p_constraint_name VARCHAR(100),
    IN p_description TEXT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = '添加约束失败';
    END;
    
    START TRANSACTION;
    
    -- 检查是否会形成循环依赖
    IF EXISTS (
        SELECT 1 FROM operation_constraints 
        WHERE schedule_id = p_to_schedule_id 
        AND predecessor_schedule_id = p_from_schedule_id
    ) THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = '检测到循环依赖';
    END IF;
    
    -- 插入约束
    INSERT INTO operation_constraints (
        schedule_id,
        predecessor_schedule_id,
        constraint_type,
        lag_time,
        share_personnel,
        constraint_name,
        description,
        constraint_level
    ) VALUES (
        p_from_schedule_id,
        p_to_schedule_id,
        p_constraint_type,
        p_lag_time,
        p_share_personnel,
        p_constraint_name,
        p_description,
        1  -- 默认硬约束
    ) ON DUPLICATE KEY UPDATE
        constraint_type = p_constraint_type,
        lag_time = p_lag_time,
        share_personnel = p_share_personnel,
        constraint_name = p_constraint_name,
        description = p_description;
    
    COMMIT;
    
    SELECT 'Constraint added successfully' AS result;
END//

-- ====================================
-- 7. 创建人员需求计算函数
-- ====================================
DROP FUNCTION IF EXISTS calculate_shared_personnel_requirement//
CREATE FUNCTION calculate_shared_personnel_requirement(
    p_template_id INT,
    p_share_group_id INT
) RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_max_requirement INT DEFAULT 0;
    
    -- 获取共享组中最大的人员需求
    SELECT MAX(op.required_people)
    INTO v_max_requirement
    FROM operation_share_group_relations osgr
    JOIN stage_operation_schedules sos ON osgr.schedule_id = sos.id
    JOIN operations op ON sos.operation_id = op.id
    JOIN process_stages ps ON sos.stage_id = ps.id
    WHERE ps.template_id = p_template_id
    AND osgr.share_group_id = p_share_group_id;
    
    RETURN IFNULL(v_max_requirement, 0);
END//

DELIMITER ;

-- ====================================
-- 8. 插入测试数据（可选）
-- ====================================
-- 插入测试共享组
INSERT IGNORE INTO personnel_share_groups (
    template_id,
    group_code,
    group_name,
    description,
    color
) VALUES 
(1, 'GRP_REACTOR', '反应袋组', '负责反应袋相关操作的人员组', '#1890ff'),
(1, 'GRP_ELECTRODE', '电极组', '负责电极相关操作的人员组', '#52c41a'),
(1, 'GRP_TEST', '测试组', '负责测试相关操作的人员组', '#faad14');

-- ====================================
-- 9. 输出执行结果
-- ====================================
SELECT 
    'Database schema extended successfully' AS message,
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'aps_system' 
     AND table_name IN ('personnel_share_groups', 'operation_share_group_relations')) AS tables_created,
    (SELECT COUNT(*) FROM information_schema.views 
     WHERE table_schema = 'aps_system' 
     AND table_name IN ('v_operation_constraints_extended', 'v_personnel_share_analysis')) AS views_created;