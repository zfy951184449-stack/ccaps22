-- 人员排班系统数据库表创建脚本
-- 基于 personnel_scheduling_system_design.md
USE aps_system;
-- 1. 班次类型表 (shift_types)
CREATE TABLE shift_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    shift_code VARCHAR(20) NOT NULL UNIQUE COMMENT '班次代码',
    shift_name VARCHAR(50) NOT NULL COMMENT '班次名称',
    start_time TIME NOT NULL COMMENT '开始时间',
    end_time TIME NOT NULL COMMENT '结束时间',
    work_hours DECIMAL(4, 2) NOT NULL COMMENT '标准工时(小时)',
    is_night_shift BOOLEAN DEFAULT FALSE COMMENT '是否夜班',
    is_weekend_shift BOOLEAN DEFAULT FALSE COMMENT '是否周末班',
    overtime_rate DECIMAL(3, 2) DEFAULT 1.0 COMMENT '加班费率',
    description TEXT COMMENT '班次描述',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- 2. 人员排班表 (personnel_schedules)
CREATE TABLE personnel_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_date DATE NOT NULL COMMENT '排班日期',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    actual_start_time DATETIME COMMENT '实际开始时间',
    actual_end_time DATETIME COMMENT '实际结束时间',
    actual_work_hours DECIMAL(4, 2) COMMENT '实际工时(小时)',
    status ENUM(
        'SCHEDULED',
        'CONFIRMED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
    ) DEFAULT 'SCHEDULED' COMMENT '排班状态',
    is_overtime BOOLEAN DEFAULT FALSE COMMENT '是否加班',
    overtime_hours DECIMAL(4, 2) DEFAULT 0 COMMENT '加班时长',
    notes TEXT COMMENT '备注信息',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    UNIQUE KEY unique_employee_date (employee_id, schedule_date),
    INDEX idx_schedule_date (schedule_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_shift_type_id (shift_type_id)
);
-- 3. 排班规则表 (scheduling_rules)
CREATE TABLE scheduling_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
    rule_type ENUM(
        'MIN_REST_HOURS',
        'MAX_CONSECUTIVE_DAYS',
        'WEEKEND_REST',
        'NIGHT_SHIFT_LIMIT',
        'LONG_DAY_SHIFT_LIMIT',
        'CROSS_DAY_SHIFT_LIMIT',
        'DAILY_HOURS_LIMIT',
        'OVERTIME_LIMIT'
    ) NOT NULL COMMENT '规则类型',
    rule_value DECIMAL(8, 2) NOT NULL COMMENT '规则值',
    rule_unit VARCHAR(20) COMMENT '规则单位',
    description TEXT COMMENT '规则描述',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- 4. 排班冲突记录表 (scheduling_conflicts)
CREATE TABLE scheduling_conflicts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conflict_type ENUM(
        'RULE_VIOLATION',
        'DOUBLE_BOOKING',
        'INSUFFICIENT_REST',
        'OVERTIME_EXCEEDED',
        'DAILY_HOURS_EXCEEDED',
        'CONSECUTIVE_DAYS_EXCEEDED',
        'NIGHT_SHIFT_REST_VIOLATION',
        'QUARTERLY_HOURS_INSUFFICIENT',
        'CROSS_DAY_CONFLICT'
    ) NOT NULL COMMENT '冲突类型',
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_id INT COMMENT '排班ID',
    conflict_date DATE NOT NULL COMMENT '冲突日期',
    conflict_description TEXT NOT NULL COMMENT '冲突描述',
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM' COMMENT '严重程度',
    is_resolved BOOLEAN DEFAULT FALSE COMMENT '是否已解决',
    resolved_by INT COMMENT '解决人ID',
    resolved_at TIMESTAMP NULL COMMENT '解决时间',
    resolution_notes TEXT COMMENT '解决方案备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (schedule_id) REFERENCES personnel_schedules(id),
    FOREIGN KEY (resolved_by) REFERENCES employees(id),
    INDEX idx_conflict_date (conflict_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_severity (severity)
);
-- 5. 法定节假日配置表 (national_holidays)
CREATE TABLE national_holidays (
    id INT PRIMARY KEY AUTO_INCREMENT,
    year INT NOT NULL COMMENT '年份',
    holiday_name VARCHAR(100) NOT NULL COMMENT '节假日名称',
    holiday_date DATE NOT NULL COMMENT '节假日日期',
    holiday_type ENUM(
        'LEGAL_HOLIDAY',
        'WEEKEND_ADJUSTMENT',
        'MAKEUP_WORK'
    ) NOT NULL COMMENT '节假日类型',
    is_working_day BOOLEAN DEFAULT FALSE COMMENT '是否为工作日',
    description TEXT COMMENT '说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_year_date (year, holiday_date),
    INDEX idx_year (year),
    INDEX idx_holiday_type (holiday_type)
);
-- 6. 季度标准工时配置表 (quarterly_standard_hours)
CREATE TABLE quarterly_standard_hours (
    id INT PRIMARY KEY AUTO_INCREMENT,
    year INT NOT NULL COMMENT '年份',
    quarter INT NOT NULL COMMENT '季度(1-4)',
    total_days INT NOT NULL COMMENT '该季度总天数',
    weekend_days INT NOT NULL COMMENT '周末天数',
    legal_holiday_days INT NOT NULL COMMENT '法定节假日天数',
    makeup_work_days INT NOT NULL COMMENT '调休工作日天数',
    actual_working_days INT NOT NULL COMMENT '实际工作日数',
    standard_hours DECIMAL(5, 2) NOT NULL COMMENT '标准工时(实际工作日*8小时)',
    calculation_details TEXT COMMENT '计算详情JSON',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_year_quarter (year, quarter),
    INDEX idx_year (year)
);
-- 7. 员工排班历史记录表 (employee_schedule_history)
CREATE TABLE employee_schedule_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_date DATE NOT NULL COMMENT '排班日期',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    start_time TIME NOT NULL COMMENT '班次开始时间',
    end_time TIME NOT NULL COMMENT '班次结束时间',
    work_hours DECIMAL(4, 2) NOT NULL COMMENT '工作时长(小时)',
    overtime_hours DECIMAL(4, 2) DEFAULT 0.00 COMMENT '加班时长(小时)',
    status ENUM(
        'SCHEDULED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED'
    ) DEFAULT 'SCHEDULED' COMMENT '排班状态',
    notes TEXT COMMENT '备注信息',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT COMMENT '更新人ID',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    FOREIGN KEY (updated_by) REFERENCES employees(id),
    UNIQUE KEY uk_employee_date (employee_id, schedule_date),
    INDEX idx_schedule_date (schedule_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
-- 8. 排班变更记录表 (schedule_change_log)
CREATE TABLE schedule_change_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    schedule_history_id INT NOT NULL COMMENT '排班历史记录ID',
    change_type ENUM(
        'CREATE',
        'UPDATE',
        'CANCEL',
        'RESCHEDULE',
        'STATUS_CHANGE'
    ) NOT NULL COMMENT '变更类型',
    old_values JSON COMMENT '变更前的值',
    new_values JSON COMMENT '变更后的值',
    change_reason VARCHAR(500) COMMENT '变更原因',
    changed_by INT NOT NULL COMMENT '变更人ID',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING' COMMENT '审批状态',
    approved_by INT COMMENT '审批人ID',
    approved_at TIMESTAMP NULL COMMENT '审批时间',
    approval_notes TEXT COMMENT '审批备注',
    FOREIGN KEY (schedule_history_id) REFERENCES employee_schedule_history(id),
    FOREIGN KEY (changed_by) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES employees(id),
    INDEX idx_schedule_history_id (schedule_history_id),
    INDEX idx_change_type (change_type),
    INDEX idx_changed_by (changed_by),
    INDEX idx_changed_at (changed_at),
    INDEX idx_approval_status (approval_status)
);
-- 9. 员工班次偏好表 (employee_shift_preferences)
CREATE TABLE employee_shift_preferences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    preference_score INT DEFAULT 0 COMMENT '偏好评分(-10到10)',
    is_available BOOLEAN DEFAULT TRUE COMMENT '是否可用',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    UNIQUE KEY unique_employee_shift (employee_id, shift_type_id)
);
-- 10. 节假日更新日志表 (holiday_update_log)
CREATE TABLE IF NOT EXISTS holiday_update_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    update_year INT NOT NULL COMMENT '更新年份',
    update_source VARCHAR(100) NOT NULL COMMENT '更新来源',
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
    records_count INT NOT NULL COMMENT '更新记录数',
    update_status ENUM('SUCCESS', 'FAILED', 'PARTIAL') DEFAULT 'SUCCESS' COMMENT '更新状态',
    error_message TEXT COMMENT '错误信息',
    INDEX idx_update_year (update_year),
    INDEX idx_update_time (update_time)
);
-- 组织架构：部门表
CREATE TABLE IF NOT EXISTS departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    parent_id INT DEFAULT NULL COMMENT '上级部门ID',
    dept_code VARCHAR(50) NOT NULL UNIQUE COMMENT '部门编码',
    dept_name VARCHAR(100) NOT NULL COMMENT '部门名称',
    description VARCHAR(255) DEFAULT NULL COMMENT '部门描述',
    sort_order INT DEFAULT 0 COMMENT '排序',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '部门信息表';
-- 组织架构：班组表
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    department_id INT NOT NULL COMMENT '所属部门ID',
    team_code VARCHAR(50) NOT NULL UNIQUE COMMENT '班组编码',
    team_name VARCHAR(100) NOT NULL COMMENT '班组名称',
    description VARCHAR(255) DEFAULT NULL COMMENT '描述',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    default_shift_code VARCHAR(32) DEFAULT NULL COMMENT '默认班次编码',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_teams_department FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_teams_default_shift FOREIGN KEY (default_shift_code) REFERENCES shift_definitions(shift_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '班组/车间表';
-- 组织架构：班组下的班次/小组（可选层级）
CREATE TABLE IF NOT EXISTS shifts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL COMMENT '所属班组ID',
    shift_code VARCHAR(50) NOT NULL,
    shift_name VARCHAR(100) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_shift_code (team_id, shift_code),
    CONSTRAINT fk_shifts_team FOREIGN KEY (team_id) REFERENCES teams(id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '班组下班次层级';
-- 员工角色定义
CREATE TABLE IF NOT EXISTS employee_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_code VARCHAR(50) NOT NULL UNIQUE COMMENT '角色编码',
    role_name VARCHAR(100) NOT NULL COMMENT '角色名称',
    description VARCHAR(255) DEFAULT NULL COMMENT '描述',
    can_schedule TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否参与排班',
    allowed_shift_codes VARCHAR(255) DEFAULT NULL COMMENT '允许的班次编码(逗号分隔)',
    default_skill_level TINYINT DEFAULT NULL COMMENT '默认技能等级',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '员工角色定义';
-- 员工-团队-角色关联
CREATE TABLE IF NOT EXISTS employee_team_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    team_id INT NOT NULL COMMENT '(Deprecated) 旧版团队ID',
    role_id INT NOT NULL,
    unit_id INT DEFAULT NULL COMMENT '统一组织单元ID (Team)',
    shift_id INT DEFAULT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主岗',
    effective_from DATE NOT NULL DEFAULT (CURRENT_DATE) COMMENT '生效开始',
    effective_to DATE DEFAULT NULL COMMENT '生效结束',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_etr_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_etr_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_etr_unit FOREIGN KEY (unit_id) REFERENCES organization_units(id),
    CONSTRAINT fk_etr_role FOREIGN KEY (role_id) REFERENCES employee_roles(id),
    CONSTRAINT fk_etr_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
    UNIQUE KEY uk_employee_team_role (
        employee_id,
        team_id,
        role_id,
        shift_id,
        effective_from
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '员工与团队角色关联';
-- 员工不可用日历
CREATE TABLE IF NOT EXISTS employee_unavailability (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    reason_code VARCHAR(50) NOT NULL COMMENT '原因编码',
    reason_label VARCHAR(100) NOT NULL COMMENT '原因描述',
    category VARCHAR(50) DEFAULT NULL COMMENT '类别，如培训/休假/审计',
    notes VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_unavailability_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_unavailability_creator FOREIGN KEY (created_by) REFERENCES employees(id),
    INDEX idx_unavailability_employee (employee_id),
    INDEX idx_unavailability_range (start_datetime, end_datetime)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '员工不可用日历';
-- 员工表字段扩展
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS department_id INT DEFAULT NULL COMMENT '(Deprecated) 所属部门',
    ADD COLUMN IF NOT EXISTS primary_team_id INT DEFAULT NULL COMMENT '(Deprecated) 主班组',
    ADD COLUMN IF NOT EXISTS unit_id INT DEFAULT NULL COMMENT '统一组织单元ID',
    ADD COLUMN IF NOT EXISTS primary_role_id INT DEFAULT NULL COMMENT '主角色',
    ADD COLUMN IF NOT EXISTS primary_shift_id INT DEFAULT NULL COMMENT '主班次',
    ADD COLUMN IF NOT EXISTS employment_status VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '在职状态',
    ADD COLUMN IF NOT EXISTS skill_level TINYINT DEFAULT NULL COMMENT '技能等级',
    ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT NULL COMMENT '入职日期',
    ADD INDEX idx_employees_department (department_id),
    ADD INDEX idx_employees_primary_team (primary_team_id),
    ADD INDEX idx_employees_unit (unit_id),
    ADD INDEX idx_employees_primary_role (primary_role_id),
    ADD INDEX idx_employees_primary_shift (primary_shift_id),
    ADD CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
    ADD CONSTRAINT fk_employees_primary_team FOREIGN KEY (primary_team_id) REFERENCES teams(id),
    ADD CONSTRAINT fk_employees_unit FOREIGN KEY (unit_id) REFERENCES organization_units(id),
    ADD CONSTRAINT fk_employees_primary_role FOREIGN KEY (primary_role_id) REFERENCES employee_roles(id),
    ADD CONSTRAINT fk_employees_primary_shift FOREIGN KEY (primary_shift_id) REFERENCES shifts(id);
-- Scheduling metrics snapshots
CREATE TABLE IF NOT EXISTS scheduling_metrics_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    period_type ENUM('MONTHLY', 'QUARTERLY') NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    overall_score INT NOT NULL,
    grade ENUM('EXCELLENT', 'GOOD', 'WARNING', 'CRITICAL') NOT NULL,
    metrics_json JSON NOT NULL,
    source ENUM('AUTO_PLAN', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_period (period_type, period_start, period_end)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
CREATE TABLE IF NOT EXISTS scheduling_metric_thresholds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    metric_id VARCHAR(128) NOT NULL,
    green_threshold VARCHAR(64) NOT NULL,
    yellow_threshold VARCHAR(64) NULL,
    red_threshold VARCHAR(64) NULL,
    weight DECIMAL(5, 2) NOT NULL DEFAULT 1.0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_metric_id (metric_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;