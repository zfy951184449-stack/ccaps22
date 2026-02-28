-- Create standalone_tasks and standalone_task_qualifications tables
CREATE TABLE IF NOT EXISTS standalone_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_code VARCHAR(50) NOT NULL UNIQUE COMMENT '任务编号',
    task_name VARCHAR(200) NOT NULL COMMENT '任务名称',
    task_type ENUM('FLEXIBLE', 'RECURRING', 'AD_HOC') NOT NULL COMMENT '弹性窗口/周期性/临时',
    -- 资源需求
    required_people INT NOT NULL DEFAULT 1,
    duration_minutes INT NOT NULL COMMENT '预计工时(分钟)',
    team_id INT DEFAULT NULL COMMENT '所属部门',
    -- 时间约束
    earliest_start DATE DEFAULT NULL COMMENT '最早开始日期',
    deadline DATE NOT NULL COMMENT '截止日期',
    preferred_shift_ids JSON DEFAULT NULL COMMENT '偏好班次',
    -- 关联
    related_batch_id INT DEFAULT NULL COMMENT '关联批次',
    trigger_operation_plan_id INT DEFAULT NULL COMMENT '触发钩子：批次中具体操作计划ID',
    batch_offset_days INT DEFAULT 7 COMMENT '触发操作结束后偏移天数',
    operation_id INT DEFAULT NULL COMMENT '关联操作定义(用于继承资质)',
    -- 周期配置(仅 RECURRING)
    recurrence_rule JSON DEFAULT NULL COMMENT '{"freq":"WEEKLY","interval":1,"days":[1,3,5]}',
    -- 状态
    status ENUM('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_deadline (deadline),
    INDEX idx_team (team_id),
    INDEX idx_task_type (task_type)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '独立任务表(非批次)';
CREATE TABLE IF NOT EXISTS standalone_task_qualifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    position_number INT NOT NULL DEFAULT 1,
    qualification_id INT NOT NULL,
    min_level TINYINT NOT NULL DEFAULT 1,
    is_mandatory BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (task_id) REFERENCES standalone_tasks(id) ON DELETE CASCADE,
    INDEX idx_task (task_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '独立任务资质要求';