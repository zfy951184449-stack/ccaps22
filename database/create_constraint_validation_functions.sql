-- ====================================
-- 约束验证系统数据库函数
-- 版本: v1.0
-- 创建日期: 2024-12-22
-- ====================================

USE aps_system;

-- ====================================
-- 1. 单约束验证函数
-- ====================================
DELIMITER //

DROP FUNCTION IF EXISTS validate_single_constraint//

CREATE FUNCTION validate_single_constraint(
    p_constraint_type INT,
    p_predecessor_start DATETIME,
    p_predecessor_end DATETIME,
    p_successor_start DATETIME,
    p_successor_end DATETIME,
    p_successor_window_start TIME,
    p_successor_window_end TIME,
    p_lag_time DECIMAL(5,2)
) RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_is_valid BOOLEAN DEFAULT TRUE;
    DECLARE v_violation_type VARCHAR(50) DEFAULT '';
    DECLARE v_message TEXT DEFAULT '';
    DECLARE v_expected_time DATETIME DEFAULT NULL;
    DECLARE v_result JSON;
    
    -- 基础约束验证
    CASE p_constraint_type
        WHEN 1 THEN -- FS (Finish-to-Start)
            SET v_expected_time = ADDTIME(p_predecessor_end, SEC_TO_TIME(p_lag_time * 3600));
            IF p_successor_start < v_expected_time THEN
                SET v_is_valid = FALSE;
                SET v_violation_type = 'FS_CONSTRAINT_VIOLATION';
                SET v_message = CONCAT('后续操作开始时间早于前置操作完成时间 + 延迟时间。预期最早开始时间: ', v_expected_time);
            END IF;
            
        WHEN 2 THEN -- SS (Start-to-Start)
            SET v_expected_time = ADDTIME(p_predecessor_start, SEC_TO_TIME(p_lag_time * 3600));
            IF p_successor_start < v_expected_time THEN
                SET v_is_valid = FALSE;
                SET v_violation_type = 'SS_CONSTRAINT_VIOLATION';
                SET v_message = CONCAT('后续操作开始时间早于前置操作开始时间 + 延迟时间。预期最早开始时间: ', v_expected_time);
            END IF;
            
        WHEN 3 THEN -- FF (Finish-to-Finish)
            SET v_expected_time = ADDTIME(p_predecessor_end, SEC_TO_TIME(p_lag_time * 3600));
            IF p_successor_end < v_expected_time THEN
                SET v_is_valid = FALSE;
                SET v_violation_type = 'FF_CONSTRAINT_VIOLATION';
                SET v_message = CONCAT('后续操作完成时间早于前置操作完成时间 + 延迟时间。预期最早完成时间: ', v_expected_time);
            END IF;
            
        WHEN 4 THEN -- SF (Start-to-Finish)
            SET v_expected_time = ADDTIME(p_predecessor_start, SEC_TO_TIME(p_lag_time * 3600));
            IF p_successor_end < v_expected_time THEN
                SET v_is_valid = FALSE;
                SET v_violation_type = 'SF_CONSTRAINT_VIOLATION';
                SET v_message = CONCAT('后续操作完成时间早于前置操作开始时间 + 延迟时间。预期最早完成时间: ', v_expected_time);
            END IF;
    END CASE;
    
    -- 窗口时间验证（仅在基础约束通过时检查）
    IF v_is_valid THEN
        -- 检查后续操作是否在其时间窗口内
        SET @successor_time = TIME(p_successor_start);
        IF @successor_time < p_successor_window_start OR @successor_time > p_successor_window_end THEN
            SET v_is_valid = FALSE;
            SET v_violation_type = 'WINDOW_TIME_CONFLICT';
            SET v_message = CONCAT('操作开始时间 ', @successor_time, ' 不在允许的时间窗口 ', 
                                 p_successor_window_start, '-', p_successor_window_end, ' 内');
        END IF;
    END IF;
    
    -- 构建返回结果
    SET v_result = JSON_OBJECT(
        'is_valid', v_is_valid,
        'violation_type', v_violation_type,
        'message', v_message,
        'expected_time', IFNULL(DATE_FORMAT(v_expected_time, '%Y-%m-%d %H:%i:%s'), NULL)
    );
    
    RETURN v_result;
END//

-- ====================================
-- 2. 操作多约束验证函数
-- ====================================
DROP FUNCTION IF EXISTS validate_operation_constraints//

CREATE FUNCTION validate_operation_constraints(
    p_template_id INT,
    p_schedule_id INT,
    p_planned_start DATETIME,
    p_planned_end DATETIME,
    p_window_start TIME,
    p_window_end TIME
) RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_constraint_id INT;
    DECLARE v_constraint_type INT;
    DECLARE v_lag_time DECIMAL(5,2);
    DECLARE v_pred_start DATETIME;
    DECLARE v_pred_end DATETIME;
    DECLARE v_pred_window_start TIME;
    DECLARE v_pred_window_end TIME;
    DECLARE v_validation_result JSON;
    DECLARE v_is_valid BOOLEAN DEFAULT TRUE;
    DECLARE v_violations JSON DEFAULT JSON_ARRAY();
    DECLARE v_final_result JSON;
    
    -- 游标：获取该操作的所有前置约束
    DECLARE constraint_cursor CURSOR FOR
        SELECT 
            oc.id,
            oc.constraint_type,
            oc.time_lag,
            -- 计算前置操作的实际时间
            ADDTIME(
                DATE_ADD(DATE('2024-01-01'), INTERVAL ((ps1.start_day + sos1.operation_day)) DAY),
                SEC_TO_TIME(sos1.recommended_time * 3600)
            ) as pred_start_time,
            ADDTIME(
                ADDTIME(
                    DATE_ADD(DATE('2024-01-01'), INTERVAL ((ps1.start_day + sos1.operation_day)) DAY),
                    SEC_TO_TIME(sos1.recommended_time * 3600)
                ),
                SEC_TO_TIME(o1.standard_time * 3600)
            ) as pred_end_time,
            sos1.window_start_time,
            sos1.window_end_time
        FROM operation_constraints oc
        JOIN stage_operation_schedules sos1 ON oc.predecessor_schedule_id = sos1.id
        JOIN stage_operation_schedules sos2 ON oc.schedule_id = sos2.id
        JOIN process_stages ps1 ON sos1.stage_id = ps1.id
        JOIN process_stages ps2 ON sos2.stage_id = ps2.id
        JOIN operations o1 ON sos1.operation_id = o1.id
        WHERE ps1.template_id = p_template_id 
        AND ps2.template_id = p_template_id
        AND oc.schedule_id = p_schedule_id;
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN constraint_cursor;
    
    constraint_loop: LOOP
        FETCH constraint_cursor INTO 
            v_constraint_id, v_constraint_type, v_lag_time,
            v_pred_start, v_pred_end, v_pred_window_start, v_pred_window_end;
            
        IF done THEN
            LEAVE constraint_loop;
        END IF;
        
        -- 验证单个约束
        SET v_validation_result = validate_single_constraint(
            v_constraint_type,
            v_pred_start,
            v_pred_end,
            p_planned_start,
            p_planned_end,
            p_window_start,
            p_window_end,
            v_lag_time
        );
        
        -- 检查验证结果
        IF JSON_EXTRACT(v_validation_result, '$.is_valid') = FALSE THEN
            SET v_is_valid = FALSE;
            SET v_violations = JSON_ARRAY_APPEND(v_violations, '$', JSON_OBJECT(
                'constraint_id', v_constraint_id,
                'validation_result', v_validation_result
            ));
        END IF;
        
    END LOOP;
    
    CLOSE constraint_cursor;
    
    -- 构建最终结果
    SET v_final_result = JSON_OBJECT(
        'is_valid', v_is_valid,
        'total_constraints', JSON_LENGTH(v_violations),
        'violations', v_violations
    );
    
    RETURN v_final_result;
END//

-- ====================================
-- 3. 模板整体约束验证函数
-- ====================================
DROP FUNCTION IF EXISTS validate_template_constraints//

CREATE FUNCTION validate_template_constraints(p_template_id INT) 
RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_schedule_id INT;
    DECLARE v_planned_start DATETIME;
    DECLARE v_planned_end DATETIME;
    DECLARE v_window_start TIME;
    DECLARE v_window_end TIME;
    DECLARE v_operation_name VARCHAR(100);
    DECLARE v_validation_result JSON;
    DECLARE v_is_valid BOOLEAN DEFAULT TRUE;
    DECLARE v_operation_results JSON DEFAULT JSON_ARRAY();
    DECLARE v_final_result JSON;
    
    -- 游标：获取模板中的所有操作
    DECLARE operation_cursor CURSOR FOR
        SELECT 
            sos.id,
            sos.operation_id,
            o.operation_name,
            -- 计算计划时间（基于模板）
            ADDTIME(
                DATE_ADD(DATE('2024-01-01'), INTERVAL ((ps.start_day + sos.operation_day)) DAY),
                SEC_TO_TIME(sos.recommended_time * 3600)
            ) as planned_start,
            ADDTIME(
                ADDTIME(
                    DATE_ADD(DATE('2024-01-01'), INTERVAL ((ps.start_day + sos.operation_day)) DAY),
                    SEC_TO_TIME(sos.recommended_time * 3600)
                ),
                SEC_TO_TIME(o.standard_time * 3600)
            ) as planned_end,
            sos.window_start_time,
            sos.window_end_time
        FROM stage_operation_schedules sos
        JOIN process_stages ps ON sos.stage_id = ps.id
        JOIN operations o ON sos.operation_id = o.id
        WHERE ps.template_id = p_template_id;
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    OPEN operation_cursor;
    
    operation_loop: LOOP
        FETCH operation_cursor INTO 
            v_schedule_id, v_operation_name, v_operation_name,
            v_planned_start, v_planned_end, v_window_start, v_window_end;
            
        IF done THEN
            LEAVE operation_loop;
        END IF;
        
        -- 验证该操作的所有约束
        SET v_validation_result = validate_operation_constraints(
            p_template_id,
            v_schedule_id,
            v_planned_start,
            v_planned_end,
            v_window_start,
            v_window_end
        );
        
        -- 记录验证结果
        SET v_operation_results = JSON_ARRAY_APPEND(v_operation_results, '$', JSON_OBJECT(
            'schedule_id', v_schedule_id,
            'operation_name', v_operation_name,
            'validation_result', v_validation_result
        ));
        
        -- 如果有违规，标记整体为无效
        IF JSON_EXTRACT(v_validation_result, '$.is_valid') = FALSE THEN
            SET v_is_valid = FALSE;
        END IF;
        
    END LOOP;
    
    CLOSE operation_cursor;
    
    -- 构建最终结果
    SET v_final_result = JSON_OBJECT(
        'template_id', p_template_id,
        'is_valid', v_is_valid,
        'total_operations', JSON_LENGTH(v_operation_results),
        'operation_results', v_operation_results
    );
    
    RETURN v_final_result;
END//

DELIMITER ;

-- ====================================
-- 4. 创建约束验证结果表（可选，用于缓存结果）
-- ====================================
CREATE TABLE IF NOT EXISTS constraint_validation_cache (
    id INT PRIMARY KEY AUTO_INCREMENT,
    template_id INT NOT NULL,
    validation_hash VARCHAR(64) NOT NULL COMMENT 'MD5 hash of template state',
    validation_result JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_template_hash (template_id, validation_hash),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='约束验证结果缓存表';

-- ====================================
-- 5. 测试验证函数
-- ====================================

-- 测试单约束验证
SELECT 'Testing single constraint validation' as test_type;
SELECT validate_single_constraint(
    1, -- FS constraint
    '2024-01-01 10:00:00', -- predecessor start
    '2024-01-01 12:00:00', -- predecessor end  
    '2024-01-01 13:00:00', -- successor start
    '2024-01-01 15:00:00', -- successor end
    '09:00:00', -- successor window start
    '17:00:00', -- successor window end
    1.0 -- lag time (1 hour)
) as validation_result;

-- 测试模板验证（如果有模板数据）
-- SELECT 'Testing template validation' as test_type;
-- SELECT validate_template_constraints(1) as template_validation;

SELECT 'Constraint validation functions created successfully' as status;