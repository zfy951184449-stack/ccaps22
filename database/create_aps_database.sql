-- APS系统数据库创建脚本
-- 版本: v2.3
-- 创建日期: 2025-09-15
-- 包含模块: 人员库、操作库、工艺模版库、约束管理

-- 创建数据库
CREATE DATABASE IF NOT EXISTS aps_system 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE aps_system;

-- 1. 人员基础信息表 (employees)
CREATE TABLE employees (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    employee_code VARCHAR(20) NOT NULL UNIQUE COMMENT '工号',
    employee_name VARCHAR(50) NOT NULL COMMENT '姓名',
    department VARCHAR(50) COMMENT '部门',
    position VARCHAR(50) COMMENT '岗位',
    org_role ENUM('FRONTLINE','SHIFT_LEADER','GROUP_LEADER','TEAM_LEADER','DEPT_MANAGER') NOT NULL DEFAULT 'FRONTLINE' COMMENT '组织层级角色',
    
    INDEX idx_employee_code (employee_code),
    INDEX idx_employee_name (employee_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员基础信息表';

CREATE TABLE employee_reporting_relations (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    leader_id INT NOT NULL COMMENT '直接上级员工ID',
    subordinate_id INT NOT NULL COMMENT '直接下属员工ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_leader_subordinate (leader_id, subordinate_id),
    UNIQUE KEY uk_reporting_subordinate (subordinate_id),
    INDEX idx_reporting_leader (leader_id),
    INDEX idx_reporting_subordinate (subordinate_id),
    CONSTRAINT fk_reporting_leader_base FOREIGN KEY (leader_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_reporting_subordinate_base FOREIGN KEY (subordinate_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工汇报关系表';

CREATE TABLE organization_units (
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

CREATE TABLE employee_org_membership (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '员工组织归属ID',
    employee_id INT NOT NULL COMMENT '员工ID',
    unit_id INT NOT NULL COMMENT '组织单元ID',
    assignment_type ENUM('PRIMARY','SECONDARY') NOT NULL DEFAULT 'PRIMARY' COMMENT '归属类型',
    role_at_unit ENUM('LEADER','MEMBER','SUPPORT') NOT NULL DEFAULT 'MEMBER' COMMENT '在单元内角色',
    start_date DATE DEFAULT NULL COMMENT '生效日期',
    end_date DATE DEFAULT NULL COMMENT '结束日期',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否有效',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employee_unit_assignment (employee_id, unit_id, assignment_type),
    INDEX idx_membership_unit (unit_id),
    INDEX idx_membership_employee (employee_id),
    CONSTRAINT fk_membership_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_unit FOREIGN KEY (unit_id) REFERENCES organization_units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工与组织单元归属关系';

-- 2. 资质信息表 (qualifications)
CREATE TABLE qualifications (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '资质ID',
    qualification_name VARCHAR(100) NOT NULL COMMENT '资质名称'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资质信息表';

-- 3. 人员资质表 (employee_qualifications)
CREATE TABLE employee_qualifications (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    employee_id INT NOT NULL COMMENT '人员ID',
    qualification_id INT NOT NULL COMMENT '资质ID',
    qualification_level TINYINT NOT NULL COMMENT '资质等级（1-5级）',
    
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_qualification_id (qualification_id),
    INDEX idx_qualification_level (qualification_level),
    UNIQUE KEY uk_emp_qual (employee_id, qualification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员资质表';

-- 4. 操作信息表 (operations)
CREATE TABLE operations (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '操作ID',
    operation_code VARCHAR(20) NOT NULL UNIQUE COMMENT '操作编码',
    operation_name VARCHAR(100) NOT NULL COMMENT '操作名称',
    standard_time DECIMAL(8,2) NOT NULL COMMENT '标准耗时（小时）',
    required_people INT DEFAULT 1 COMMENT '所需人数',
    description TEXT COMMENT '操作描述',
    
    INDEX idx_operation_code (operation_code),
    INDEX idx_operation_name (operation_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作信息表';

-- 5. 操作资质要求表 (operation_qualification_requirements)
CREATE TABLE operation_qualification_requirements (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    qualification_id INT NOT NULL COMMENT '资质ID',
    required_level TINYINT NOT NULL COMMENT '要求等级（1-5级）',
    required_count INT DEFAULT 1 COMMENT '该等级要求人数',
    is_mandatory TINYINT DEFAULT 1 COMMENT '是否必须：1-必须，0-可选',
    
    FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE,
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id),
    INDEX idx_operation_id (operation_id),
    INDEX idx_qualification_id (qualification_id),
    INDEX idx_required_level (required_level),
    INDEX idx_required_count (required_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作资质要求表';

-- 6. 工艺模版表 (process_templates)
CREATE TABLE process_templates (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '模版ID',
    template_code VARCHAR(20) NOT NULL UNIQUE COMMENT '模版编码',
    template_name VARCHAR(100) NOT NULL COMMENT '模版名称',
    description TEXT COMMENT '模版描述',
    total_days INT COMMENT '总工期（天）',
    
    INDEX idx_template_code (template_code),
    INDEX idx_template_name (template_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺模版表';

-- 7. 工艺阶段表 (process_stages)
CREATE TABLE process_stages (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '阶段ID',
    template_id INT NOT NULL COMMENT '模版ID',
    stage_code VARCHAR(20) NOT NULL COMMENT '阶段编码',
    stage_name VARCHAR(100) NOT NULL COMMENT '阶段名称',
    stage_order INT NOT NULL COMMENT '在模版中的顺序',
    start_day INT NOT NULL COMMENT '开始天数（从day0开始，day0=第1天）',
    description TEXT COMMENT '阶段描述',
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    INDEX idx_template_id (template_id),
    INDEX idx_stage_order (stage_order),
    INDEX idx_start_day (start_day),
    UNIQUE KEY uk_template_stage_order (template_id, stage_order),
    UNIQUE KEY uk_template_stage_code (template_id, stage_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺阶段表';

-- 8. 阶段操作安排表 (stage_operation_schedules)
CREATE TABLE stage_operation_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '安排ID',
    stage_id INT NOT NULL COMMENT '阶段ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    operation_day INT NOT NULL COMMENT '操作相对天数（相对阶段开始的第几天，day0=阶段第1天）',
    recommended_time DECIMAL(3,1) NOT NULL COMMENT '推荐开始时间（小时，0.5粒度）',
    window_start_time DECIMAL(3,1) NOT NULL COMMENT '窗口开始时间（小时，0.5粒度）',
    window_end_time DECIMAL(3,1) NOT NULL COMMENT '窗口结束时间（小时，0.5粒度）',
    operation_order INT COMMENT '操作在阶段中的顺序',
    
    FOREIGN KEY (stage_id) REFERENCES process_stages(id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    INDEX idx_stage_id (stage_id),
    INDEX idx_operation_id (operation_id),
    INDEX idx_operation_day (operation_day),
    INDEX idx_recommended_time (recommended_time),
    INDEX idx_operation_order (operation_order),
    UNIQUE KEY uk_stage_operation_order (stage_id, operation_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='阶段操作安排表';

-- 9. 操作约束条件表 (operation_constraints)
CREATE TABLE operation_constraints (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '约束ID',
    schedule_id INT NOT NULL COMMENT '当前操作安排ID',
    predecessor_schedule_id INT NOT NULL COMMENT '前置操作安排ID',
    constraint_type TINYINT DEFAULT 1 COMMENT '约束类型：1-完成后开始(FS)，2-开始后开始(SS)，3-完成后完成(FF)，4-开始后完成(SF)',
    time_lag DECIMAL(4,1) DEFAULT 0 COMMENT '时间滞后（小时，可为负数）',
    constraint_level TINYINT DEFAULT 1 COMMENT '约束级别：1-强制，2-优选，3-建议',
    share_personnel TINYINT(1) DEFAULT 0 COMMENT '是否共享人员',
    constraint_name VARCHAR(100) COMMENT '约束名称',
    description TEXT COMMENT '约束说明',

    FOREIGN KEY (schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (predecessor_schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_predecessor_schedule_id (predecessor_schedule_id),
    INDEX idx_constraint_type (constraint_type),
    INDEX idx_constraint_level (constraint_level),
    INDEX idx_share_personnel (share_personnel),
    UNIQUE KEY uk_schedule_predecessor (schedule_id, predecessor_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作约束条件表';
