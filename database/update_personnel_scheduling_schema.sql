-- Personnel scheduling core schema update aligning with comprehensive working-hours design
-- Run in aps_system schema after base APS tables (employees, batch_operation_plans, etc.) exist.

USE aps_system;

-- 1. Workday calendar sourced from primary/secondary providers with local overrides
CREATE TABLE IF NOT EXISTS calendar_workdays (
    id INT PRIMARY KEY AUTO_INCREMENT,
    calendar_date DATE NOT NULL UNIQUE COMMENT '日期',
    is_workday TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否工作日 (1=工作日,0=休息日)',
    holiday_name VARCHAR(100) DEFAULT NULL COMMENT '节假日/调休名称',
    holiday_type ENUM('LEGAL_HOLIDAY', 'WEEKEND_ADJUSTMENT', 'MAKEUP_WORK', 'WORKDAY') DEFAULT 'WORKDAY' COMMENT '节假日类型',
    source ENUM('PRIMARY', 'SECONDARY', 'MANUAL') NOT NULL DEFAULT 'PRIMARY' COMMENT '数据来源',
    confidence TINYINT UNSIGNED NOT NULL DEFAULT 100 COMMENT '可信度(0-100)',
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '抓取时间',
    last_verified_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '最近校验时间',
    notes VARCHAR(255) DEFAULT NULL COMMENT '备注',
    INDEX idx_calendar_workdays_date (calendar_date),
    INDEX idx_calendar_workdays_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作日历(含节假日与调休)';

-- 2. Standard & temporary shift definitions
CREATE TABLE IF NOT EXISTS shift_definitions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    shift_code VARCHAR(32) NOT NULL UNIQUE COMMENT '班次编码',
    shift_name VARCHAR(100) NOT NULL COMMENT '班次名称',
    category ENUM('STANDARD', 'SPECIAL', 'TEMPORARY') NOT NULL DEFAULT 'STANDARD' COMMENT '班次类别',
    start_time TIME NOT NULL COMMENT '起始时间',
    end_time TIME NOT NULL COMMENT '结束时间 (跨日班次结束时间按次日时间记录)',
    is_cross_day TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否跨日',
    nominal_hours DECIMAL(5,2) NOT NULL COMMENT '折算工时',
    max_extension_hours DECIMAL(5,2) DEFAULT 0.00 COMMENT '允许延长小时数（加班前提）',
    description TEXT COMMENT '说明',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='班次定义';

-- 3. Shift preference / limit per employee (effective ranges allow future tuning)
CREATE TABLE IF NOT EXISTS employee_shift_limits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE DEFAULT NULL,
    quarter_standard_hours DECIMAL(6,2) DEFAULT NULL COMMENT '季度标准工时(动态,可为空使用系统默认)',
    month_standard_hours DECIMAL(6,2) DEFAULT NULL COMMENT '月度参考工时',
    max_daily_hours DECIMAL(4,2) NOT NULL DEFAULT 11.00 COMMENT '每日工时上限',
    max_consecutive_days INT NOT NULL DEFAULT 6 COMMENT '连续上班天数上限',
    max_weekly_hours DECIMAL(5,2) DEFAULT NULL COMMENT '周工时上限(可选)',
    remarks VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employee_shift_limits (employee_id, effective_from),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工班次/工时限制';

-- 4. Employee shift plans (base roster + production overlay + overtime)
CREATE TABLE IF NOT EXISTS employee_shift_plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    plan_date DATE NOT NULL,
    shift_id INT DEFAULT NULL COMMENT '关联班次定义 (休班可为空)',
    plan_category ENUM('BASE', 'PRODUCTION', 'OVERTIME', 'REST') NOT NULL DEFAULT 'BASE' COMMENT '班次类别',
    plan_state ENUM('PLANNED', 'CONFIRMED', 'LOCKED', 'VOID') NOT NULL DEFAULT 'PLANNED' COMMENT '排班状态',
    plan_hours DECIMAL(5,2) DEFAULT NULL COMMENT '计划工时(折算)',
    overtime_hours DECIMAL(5,2) DEFAULT 0.00 COMMENT '加班小时',
    is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否锁定',
    locked_by INT DEFAULT NULL COMMENT '锁定人ID',
    locked_at DATETIME DEFAULT NULL COMMENT '锁定时间',
    lock_reason VARCHAR(255) DEFAULT NULL COMMENT '锁定原因',
    batch_operation_plan_id INT DEFAULT NULL COMMENT '关联批次操作计划',
    is_generated TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否系统生成(1)或手工(0)',
    created_by INT DEFAULT NULL,
    updated_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employee_plan (employee_id, plan_date, plan_category, (COALESCE(batch_operation_plan_id, -1))),
    INDEX idx_plan_employee_date (employee_id, plan_date),
    INDEX idx_plan_category (plan_category),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_id) REFERENCES shift_definitions(id),
    FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    FOREIGN KEY (updated_by) REFERENCES employees(id),
    FOREIGN KEY (locked_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工班次排班';

-- 5. Overtime capture (independent of shift plan for audit)
CREATE TABLE IF NOT EXISTS overtime_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    related_shift_plan_id INT DEFAULT NULL,
    related_operation_plan_id INT DEFAULT NULL COMMENT '关联批次操作计划',
    overtime_date DATE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    overtime_hours DECIMAL(5,2) NOT NULL,
    status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    approval_user_id INT DEFAULT NULL,
    approval_time DATETIME DEFAULT NULL,
    notes TEXT,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (related_shift_plan_id) REFERENCES employee_shift_plans(id),
    FOREIGN KEY (related_operation_plan_id) REFERENCES batch_operation_plans(id),
    FOREIGN KEY (approval_user_id) REFERENCES employees(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    INDEX idx_overtime_employee_date (employee_id, overtime_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加班记录';

-- 6. Shift change log tracking adjustments
CREATE TABLE IF NOT EXISTS shift_change_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    shift_plan_id INT NOT NULL,
    change_type ENUM('CREATE', 'UPDATE', 'DELETE', 'REASSIGN', 'STATE_CHANGE') NOT NULL,
    old_values JSON DEFAULT NULL,
    new_values JSON DEFAULT NULL,
    change_reason VARCHAR(255) DEFAULT NULL,
    changed_by INT NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approval_status ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NOT_REQUIRED',
    approved_by INT DEFAULT NULL,
    approved_at TIMESTAMP NULL,
    approval_notes TEXT,
    FOREIGN KEY (shift_plan_id) REFERENCES employee_shift_plans(id),
    FOREIGN KEY (changed_by) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES employees(id),
    INDEX idx_shift_change_plan (shift_plan_id),
    INDEX idx_shift_change_time (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='班次变更日志';

-- 7. Extend batch_personnel_assignments to link shift plan & working-hours metrics
ALTER TABLE batch_personnel_assignments
    ADD COLUMN shift_plan_id INT DEFAULT NULL COMMENT '关联班次计划ID',
    ADD COLUMN shift_code VARCHAR(32) DEFAULT NULL COMMENT '班次编码快照',
    ADD COLUMN plan_category ENUM('PRODUCTION', 'OVERTIME', 'TEMPORARY') DEFAULT 'PRODUCTION' COMMENT '排班类别',
    ADD COLUMN plan_hours DECIMAL(5,2) DEFAULT NULL COMMENT '折算工时',
    ADD COLUMN is_overtime TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否加班',
    ADD COLUMN overtime_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '加班小时数',
    ADD COLUMN assignment_origin ENUM('AUTO', 'MANUAL', 'ADJUSTED') NOT NULL DEFAULT 'AUTO' COMMENT '排班来源',
    ADD COLUMN last_validated_at DATETIME DEFAULT NULL COMMENT '上次校验时间',
    ADD INDEX idx_bpa_shift_plan (shift_plan_id),
    ADD INDEX idx_bpa_shift_code (shift_code),
    ADD INDEX idx_bpa_plan_category (plan_category),
    ADD CONSTRAINT fk_bpa_shift_plan FOREIGN KEY (shift_plan_id) REFERENCES employee_shift_plans(id),
    ADD CONSTRAINT fk_bpa_shift_code FOREIGN KEY (shift_code) REFERENCES shift_definitions(shift_code);

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shifts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    shift_code VARCHAR(50) NOT NULL,
    shift_name VARCHAR(100) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_shift_code (team_id, shift_code),
    CONSTRAINT fk_shifts_team FOREIGN KEY (team_id) REFERENCES teams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_team_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    team_id INT NOT NULL,
    role_id INT NOT NULL,
    shift_id INT DEFAULT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主岗',
    effective_from DATE NOT NULL DEFAULT (CURRENT_DATE) COMMENT '生效开始',
    effective_to DATE DEFAULT NULL COMMENT '生效结束',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_etr_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_etr_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_etr_role FOREIGN KEY (role_id) REFERENCES employee_roles(id),
    CONSTRAINT fk_etr_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
    UNIQUE KEY uk_employee_team_role (employee_id, team_id, role_id, shift_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_unavailability (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    reason_label VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_unavailability_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_unavailability_creator FOREIGN KEY (created_by) REFERENCES employees(id),
    INDEX idx_unavailability_employee (employee_id),
    INDEX idx_unavailability_range (start_datetime, end_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE employees
    ADD COLUMN department_id INT DEFAULT NULL COMMENT '所属部门',
    ADD COLUMN primary_team_id INT DEFAULT NULL COMMENT '主班组',
    ADD COLUMN primary_role_id INT DEFAULT NULL COMMENT '主角色',
    ADD COLUMN primary_shift_id INT DEFAULT NULL COMMENT '主班次',
    ADD COLUMN employment_status VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '在职状态',
    ADD COLUMN skill_level TINYINT DEFAULT NULL COMMENT '技能等级',
    ADD COLUMN hire_date DATE DEFAULT NULL COMMENT '入职日期',
    ADD INDEX idx_employees_department (department_id),
    ADD INDEX idx_employees_primary_team (primary_team_id),
    ADD INDEX idx_employees_primary_role (primary_role_id),
    ADD INDEX idx_employees_primary_shift (primary_shift_id),
    ADD CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id),
    ADD CONSTRAINT fk_employees_primary_team FOREIGN KEY (primary_team_id) REFERENCES teams(id),
    ADD CONSTRAINT fk_employees_primary_role FOREIGN KEY (primary_role_id) REFERENCES employee_roles(id),
    ADD CONSTRAINT fk_employees_primary_shift FOREIGN KEY (primary_shift_id) REFERENCES shifts(id);

ALTER TABLE employees
  ADD COLUMN shopfloor_baseline_pct DECIMAL(5,2) NULL COMMENT '车间工时基线百分比',
  ADD COLUMN shopfloor_upper_pct DECIMAL(5,2) NULL COMMENT '车间工时上限百分比',
  ADD COLUMN night_shift_eligible TINYINT(1) NOT NULL DEFAULT 0 COMMENT '能否排夜班';

CREATE TABLE IF NOT EXISTS employee_reporting_relations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    leader_id INT NOT NULL COMMENT '直接上级员工ID',
    subordinate_id INT NOT NULL COMMENT '直接下属员工ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_leader_subordinate (leader_id, subordinate_id),
    UNIQUE KEY uk_subordinate_unique (subordinate_id),
    INDEX idx_subordinate (subordinate_id),
    CONSTRAINT fk_reporting_leader FOREIGN KEY (leader_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_reporting_subordinate FOREIGN KEY (subordinate_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工汇报关系表';

CREATE TABLE IF NOT EXISTS organization_units (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '组织单元ID',
    parent_id INT DEFAULT NULL COMMENT '上级单元ID',
    unit_type ENUM('DEPARTMENT','TEAM','GROUP','SHIFT') NOT NULL COMMENT '单元类型',
    unit_code VARCHAR(50) DEFAULT NULL COMMENT '单元编码',
    unit_name VARCHAR(120) NOT NULL COMMENT '单元名称',
    default_shift_code VARCHAR(50) DEFAULT NULL COMMENT '默认班次编码',
    sort_order INT DEFAULT 0 COMMENT '排序',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    metadata JSON DEFAULT NULL COMMENT '扩展信息',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_org_parent (parent_id),
    INDEX idx_org_type (unit_type),
    UNIQUE KEY uk_org_type_code (unit_type, unit_code),
    CONSTRAINT fk_org_parent FOREIGN KEY (parent_id) REFERENCES organization_units(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一组织单元表';
