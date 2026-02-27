# APS Database & API Dictionary

Generated on: 2026-01-15 01:58

## Personnel & Organization

### departments
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| parent_id | INT | DEFAULT NULL | 上级部门ID |
| dept_code | VARCHAR(50) | NOT NULL UNIQUE | 部门编码 |
| dept_name | VARCHAR(100) | NOT NULL | 部门名称 |
| description | VARCHAR(255) | DEFAULT NULL | 部门描述 |
| sort_order | INT | DEFAULT 0 | 排序 |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |

### employee_reporting_relations
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键ID |
| leader_id | INT | NOT NULL | 直接上级员工ID |
| subordinate_id | INT | NOT NULL | 直接下属员工ID |

### employee_roles
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| role_code | VARCHAR(50) | NOT NULL UNIQUE | 角色编码 |
| role_name | VARCHAR(100) | NOT NULL | 角色名称 |
| description | VARCHAR(255) | DEFAULT NULL | 描述 |
| can_schedule | TINYINT(1) | NOT NULL DEFAULT 1 | 是否参与排班 |
| allowed_shift_codes | VARCHAR(255) | DEFAULT NULL | 允许的班次编码(逗号分隔) |
| default_skill_level | TINYINT | DEFAULT NULL | 默认技能等级 |

### employee_team_roles
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| is_primary | TINYINT(1) | NOT NULL DEFAULT 0 | 是否主岗 |
| effective_from | DATE | NOT NULL DEFAULT (CURRENT_DATE) | 生效开始 |
| effective_to | DATE | DEFAULT NULL | 生效结束 |

### employee_unavailability
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

### employees
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键ID |
| employee_code | VARCHAR(20) | NOT NULL UNIQUE | 工号 |
| employee_name | VARCHAR(50) | NOT NULL | 姓名 |
| department | VARCHAR(50) |  | 部门 |
| position | VARCHAR(50) |  | 岗位 |
| org_role | ENUM( | 'FRONTLINE','SHIFT_LEADER','GROUP_LEADER','TEAM_LEADER','DEPT_MANAGER') NOT NULL DEFAULT 'FRONTLINE' | 组织层级角色 |

### organization_units
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 组织单元ID |
| parent_id | INT | DEFAULT NULL | 上级单元ID |
| unit_type | ENUM( | 'DEPARTMENT','TEAM','GROUP','SHIFT') NOT NULL | 单元类型 |
| unit_code | VARCHAR(50) | DEFAULT NULL | 单元编码 |
| unit_name | VARCHAR(120) | NOT NULL | 单元名称 |
| default_shift_code | VARCHAR(50) | DEFAULT NULL | 默认班次编码 |
| sort_order | INT | DEFAULT 0 | 排序 |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |
| metadata | JSON | DEFAULT NULL | 扩展信息 |

### shifts
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

### teams
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| department_id | INT | NOT NULL | 所属部门ID |
| team_code | VARCHAR(50) | NOT NULL UNIQUE | 班组编码 |
| team_name | VARCHAR(100) | NOT NULL | 班组名称 |
| description | VARCHAR(255) | DEFAULT NULL | 描述 |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |
| default_shift_code | VARCHAR(32) | DEFAULT NULL | 默认班次编码 |

## Qualifications

### employee_qualifications
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键ID |
| employee_id | INT | NOT NULL | 人员ID |
| qualification_id | INT | NOT NULL | 资质ID |
| qualification_level | TINYINT | NOT NULL | 资质等级（1-5级） |

### operation_qualification_requirements
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 主键ID |
| operation_id | INT | NOT NULL | 操作ID |
| position_number | INT | NOT NULL | 位置编号（从1开始） |
| qualification_id | INT | NOT NULL | 资质ID |
| min_level | TINYINT | NOT NULL DEFAULT 1 | 最低等级要求（1-5级） |
| required_level | TINYINT | NOT NULL DEFAULT 1 | 要求等级（兼容旧逻辑） |
| required_count | INT | DEFAULT 1 | 该等级要求人数 |
| is_mandatory | TINYINT | DEFAULT 1 | 是否必须：1-必须，0-可选 |

### qualifications
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 资质ID |
| qualification_name | VARCHAR(100) | NOT NULL | 资质名称 |

## Process Templates

### operation_constraints
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 约束ID |
| schedule_id | INT | NOT NULL | 当前操作安排ID |
| predecessor_schedule_id | INT | NOT NULL | 前置操作安排ID |
| constraint_type | TINYINT | DEFAULT 1 | 约束类型：1-完成后开始(FS)，2-开始后开始(SS)，3-完成后完成(FF)，4-开始后完成(SF) |
| time_lag | DECIMAL(4 | ,1) DEFAULT 0 | 时间滞后（小时，可为负数） |
| constraint_level | TINYINT | DEFAULT 1 | 约束级别：1-强制，2-优选，3-建议 |
| share_personnel | TINYINT(1) | DEFAULT 0 | 是否共享人员 |
| constraint_name | VARCHAR(100) |  | 约束名称 |
| description | TEXT |  | 约束说明 |

### operation_share_group_relations
**Source**: `add_constraints_features_v2.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 关联ID |
| schedule_id | INT | NOT NULL | 操作安排ID |
| share_group_id | INT | NOT NULL | 共享组ID |
| priority | INT | DEFAULT 1 | 优先级（用于排序） |

### operations
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 操作ID |
| operation_code | VARCHAR(20) | NOT NULL UNIQUE | 操作编码 |
| operation_name | VARCHAR(100) | NOT NULL | 操作名称 |
| standard_time | DECIMAL(8 | ,2) NOT NULL | 标准耗时（小时） |
| required_people | INT | DEFAULT 1 | 所需人数 |
| description | TEXT |  | 操作描述 |

### personnel_share_groups
**Source**: `add_constraints_features_v2.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 共享组ID |
| template_id | INT | NOT NULL | 模版ID |
| group_code | VARCHAR(50) | NOT NULL | 共享组代码 |
| group_name | VARCHAR(100) | NOT NULL | 共享组名称 |
| description | TEXT |  | 描述 |
| color | VARCHAR(7) | DEFAULT '#1890ff' | 显示颜色 |

### process_stages
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 阶段ID |
| template_id | INT | NOT NULL | 模版ID |
| stage_code | VARCHAR(20) | NOT NULL | 阶段编码 |
| stage_name | VARCHAR(100) | NOT NULL | 阶段名称 |
| stage_order | INT | NOT NULL | 在模版中的顺序 |
| start_day | INT | NOT NULL | 开始天数（从day0开始，day0=第1天） |
| description | TEXT |  | 阶段描述 |

### process_templates
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 模版ID |
| template_code | VARCHAR(20) | NOT NULL UNIQUE | 模版编码 |
| template_name | VARCHAR(100) | NOT NULL | 模版名称 |
| description | TEXT |  | 模版描述 |
| total_days | INT |  | 总工期（天） |

### stage_operation_schedules
**Source**: `create_aps_database.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 安排ID |
| stage_id | INT | NOT NULL | 阶段ID |
| operation_id | INT | NOT NULL | 操作ID |
| operation_day | INT | NOT NULL | 操作相对天数（相对阶段开始的第几天，day0=阶段第1天） |
| recommended_time | DECIMAL(3 | ,1) NOT NULL | 推荐开始时间（小时，0.5粒度） |
| recommended_day_offset | TINYINT | NOT NULL DEFAULT 0 | 推荐开始时间跨日偏移（相对于operation_day） |
| window_start_time | DECIMAL(3 | ,1) NOT NULL | 窗口开始时间（小时，0.5粒度） |
| window_start_day_offset | TINYINT | NOT NULL DEFAULT 0 | 时间窗口开始跨日偏移（相对于operation_day） |
| window_end_time | DECIMAL(3 | ,1) NOT NULL | 窗口结束时间（小时，0.5粒度） |
| window_end_day_offset | TINYINT | NOT NULL DEFAULT 0 | 时间窗口结束跨日偏移（相对于operation_day） |
| operation_order | INT |  | 操作在阶段中的顺序 |

## Batch Planning

### batch_operation_constraints
**Source**: `create_batch_planning_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 批次约束ID |
| batch_plan_id | INT | NOT NULL | 批次计划ID |
| batch_operation_plan_id | INT | NOT NULL | 当前批次操作计划ID |
| predecessor_batch_operation_plan_id | INT | NOT NULL | 前置批次操作计划ID |
| constraint_type | TINYINT | DEFAULT 1 | 约束类型：1-FS,2-SS,3-FF,4-SF |
| time_lag | DECIMAL(4 | ,1) DEFAULT 0 | 时间滞后（小时，可为负数） |
| constraint_level | TINYINT | DEFAULT 1 | 约束级别：1-强制，2-优选，3-建议 |
| share_personnel | TINYINT(1) | DEFAULT 0 | 是否共享人员 |
| constraint_name | VARCHAR(100) |  | 约束名称 |
| description | TEXT |  | 约束说明 |

### batch_operation_plans
**Source**: `create_batch_planning_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 操作计划ID |
| batch_plan_id | INT | NOT NULL | 批次计划ID |
| template_schedule_id | INT | NOT NULL | 模版操作安排ID |
| operation_id | INT | NOT NULL | 操作ID |
| planned_start_datetime | DATETIME | NOT NULL | 计划开始时间 |
| planned_end_datetime | DATETIME | NOT NULL | 计划结束时间 |
| planned_duration | DECIMAL(5 | ,2) NOT NULL | 计划持续时间(小时) |
| window_start_datetime | DATETIME | NULL | 允许最早开始时间 |
| window_end_datetime | DATETIME | NULL | 允许最晚完成时间 |
| required_people | INT | NOT NULL | 计划需要人数 |
| notes | TEXT |  | 计划备注 |
| is_locked | TINYINT(1) | NOT NULL DEFAULT 0 | 是否锁定 |
| locked_by | INT | DEFAULT NULL | 锁定人ID |
| locked_at | DATETIME | DEFAULT NULL | 锁定时间 |
| lock_reason | VARCHAR(255) | DEFAULT NULL | 锁定原因 |

### batch_personnel_assignments
**Source**: `create_batch_planning_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 人员安排ID |
| batch_operation_plan_id | INT | NOT NULL | 批次操作计划ID |
| employee_id | INT | NOT NULL | 员工ID |
| role | ENUM( | 'OPERATOR', 'SUPERVISOR', 'QC_INSPECTOR', 'ASSISTANT') DEFAULT 'OPERATOR' | 计划操作角色 |
| is_primary | BOOLEAN | DEFAULT FALSE | 是否主要负责人 |
| qualification_level | INT |  | 员工相关资质等级 |
| qualification_match_score | DECIMAL(3 | ,1) | 资质匹配度评分(0-10) |
| assignment_status | ENUM( | 'PLANNED', 'CONFIRMED', 'CANCELLED') DEFAULT 'PLANNED' | 安排状态 |
| confirmed_at | TIMESTAMP | NULL | 确认时间 |
| notes | TEXT |  | 安排备注 |

### production_batch_plans
**Source**: `create_batch_planning_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| id | INT | PRIMARY KEY AUTO_INCREMENT | 批次计划ID |
| batch_code | VARCHAR(50) | NOT NULL UNIQUE | 批次编号 |
| batch_name | VARCHAR(100) | NOT NULL | 批次名称 |
| template_id | INT | NOT NULL | 工艺模版ID |
| project_code | VARCHAR(50) |  | 项目代码 |
| planned_start_date | DATE | NOT NULL | 计划开始日期（用户输入） |
| planned_end_date | DATE |  | 计划结束日期（将通过触发器计算） |
| template_duration_days | INT |  | 模版标准工期（天） |
| plan_status | ENUM( | 'DRAFT', 'PLANNED', 'APPROVED', 'CANCELLED') DEFAULT 'DRAFT' | 计划状态 |
| description | TEXT |  | 批次描述 |
| notes | TEXT |  | 备注信息 |

## Scheduling Core

### employee_schedule_history
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| employee_id | INT | NOT NULL | 员工ID |
| schedule_date | DATE | NOT NULL | 排班日期 |
| shift_type_id | INT | NOT NULL | 班次类型ID |
| start_time | TIME | NOT NULL | 班次开始时间 |
| end_time | TIME | NOT NULL | 班次结束时间 |
| work_hours | DECIMAL(4 | ,2) NOT NULL | 工作时长(小时) |
| overtime_hours | DECIMAL(4 | ,2) DEFAULT 0.00 | 加班时长(小时) |
| status | ENUM( | 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED' | 排班状态 |
| notes | TEXT |  | 备注信息 |
| created_by | INT |  | 创建人ID |
| updated_by | INT |  | 更新人ID |

### employee_shift_limits
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| quarter_standard_hours | DECIMAL(6 | ,2) DEFAULT NULL | 季度标准工时(动态,可为空使用系统默认) |
| month_standard_hours | DECIMAL(6 | ,2) DEFAULT NULL | 月度参考工时 |
| max_daily_hours | DECIMAL(4 | ,2) NOT NULL DEFAULT 11.00 | 每日工时上限 |
| max_consecutive_days | INT | NOT NULL DEFAULT 6 | 连续上班天数上限 |
| max_weekly_hours | DECIMAL(5 | ,2) DEFAULT NULL | 周工时上限(可选) |

### employee_shift_plans
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| shift_id | INT | DEFAULT NULL | 关联班次定义 (休班可为空) |
| plan_category | ENUM( | 'BASE', 'PRODUCTION', 'OVERTIME', 'REST') NOT NULL DEFAULT 'BASE' | 班次类别 |
| plan_state | ENUM( | 'PLANNED', 'CONFIRMED', 'LOCKED', 'VOID') NOT NULL DEFAULT 'PLANNED' | 排班状态 |
| plan_hours | DECIMAL(5 | ,2) DEFAULT NULL | 计划工时(折算) |
| overtime_hours | DECIMAL(5 | ,2) DEFAULT 0.00 | 加班小时 |
| is_locked | TINYINT(1) | NOT NULL DEFAULT 0 | 是否锁定 |
| locked_by | INT | DEFAULT NULL | 锁定人ID |
| locked_at | DATETIME | DEFAULT NULL | 锁定时间 |
| lock_reason | VARCHAR(255) | DEFAULT NULL | 锁定原因 |
| batch_operation_plan_id | INT | DEFAULT NULL | 关联批次操作计划 |
| is_generated | TINYINT(1) | NOT NULL DEFAULT 1 | 是否系统生成(1)或手工(0) |

### employee_shift_preferences
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| employee_id | INT | NOT NULL | 员工ID |
| shift_type_id | INT | NOT NULL | 班次类型ID |
| preference_score | INT | DEFAULT 0 | 偏好评分(-10到10) |
| is_available | BOOLEAN | DEFAULT TRUE | 是否可用 |
| notes | TEXT |  | 备注 |

### personnel_schedules
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| employee_id | INT | NOT NULL | 员工ID |
| schedule_date | DATE | NOT NULL | 排班日期 |
| shift_type_id | INT | NOT NULL | 班次类型ID |
| actual_start_time | DATETIME |  | 实际开始时间 |
| actual_end_time | DATETIME |  | 实际结束时间 |
| actual_work_hours | DECIMAL(4 | ,2) | 实际工时(小时) |
| status | ENUM( | 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED' | 排班状态 |
| is_overtime | BOOLEAN | DEFAULT FALSE | 是否加班 |
| overtime_hours | DECIMAL(4 | ,2) DEFAULT 0 | 加班时长 |
| notes | TEXT |  | 备注信息 |
| created_by | INT |  | 创建人ID |

### scheduling_conflicts
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| conflict_type | ENUM( | 'RULE_VIOLATION', 'DOUBLE_BOOKING', 'INSUFFICIENT_REST', 'OVERTIME_EXCEEDED', 'DAILY_HOURS_EXCEEDED', 'CONSECUTIVE_DAYS_EXCEEDED', 'NIGHT_SHIFT_REST_VIOLATION', 'QUARTERLY_HOURS_INSUFFICIENT', 'CROSS_DAY_CONFLICT') NOT NULL | 冲突类型 |
| employee_id | INT | NOT NULL | 员工ID |
| schedule_id | INT |  | 排班ID |
| conflict_date | DATE | NOT NULL | 冲突日期 |
| conflict_description | TEXT | NOT NULL | 冲突描述 |
| severity | ENUM( | 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM' | 严重程度 |
| is_resolved | BOOLEAN | DEFAULT FALSE | 是否已解决 |
| resolved_by | INT |  | 解决人ID |
| resolved_at | TIMESTAMP | NULL | 解决时间 |
| resolution_notes | TEXT |  | 解决方案备注 |

### scheduling_rules
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| rule_name | VARCHAR(100) | NOT NULL | 规则名称 |
| rule_type | ENUM( | 'MIN_REST_HOURS', 'MAX_CONSECUTIVE_DAYS', 'WEEKEND_REST', 'NIGHT_SHIFT_LIMIT', 'LONG_DAY_SHIFT_LIMIT', 'CROSS_DAY_SHIFT_LIMIT', 'DAILY_HOURS_LIMIT', 'OVERTIME_LIMIT') NOT NULL | 规则类型 |
| rule_value | DECIMAL(8 | ,2) NOT NULL | 规则值 |
| rule_unit | VARCHAR(20) |  | 规则单位 |
| description | TEXT |  | 规则描述 |
| is_active | BOOLEAN | DEFAULT TRUE | 是否启用 |

### shift_definitions
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| shift_code | VARCHAR(32) | NOT NULL UNIQUE | 班次编码 |
| shift_name | VARCHAR(100) | NOT NULL | 班次名称 |
| category | ENUM( | 'STANDARD', 'SPECIAL', 'TEMPORARY') NOT NULL DEFAULT 'STANDARD' | 班次类别 |
| start_time | TIME | NOT NULL | 起始时间 |
| end_time | TIME | NOT NULL | 结束时间 (跨日班次结束时间按次日时间记录) |
| is_cross_day | TINYINT(1) | NOT NULL DEFAULT 0 | 是否跨日 |
| nominal_hours | DECIMAL(5 | ,2) NOT NULL | 折算工时 |
| max_extension_hours | DECIMAL(5 | ,2) DEFAULT 0.00 | 允许延长小时数（加班前提） |
| description | TEXT |  | 说明 |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |

### shift_types
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| shift_code | VARCHAR(20) | NOT NULL UNIQUE | 班次代码 |
| shift_name | VARCHAR(50) | NOT NULL | 班次名称 |
| start_time | TIME | NOT NULL | 开始时间 |
| end_time | TIME | NOT NULL | 结束时间 |
| work_hours | DECIMAL(4 | ,2) NOT NULL | 标准工时(小时) |
| is_night_shift | BOOLEAN | DEFAULT FALSE | 是否夜班 |
| is_weekend_shift | BOOLEAN | DEFAULT FALSE | 是否周末班 |
| overtime_rate | DECIMAL(3 | ,2) DEFAULT 1.0 | 加班费率 |
| description | TEXT |  | 班次描述 |
| is_active | BOOLEAN | DEFAULT TRUE | 是否启用 |

## Calendar & Holidays

### calendar_workdays
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| calendar_date | DATE | NOT NULL UNIQUE | 日期 |
| is_workday | TINYINT(1) | NOT NULL DEFAULT 1 | 是否工作日 (1=工作日,0=休息日) |
| holiday_name | VARCHAR(100) | DEFAULT NULL | 节假日/调休名称 |
| holiday_type | ENUM( | 'LEGAL_HOLIDAY', 'WEEKEND_ADJUSTMENT', 'MAKEUP_WORK', 'WORKDAY') DEFAULT 'WORKDAY' | 节假日类型 |
| source | ENUM( | 'PRIMARY', 'SECONDARY', 'MANUAL') NOT NULL DEFAULT 'PRIMARY' | 数据来源 |
| confidence | TINYINT | UNSIGNED NOT NULL DEFAULT 100 | 可信度(0-100) |
| fetched_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 抓取时间 |
| last_verified_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 最近校验时间 |
| notes | VARCHAR(255) | DEFAULT NULL | 备注 |

### holiday_salary_config
**Source**: `add_holiday_salary_config.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| year | INT | NOT NULL | 年份 |
| calendar_date | DATE | NOT NULL | 日期 |
| holiday_name | VARCHAR(100) | NOT NULL | 节假日名称 |
| salary_multiplier | DECIMAL(3 | ,2) NOT NULL DEFAULT 3.00 | 工资倍数（3.00=3倍工资，2.00=2倍工资） |
| config_source | ENUM( | 'RULE_ENGINE', 'MANUAL', 'IMPORTED', 'API') NOT NULL DEFAULT 'RULE_ENGINE' | 配置来源 |
| config_rule | VARCHAR(255) | DEFAULT NULL | 识别规则（如：春节前4天、国庆前3天等） |
| region | VARCHAR(50) | DEFAULT NULL | 适用地区（NULL表示全国通用） |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |
| notes | TEXT |  | 备注说明 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### holiday_salary_rules
**Source**: `add_holiday_salary_config.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| rule_name | VARCHAR(100) | NOT NULL | 规则名称 |
| holiday_name | VARCHAR(100) | NOT NULL | 节假日名称 |
| rule_type | ENUM( | 'FIXED_DATE', 'LUNAR_DATE', 'RELATIVE_DATE', 'FIXED_COUNT') NOT NULL | 规则类型 |
| rule_config | JSON | NOT NULL | 规则配置（JSON格式） |
| salary_multiplier | DECIMAL(3 | ,2) NOT NULL DEFAULT 3.00 | 工资倍数 |
| priority | INT | NOT NULL DEFAULT 100 | 优先级（数字越小优先级越高） |
| is_active | TINYINT(1) | NOT NULL DEFAULT 1 | 是否启用 |
| description | TEXT |  | 规则描述 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### holiday_update_log
**Source**: `create_missing_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| update_year | INT | NOT NULL | 更新年份 |
| update_source | VARCHAR(100) | NOT NULL | 更新来源 |
| update_time | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| records_count | INT | NOT NULL | 更新记录数 |
| update_status | ENUM( | 'SUCCESS', 'FAILED', 'PARTIAL') DEFAULT 'SUCCESS' | 更新状态 |
| error_message | TEXT |  | 错误信息 |

### national_holidays
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| year | INT | NOT NULL | 年份 |
| holiday_name | VARCHAR(100) | NOT NULL | 节假日名称 |
| holiday_date | DATE | NOT NULL | 节假日日期 |
| holiday_type | ENUM( | 'LEGAL_HOLIDAY', 'WEEKEND_ADJUSTMENT', 'MAKEUP_WORK') NOT NULL | 节假日类型 |
| is_working_day | BOOLEAN | DEFAULT FALSE | 是否为工作日 |
| description | TEXT |  | 说明 |

### quarterly_standard_hours
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| year | INT | NOT NULL | 年份 |
| quarter | INT | NOT NULL | 季度(1-4) |
| total_days | INT | NOT NULL | 该季度总天数 |
| weekend_days | INT | NOT NULL | 周末天数 |
| legal_holiday_days | INT | NOT NULL | 法定节假日天数 |
| makeup_work_days | INT | NOT NULL | 调休工作日天数 |
| actual_working_days | INT | NOT NULL | 实际工作日数 |
| standard_hours | DECIMAL(5 | ,2) NOT NULL | 标准工时(实际工作日*8小时) |
| calculation_details | TEXT |  | 计算详情JSON |

## System & Metrics

### constraint_validation_cache
**Source**: `create_constraint_validation_functions.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| validation_hash | VARCHAR(64) | NOT NULL | MD5 hash of template state |

### overtime_records
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| related_operation_plan_id | INT | DEFAULT NULL | 关联批次操作计划 |

### schedule_change_log
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|
| schedule_history_id | INT | NOT NULL | 排班历史记录ID |
| change_type | ENUM( | 'CREATE', 'UPDATE', 'CANCEL', 'RESCHEDULE', 'STATUS_CHANGE') NOT NULL | 变更类型 |
| old_values | JSON |  | 变更前的值 |
| new_values | JSON |  | 变更后的值 |
| change_reason | VARCHAR(500) |  | 变更原因 |
| changed_by | INT | NOT NULL | 变更人ID |
| changed_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 变更时间 |
| approval_status | ENUM( | 'PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING' | 审批状态 |
| approved_by | INT |  | 审批人ID |
| approved_at | TIMESTAMP | NULL | 审批时间 |
| approval_notes | TEXT |  | 审批备注 |

### scheduling_metric_thresholds
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

### scheduling_metrics_snapshots
**Source**: `create_personnel_scheduling_tables.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

### shift_change_logs
**Source**: `update_personnel_scheduling_schema.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

### system_settings
**Source**: `add_system_settings_table.sql`

| Column | Type | Attributes | Comment |
|--------|------|------------|---------|

