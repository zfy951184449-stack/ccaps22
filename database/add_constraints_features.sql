-- ====================================
-- 工艺模版约束与人员共享功能扩展
-- 版本: v1.0
-- 创建日期: 2024-12-21
-- ====================================

USE aps_system;

-- ====================================
-- 1. 检查并创建operation_constraints表（如果不存在）
-- ====================================
CREATE TABLE IF NOT EXISTS operation_constraints (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '约束ID',
    template_id INT NOT NULL COMMENT '模版ID',
    from_operation_id INT NOT NULL COMMENT '前置操作ID',
    to_operation_id INT NOT NULL COMMENT '后续操作ID',
    constraint_type TINYINT NOT NULL DEFAULT 1 COMMENT '约束类型：1=FS, 2=SS, 3=FF, 4=SF',
    constraint_level TINYINT NOT NULL DEFAULT 1 COMMENT '约束级别：1=硬约束, 2=软约束',
    lag_time DECIMAL(5,2) DEFAULT 0 COMMENT '延迟时间（小时）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (from_operation_id) REFERENCES operations(id),
    FOREIGN KEY (to_operation_id) REFERENCES operations(id),
    
    INDEX idx_template_id (template_id),
    INDEX idx_from_operation (from_operation_id),
    INDEX idx_to_operation (to_operation_id),
    UNIQUE KEY uk_operation_constraint (template_id, from_operation_id, to_operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作约束关系表';

-- ====================================
-- 2. 添加人员共享字段到约束表
-- ====================================
-- 先检查lag_time字段是否存在，不存在则添加
SELECT COUNT(*) INTO @lag_time_exists 
FROM information_schema.columns 
WHERE table_schema = 'aps_system' 
AND table_name = 'operation_constraints' 
AND column_name = 'lag_time';

SET @sql1 = IF(@lag_time_exists = 0,
    'ALTER TABLE operation_constraints 
     ADD COLUMN lag_time DECIMAL(5,2) DEFAULT 0 COMMENT ''延迟时间（小时）'' AFTER constraint_level',
    'SELECT ''Column lag_time already exists'' AS message');

PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 检查share_personnel字段是否存在，如果不存在则添加
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.columns 
WHERE table_schema = 'aps_system' 
AND table_name = 'operation_constraints' 
AND column_name = 'share_personnel';

SET @sql2 = IF(@col_exists = 0,
    'ALTER TABLE operation_constraints 
     ADD COLUMN share_personnel BOOLEAN DEFAULT FALSE COMMENT ''是否共享人员'',
     ADD COLUMN constraint_name VARCHAR(100) COMMENT ''约束名称'',
     ADD INDEX idx_share_personnel (share_personnel)',
    'SELECT ''Column share_personnel already exists'' AS message');

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ====================================
-- 3. 创建人员共享组表
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
-- 4. 创建操作与共享组关联表
-- ====================================
CREATE TABLE IF NOT EXISTS operation_share_group_relations (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '关联ID',
    template_id INT NOT NULL COMMENT '模版ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    share_group_id INT NOT NULL COMMENT '共享组ID',
    priority INT DEFAULT 1 COMMENT '优先级（用于排序）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    FOREIGN KEY (share_group_id) REFERENCES personnel_share_groups(id) ON DELETE CASCADE,
    
    INDEX idx_template_id (template_id),
    INDEX idx_operation_id (operation_id),
    INDEX idx_share_group_id (share_group_id),
    UNIQUE KEY uk_template_operation_group (template_id, operation_id, share_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作与共享组关联表';

-- ====================================
-- 5. 创建约束验证视图
-- ====================================
CREATE OR REPLACE VIEW v_operation_constraints AS
SELECT 
    oc.id AS constraint_id,
    oc.template_id,
    pt.template_name,
    oc.from_operation_id,
    op1.operation_name AS from_operation_name,
    op1.operation_code AS from_operation_code,
    oc.to_operation_id,
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
    oc.created_at,
    oc.updated_at
FROM operation_constraints oc
JOIN process_templates pt ON oc.template_id = pt.id
JOIN operations op1 ON oc.from_operation_id = op1.id
JOIN operations op2 ON oc.to_operation_id = op2.id;

-- ====================================
-- 6. 创建人员共享分析视图
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
    COUNT(DISTINCT osgr.operation_id) AS operation_count,
    GROUP_CONCAT(DISTINCT op.operation_name ORDER BY osgr.priority) AS operations_list,
    -- 计算共享后的最大人员需求
    MAX(op.required_people) AS max_required_people,
    SUM(op.required_people) AS total_if_independent
FROM personnel_share_groups psg
JOIN process_templates pt ON psg.template_id = pt.id
LEFT JOIN operation_share_group_relations osgr ON psg.id = osgr.share_group_id
LEFT JOIN operations op ON osgr.operation_id = op.id
GROUP BY psg.id, psg.template_id, pt.template_name, psg.group_code, 
         psg.group_name, psg.description, psg.color;

-- ====================================
-- 7. 插入测试数据（可选）
-- ====================================
-- 插入测试约束关系
-- 假设template_id=1, 反应袋安装(id=1) -> 保压测试(id=2)
INSERT IGNORE INTO operation_constraints (
    template_id, 
    from_operation_id, 
    to_operation_id,
    constraint_type,
    constraint_level,
    lag_time,
    share_personnel,
    constraint_name
) VALUES 
(1, 1, 2, 1, 1, 0.5, TRUE, '反应袋安装后测试'),
(1, 3, 4, 2, 1, 0, TRUE, '电极准备与安装同步');

-- 插入测试共享组
INSERT IGNORE INTO personnel_share_groups (
    template_id,
    group_code,
    group_name,
    description,
    color
) VALUES 
(1, 'GRP_REACTOR', '反应袋组', '负责反应袋相关操作的人员组', '#1890ff'),
(1, 'GRP_ELECTRODE', '电极组', '负责电极相关操作的人员组', '#52c41a');

-- ====================================
-- 8. 创建约束管理存储过程
-- ====================================
DELIMITER //

DROP PROCEDURE IF EXISTS add_operation_constraint//
CREATE PROCEDURE add_operation_constraint(
    IN p_template_id INT,
    IN p_from_operation_id INT,
    IN p_to_operation_id INT,
    IN p_constraint_type TINYINT,
    IN p_share_personnel BOOLEAN,
    IN p_lag_time DECIMAL(5,2),
    IN p_constraint_name VARCHAR(100)
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
    -- 简化版本：检查直接反向约束
    IF EXISTS (
        SELECT 1 FROM operation_constraints 
        WHERE template_id = p_template_id 
        AND from_operation_id = p_to_operation_id 
        AND to_operation_id = p_from_operation_id
    ) THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = '检测到循环依赖';
    END IF;
    
    -- 插入约束
    INSERT INTO operation_constraints (
        template_id,
        from_operation_id,
        to_operation_id,
        constraint_type,
        share_personnel,
        lag_time,
        constraint_name
    ) VALUES (
        p_template_id,
        p_from_operation_id,
        p_to_operation_id,
        p_constraint_type,
        p_share_personnel,
        p_lag_time,
        p_constraint_name
    ) ON DUPLICATE KEY UPDATE
        constraint_type = p_constraint_type,
        share_personnel = p_share_personnel,
        lag_time = p_lag_time,
        constraint_name = p_constraint_name,
        updated_at = CURRENT_TIMESTAMP;
    
    COMMIT;
    
    SELECT 'Constraint added successfully' AS result;
END//

DELIMITER ;

-- ====================================
-- 9. 创建人员需求计算函数
-- ====================================
DELIMITER //

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
    JOIN operations op ON osgr.operation_id = op.id
    WHERE osgr.template_id = p_template_id
    AND osgr.share_group_id = p_share_group_id;
    
    RETURN IFNULL(v_max_requirement, 0);
END//

DELIMITER ;

-- ====================================
-- 10. 输出执行结果
-- ====================================
SELECT 
    'Database schema extended successfully' AS message,
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'aps_system' 
     AND table_name IN ('operation_constraints', 'personnel_share_groups', 'operation_share_group_relations')) AS tables_created,
    (SELECT COUNT(*) FROM information_schema.views 
     WHERE table_schema = 'aps_system' 
     AND table_name IN ('v_operation_constraints', 'v_personnel_share_analysis')) AS views_created;