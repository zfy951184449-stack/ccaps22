USE aps_system;

ALTER TABLE production_batch_plans
MODIFY COLUMN plan_status ENUM('DRAFT', 'PLANNED', 'APPROVED', 'ACTIVATED', 'COMPLETED', 'CANCELLED')
DEFAULT 'DRAFT' COMMENT '计划状态';

ALTER TABLE production_batch_plans
ADD COLUMN activated_at TIMESTAMP NULL COMMENT '激活时间',
ADD COLUMN activated_by INT NULL COMMENT '激活操作人',
ADD COLUMN completed_at TIMESTAMP NULL COMMENT '完成时间',
ADD COLUMN batch_color VARCHAR(7) NULL COMMENT '批次显示颜色(用于日历区分)';

CREATE TABLE IF NOT EXISTS personnel_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    schedule_date DATE NOT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_personnel_schedules_employee_date (employee_id, schedule_date),
    CONSTRAINT fk_personnel_schedules_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CI最小人员排班表';

DROP PROCEDURE IF EXISTS activate_batch_plan;

DELIMITER //

CREATE PROCEDURE activate_batch_plan(
    IN p_batch_plan_id INT,
    IN p_activated_by INT,
    IN p_batch_color VARCHAR(7)
)
BEGIN
    DECLARE v_current_status VARCHAR(20);

    SELECT plan_status INTO v_current_status
    FROM production_batch_plans
    WHERE id = p_batch_plan_id;

    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '批次计划不存在';
    END IF;

    IF v_current_status != 'DRAFT' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '只有草稿状态的批次才能激活';
    END IF;

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
END//

DELIMITER ;
